/**
 * User Profile Memory Service
 *
 * Stores personal information about users that agents learn over time.
 * This creates a persistent profile that helps agents remember who they're talking to.
 *
 * Information stored:
 * - Name, location, timezone
 * - Interests, hobbies, preferences
 * - Important facts learned from conversations
 * - Communication style preferences
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '@/lib/db';
import { adminSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Configuration
const PROFILE_BASE_DIR = process.env.PROFILE_DIR || path.join(process.cwd(), 'data', 'profiles');
const PROFILE_FILENAME = 'user_profile.json';
const MAX_FACTS = 100; // Maximum facts to store per user

export interface UserFact {
  text: string;
  category: 'personal' | 'preference' | 'context' | 'relationship' | 'other';
  confidence: 'high' | 'medium' | 'low';
  learnedAt: string;
  source?: string; // conversationId where this was learned
}

export interface UserProfile {
  // Basic info
  name?: string;
  nickname?: string;
  location?: string;
  timezone?: string;
  language?: string;

  // Personal
  occupation?: string;
  company?: string;
  interests?: string[];
  hobbies?: string[];

  // Preferences
  communicationStyle?: 'formal' | 'casual' | 'friendly' | 'professional';
  preferredName?: string; // What they want to be called
  topics_to_avoid?: string[];

  // Learned facts
  facts: UserFact[];

  // Metadata
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Get the profile directory for a user
 */
function getUserProfileDir(userId: string): string {
  return path.join(PROFILE_BASE_DIR, userId);
}

/**
 * Ensure user profile directory exists
 */
async function ensureProfileDir(userId: string): Promise<string> {
  const profileDir = getUserProfileDir(userId);
  try {
    await fs.mkdir(profileDir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.error('[UserProfile] Failed to create directory:', error);
    }
  }
  return profileDir;
}

/**
 * Get the path to the profile file
 */
function getProfilePath(userId: string): string {
  return path.join(getUserProfileDir(userId), PROFILE_FILENAME);
}

/**
 * Create a new empty profile
 */
function createEmptyProfile(): UserProfile {
  return {
    facts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function inferTimezoneFromLocation(location?: string): string | undefined {
  if (!location) return undefined;

  const normalized = location.toLowerCase();
  const ukPatterns = [
    /\b(uk|u\.k\.|united kingdom|great britain|britain|england|scotland|wales|northern ireland)\b/i,
    /\b(london|manchester|birmingham|leeds|liverpool|bristol|sheffield|edinburgh|glasgow|cardiff|belfast|nottingham|derby|leicester|york|newcastle|southampton|portsmouth|oxford|cambridge|norwich|plymouth|exeter|reading)\b/i,
    /\b(derbyshire|nottinghamshire|leicestershire|lincolnshire|yorkshire|lancashire|cheshire|kent|surrey|sussex|essex|cornwall|devon)\b/i,
  ];

  if (ukPatterns.some((pattern) => pattern.test(normalized))) {
    return 'Europe/London';
  }

  return undefined;
}

/**
 * Read user profile
 */
export async function getUserProfile(userId: string): Promise<UserProfile> {
  try {
    const profilePath = getProfilePath(userId);
    const content = await fs.readFile(profilePath, 'utf-8');
    return JSON.parse(content) as UserProfile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyProfile();
    }
    console.error('[UserProfile] Failed to read profile:', error);
    return createEmptyProfile();
  }
}

/**
 * Save user profile
 */
export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  await ensureProfileDir(userId);
  const profilePath = getProfilePath(userId);
  profile.updatedAt = new Date().toISOString();
  profile.version = (profile.version || 0) + 1;
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  console.log(`[UserProfile] Saved profile for user ${userId.slice(0, 8)}`);
}

/**
 * Update specific fields in the profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Omit<UserProfile, 'facts' | 'createdAt' | 'updatedAt' | 'version'>>
): Promise<UserProfile> {
  const profile = await getUserProfile(userId);
  Object.assign(profile, updates);
  await saveUserProfile(userId, profile);
  return profile;
}

/**
 * Add a new fact to the profile
 */
export async function addUserFact(
  userId: string,
  fact: Omit<UserFact, 'learnedAt'>
): Promise<UserProfile> {
  const profile = await getUserProfile(userId);

  // Check for duplicate facts
  const existingFact = profile.facts.find((f) => f.text.toLowerCase() === fact.text.toLowerCase());
  if (existingFact) {
    // Update confidence if new fact has higher confidence
    if (
      (fact.confidence === 'high' && existingFact.confidence !== 'high') ||
      (fact.confidence === 'medium' && existingFact.confidence === 'low')
    ) {
      existingFact.confidence = fact.confidence;
      existingFact.learnedAt = new Date().toISOString();
    }
    await saveUserProfile(userId, profile);
    return profile;
  }

  // Add new fact
  const newFact: UserFact = {
    ...fact,
    learnedAt: new Date().toISOString(),
  };
  profile.facts.push(newFact);

  // Trim old facts if exceeding limit
  if (profile.facts.length > MAX_FACTS) {
    // Remove oldest low-confidence facts first
    profile.facts.sort((a, b) => {
      // High confidence facts go to the end (keep)
      const confOrder = { high: 2, medium: 1, low: 0 };
      const confDiff = confOrder[b.confidence] - confOrder[a.confidence];
      if (confDiff !== 0) return confDiff;
      // Newer facts go to the end (keep)
      return new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime();
    });
    profile.facts = profile.facts.slice(0, MAX_FACTS);
  }

  await saveUserProfile(userId, profile);
  return profile;
}

/**
 * Extract user information using LLM for contextual understanding
 * Falls back to pattern matching if LLM is unavailable
 */
async function extractWithLLM(
  userId: string,
  message: string,
  conversationContext?: string
): Promise<{
  name?: string;
  location?: string;
  occupation?: string;
  company?: string;
  interests?: string[];
  facts: Array<{
    text: string;
    category: UserFact['category'];
    confidence: UserFact['confidence'];
  }>;
} | null> {
  try {
    // Use the user's own Google API key for extraction
    const { getUserApiKey } = await import('@/lib/ai/get-user-keys');
    const googleApiKey = await getUserApiKey(userId, 'google');

    if (!googleApiKey) {
      return null; // Fall back to pattern matching
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Analyze this user message and extract personal information. Be smart about inferring details from context.

User message: "${message}"
${conversationContext ? `\nConversation context: ${conversationContext}` : ''}

Extract ANY personal information you can infer (not just explicit statements). For example:
- "I travel for work as a sales manager" → occupation: "sales manager", fact: "travels for work"
- "tired from the gym yesterday" → interest: "fitness/gym", fact: "goes to the gym regularly"
- "need to buy dog food" → fact: "has a dog"
- "my car broke down" → fact: "owns a car"

Return JSON only (no markdown):
{
  "name": "string or null",
  "location": "string or null",
  "occupation": "string or null",
  "company": "string or null",
  "interests": ["array of interests/hobbies or empty"],
  "facts": [
    {"text": "fact description", "category": "personal|preference|context|relationship|other", "confidence": "high|medium|low"}
  ]
}

Only include fields where you found information. For facts, include anything notable about the person.
If no personal information is found, return: {"facts": []}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('[UserProfile] LLM extraction failed:', error);
    return null;
  }
}

/**
 * Extract and add user information from a conversation message
 * Uses LLM for smart extraction, falls back to patterns
 */
export async function extractAndSaveUserInfo(
  userId: string,
  message: string,
  conversationId?: string
): Promise<UserFact[]> {
  const extractedFacts: UserFact[] = [];

  // Skip very short messages
  if (message.length < 10) {
    return extractedFacts;
  }

  // Try LLM extraction first (smarter, understands context)
  const llmResult = await extractWithLLM(userId, message);

  if (llmResult) {
    const profile = await getUserProfile(userId);

    // Update profile fields
    if (llmResult.name && !profile.name) {
      await updateUserProfile(userId, { name: llmResult.name });
    }
    if (llmResult.location && !profile.location) {
      await updateUserProfile(userId, { location: llmResult.location });
    }
    if (llmResult.occupation && !profile.occupation) {
      await updateUserProfile(userId, { occupation: llmResult.occupation });
    }
    if (llmResult.company && !profile.company) {
      await updateUserProfile(userId, { company: llmResult.company });
    }
    if (llmResult.interests && llmResult.interests.length > 0) {
      const existingInterests = profile.interests || [];
      const newInterests = llmResult.interests.filter(
        (i) => !existingInterests.some((e) => e.toLowerCase() === i.toLowerCase())
      );
      if (newInterests.length > 0) {
        await updateUserProfile(userId, {
          interests: [...existingInterests, ...newInterests].slice(0, 20),
        });
      }
    }

    if (!profile.timezone) {
      const locationForTimezone = llmResult.location || profile.location;
      const inferredTimezone = inferTimezoneFromLocation(locationForTimezone);
      if (inferredTimezone) {
        await updateUserProfile(userId, { timezone: inferredTimezone });
      }
    }

    // Add facts
    for (const fact of llmResult.facts || []) {
      const userFact: UserFact = {
        text: fact.text,
        category: fact.category,
        confidence: fact.confidence,
        learnedAt: new Date().toISOString(),
        source: conversationId,
      };
      extractedFacts.push(userFact);
      await addUserFact(userId, userFact);
    }

    if (extractedFacts.length > 0) {
      console.log(`[UserProfile] LLM extracted ${extractedFacts.length} facts from message`);
    }

    return extractedFacts;
  }

  // Fallback: Simple pattern-based extraction
  console.log('[UserProfile] Falling back to pattern-based extraction');

  // Name patterns
  const namePatterns = [/my name is (\w+)/i, /I'm (\w+)/i, /call me (\w+)/i, /I am (\w+)/i];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 1 && match[1].length < 30) {
      const profile = await getUserProfile(userId);
      if (!profile.name) {
        await updateUserProfile(userId, { name: match[1] });
      }
      break;
    }
  }

  // Location patterns
  let locationMatch: string | undefined;
  const locationPatterns = [
    /I live in ([^,.]+)/i,
    /I'm from ([^,.]+)/i,
    /I'm in ([^,.]+)/i,
    /based in ([^,.]+)/i,
    /located in ([^,.]+)/i,
  ];
  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 1 && match[1].length < 50) {
      const profile = await getUserProfile(userId);
      if (!profile.location) {
        await updateUserProfile(userId, { location: match[1].trim() });
      }
      locationMatch = match[1].trim();
      extractedFacts.push({
        text: `Lives in ${match[1].trim()}`,
        category: 'personal',
        confidence: 'medium',
        learnedAt: new Date().toISOString(),
        source: conversationId,
      });
      break;
    }
  }

  if (locationMatch) {
    const profile = await getUserProfile(userId);
    if (!profile.timezone) {
      const inferredTimezone = inferTimezoneFromLocation(locationMatch);
      if (inferredTimezone) {
        await updateUserProfile(userId, { timezone: inferredTimezone });
      }
    }
  }

  // Job/occupation patterns
  const jobPatterns = [
    /I work as (?:a |an )?([^,.]+)/i,
    /I'm (?:a |an )?([^,.]+) by profession/i,
    /my job is ([^,.]+)/i,
    /I am (?:a |an )?([^,.]+) at/i,
  ];
  for (const pattern of jobPatterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 1 && match[1].length < 50) {
      const profile = await getUserProfile(userId);
      if (!profile.occupation) {
        await updateUserProfile(userId, { occupation: match[1].trim() });
      }
      extractedFacts.push({
        text: `Works as ${match[1].trim()}`,
        category: 'personal',
        confidence: 'medium',
        learnedAt: new Date().toISOString(),
        source: conversationId,
      });
      break;
    }
  }

  // Hobby/interest patterns
  const hobbyPatterns = [
    /I (?:really )?(?:like|love|enjoy) ([^,.]+)/i,
    /my hobbies? (?:is|are|include) ([^,.]+)/i,
    /I'm interested in ([^,.]+)/i,
    /I'm passionate about ([^,.]+)/i,
  ];
  for (const pattern of hobbyPatterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 2 && match[1].length < 100) {
      const interest = match[1].trim();
      extractedFacts.push({
        text: `Interested in: ${interest}`,
        category: 'preference',
        confidence: 'medium',
        learnedAt: new Date().toISOString(),
        source: conversationId,
      });
    }
  }

  // Save extracted facts
  for (const fact of extractedFacts) {
    await addUserFact(userId, fact);
  }

  return extractedFacts;
}

/**
 * Get profile context for inclusion in prompts
 */
export async function getProfileContext(userId: string, maxLength: number = 2000): Promise<string> {
  const profile = await getUserProfile(userId);
  const lines: string[] = [];

  // Check if profile has meaningful data
  const hasData =
    profile.name ||
    profile.location ||
    profile.occupation ||
    profile.interests?.length ||
    profile.facts.length > 0;

  if (!hasData) {
    return '';
  }

  lines.push('## User Profile (Personal Memory)');
  lines.push('');

  if (profile.name) {
    lines.push(`**Name:** ${profile.preferredName || profile.name}`);
  }
  if (profile.location) {
    lines.push(`**Location:** ${profile.location}`);
  }
  if (profile.timezone) {
    lines.push(`**Timezone:** ${profile.timezone}`);
  }
  if (profile.occupation) {
    lines.push(`**Occupation:** ${profile.occupation}`);
  }
  if (profile.company) {
    lines.push(`**Company:** ${profile.company}`);
  }

  if (profile.interests && profile.interests.length > 0) {
    lines.push(`**Interests:** ${profile.interests.join(', ')}`);
  }

  if (profile.communicationStyle) {
    lines.push(`**Prefers ${profile.communicationStyle} communication**`);
  }

  // Add high-confidence facts
  const highConfFacts = profile.facts.filter((f) => f.confidence === 'high');
  if (highConfFacts.length > 0) {
    lines.push('');
    lines.push('**Key Facts:**');
    for (const fact of highConfFacts.slice(0, 10)) {
      lines.push(`- ${fact.text}`);
    }
  }

  // Add medium-confidence facts if we have space
  const result = lines.join('\n');
  if (result.length < maxLength - 500) {
    const medFacts = profile.facts.filter((f) => f.confidence === 'medium');
    if (medFacts.length > 0) {
      lines.push('');
      lines.push('**Additional Info:**');
      for (const fact of medFacts.slice(0, 5)) {
        lines.push(`- ${fact.text}`);
      }
    }
  }

  return lines.join('\n').slice(0, maxLength);
}

/**
 * Check if user profile memory is enabled in admin settings
 */
export async function isProfileMemoryEnabled(): Promise<boolean> {
  try {
    const settings = await db.query.adminSettings.findFirst();
    // Default to true if setting doesn't exist yet
    return (settings as Record<string, unknown> | null)?.userProfileMemoryEnabled !== false;
  } catch {
    return true; // Default enabled
  }
}

/**
 * Clear user profile
 */
export async function clearUserProfile(userId: string): Promise<void> {
  try {
    const profileDir = getUserProfileDir(userId);
    await fs.rm(profileDir, { recursive: true, force: true });
    console.log(`[UserProfile] Cleared profile for user ${userId.slice(0, 8)}`);
  } catch (error) {
    console.error('[UserProfile] Failed to clear profile:', error);
    throw error;
  }
}

/**
 * Delete a specific fact from the profile
 */
export async function deleteUserFact(userId: string, factText: string): Promise<UserProfile> {
  const profile = await getUserProfile(userId);
  profile.facts = profile.facts.filter((f) => f.text.toLowerCase() !== factText.toLowerCase());
  await saveUserProfile(userId, profile);
  return profile;
}

/**
 * Add user-provided custom information to the profile
 * This is for information the user wants agents to know about them
 */
export async function addUserProvidedInfo(
  userId: string,
  info: {
    name?: string;
    location?: string;
    timezone?: string;
    occupation?: string;
    company?: string;
    interests?: string[];
    hobbies?: string[];
    communicationStyle?: 'formal' | 'casual' | 'friendly' | 'professional';
    preferredName?: string;
    customInstructions?: string; // What the user wants agents to know
    facts?: string[]; // Custom facts to add
  }
): Promise<UserProfile> {
  const profile = await getUserProfile(userId);

  // Update basic fields if provided
  if (info.name !== undefined) profile.name = info.name || undefined;
  if (info.location !== undefined) profile.location = info.location || undefined;
  if (info.timezone !== undefined) profile.timezone = info.timezone || undefined;
  if (info.occupation !== undefined) profile.occupation = info.occupation || undefined;
  if (info.company !== undefined) profile.company = info.company || undefined;
  if (info.communicationStyle !== undefined)
    profile.communicationStyle = info.communicationStyle || undefined;
  if (info.preferredName !== undefined) profile.preferredName = info.preferredName || undefined;

  if (!profile.timezone && info.timezone === undefined && info.location) {
    const inferredTimezone = inferTimezoneFromLocation(info.location);
    if (inferredTimezone) {
      profile.timezone = inferredTimezone;
    }
  }

  // Merge interests (don't duplicate)
  if (info.interests && info.interests.length > 0) {
    const existing = profile.interests || [];
    const newInterests = info.interests.filter(
      (i) => i.trim() && !existing.some((e) => e.toLowerCase() === i.toLowerCase())
    );
    profile.interests = [...existing, ...newInterests].slice(0, 20);
  }

  // Merge hobbies (don't duplicate)
  if (info.hobbies && info.hobbies.length > 0) {
    const existing = profile.hobbies || [];
    const newHobbies = info.hobbies.filter(
      (h) => h.trim() && !existing.some((e) => e.toLowerCase() === h.toLowerCase())
    );
    profile.hobbies = [...existing, ...newHobbies].slice(0, 20);
  }

  // Add custom instructions as a high-confidence fact
  if (info.customInstructions && info.customInstructions.trim()) {
    const instructionFact: UserFact = {
      text: `User instructions: ${info.customInstructions.trim()}`,
      category: 'preference',
      confidence: 'high',
      learnedAt: new Date().toISOString(),
      source: 'user_provided',
    };
    // Remove any existing instruction fact
    profile.facts = profile.facts.filter((f) => !f.text.startsWith('User instructions:'));
    profile.facts.unshift(instructionFact);
  }

  // Add custom facts
  if (info.facts && info.facts.length > 0) {
    for (const factText of info.facts) {
      if (!factText.trim()) continue;
      // Check for duplicates
      const exists = profile.facts.some((f) => f.text.toLowerCase() === factText.toLowerCase());
      if (!exists) {
        profile.facts.push({
          text: factText.trim(),
          category: 'personal',
          confidence: 'high',
          learnedAt: new Date().toISOString(),
          source: 'user_provided',
        });
      }
    }
  }

  await saveUserProfile(userId, profile);
  console.log(`[UserProfile] Updated profile with user-provided info for ${userId.slice(0, 8)}`);
  return profile;
}
