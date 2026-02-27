'use client';

import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport, type FileUIPart } from 'ai';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { refreshConversations } from '@/lib/hooks/useConversations';
import { useUser } from '@/lib/hooks/useUser';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowDown, Minimize2 } from 'lucide-react';
import { WelcomeScreen } from '@/components/chat/WelcomeScreen';
import { QuickActions } from '@/components/chat/QuickActions';
import { useSearchParams } from 'next/navigation';
import type { AgentConfig, OrchestrationMode } from '@/types/agent';
import { useVoiceConversation, type VoiceProvider } from '@/lib/hooks/useVoiceConversation';
import { VoiceOverlay } from '@/components/chat/VoiceOverlay';
import {
  AutonomousProgress,
  type AutonomousProgressState,
} from '@/components/chat/AutonomousProgress';
import { ModelFailoverBadge } from '@/components/chat/ModelFailoverBadge';
import type { AutonomousStreamEvent, FileInfo, ActivityLogEntry } from '@/lib/autonomous/types';
import { getAllModels } from '@/lib/ai/models';

const DEFAULT_MODEL = 'gpt-4o';
const AUTONOMOUS_MODE_KEY = 'maiachat-autonomous-mode';
const AUTONOMOUS_TASK_KEY = 'maiachat-active-task-key';
const MODEL_STORAGE_KEY = 'maiachat-selected-model';
const RAG_ENABLED_KEY = 'maiachat-rag-enabled';
const GEMINI_ENABLED_KEY = 'maiachat-gemini-file-search';
const TOOLS_ENABLED_KEY = 'maiachat-tools-enabled';
const SKILLS_ENABLED_KEY = 'maiachat-skills-enabled';
const VOICE_MODE_KEY = 'maiachat-voice-mode';
const VOICE_SETTINGS_KEY = 'maiachat-voice-settings';
const SCROLL_THRESHOLD = 150; // pixels from bottom to consider "at bottom"
const TTS_MAX_CHUNK_CHARS = 3000;
const CONVERSATION_POLL_INTERVAL_MS = 10000;
const MODEL_SWITCH_COMMAND_PATTERNS = [
  /^\/model\s+(.+)$/i,
  /^\/switch-model\s+(.+)$/i,
  /^(?:please\s+)?(?:switch|change|set)\s+(?:the\s+)?model\s+to\s+(.+)$/i,
];

type QuickModelInfo = {
  id: string;
  name: string;
  provider?: string;
};

function normalizeModelText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9/.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractModelSwitchTarget(input: string): string | null {
  const trimmed = input.trim();
  for (const pattern of MODEL_SWITCH_COMMAND_PATTERNS) {
    const match = trimmed.match(pattern);
    const target = match?.[1]?.trim();
    if (target) return target;
  }
  return null;
}

function resolveRequestedModelFromText(text: string): QuickModelInfo | null {
  const normalized = normalizeModelText(text);
  const models = getAllModels().map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
  }));

  // 1) Exact model-id mention (most reliable)
  const exactId = models.find((m) => normalized.includes(normalizeModelText(m.id)));
  if (exactId) return exactId;

  // 2) Exact model-name mention
  const exactName = models.find((m) => normalized.includes(normalizeModelText(m.name)));
  if (exactName) return exactName;

  // 3) Provider + partial token match fallback
  const candidates = models.filter((m) => {
    const provider = normalizeModelText(m.provider || '');
    const modelName = normalizeModelText(m.name);
    return (
      (provider && normalized.includes(provider)) || normalized.includes(modelName.split(' ')[0])
    );
  });

  return candidates.length > 0 ? candidates[0] : null;
}

/** Strip markdown formatting so TTS reads clean text */
function stripMarkdownForTTS(text: string): string {
  return (
    text
      // Code blocks (```...```) → content only
      .replace(/```[\s\S]*?```/g, (match) => {
        const lines = match.split('\n');
        // Remove first line (```lang) and last line (```)
        return lines.slice(1, -1).join('\n');
      })
      // Inline code (`code`) → code
      .replace(/`([^`]+)`/g, '$1')
      // Bold (**text** or __text__) → text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      // Italic (*text* or _text_) → text
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Strikethrough (~~text~~) → text
      .replace(/~~(.+?)~~/g, '$1')
      // Headings (# text) → text
      .replace(/^#{1,6}\s+/gm, '')
      // Links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Horizontal rules (--- or ***) → empty
      .replace(/^[-*]{3,}\s*$/gm, '')
      // Bullet markers (- or * or + at start) → empty
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Numbered list markers (1. 2. etc) → empty
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Blockquotes (> text) → text
      .replace(/^>\s+/gm, '')
      // Clean up extra blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

interface VoiceSettings {
  voice: string;
  speed: number;
  provider: VoiceProvider;
}

interface ChatInterfaceProps {
  id?: string; // conversation ID
  initialMessages?: UIMessage[];
  initialModel?: string;
}

interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

/** Build UIMessage parts from a persisted message, restoring image file parts from metadata */
function buildPartsFromPersisted(
  content: string,
  metadata?: Record<string, unknown> | null
): UIMessage['parts'] {
  const parts: UIMessage['parts'] = [];
  if (content && content !== '(image)') {
    parts.push({ type: 'text' as const, text: content });
  }
  // Restore image parts from stored S3 keys
  const imageKeys = metadata?.imageKeys as
    | Array<{
        s3Key: string;
        mediaType: string;
        filename?: string;
      }>
    | undefined;
  if (imageKeys?.length) {
    for (const img of imageKeys) {
      parts.push({
        type: 'file' as const,
        mediaType: img.mediaType,
        url: `/api/chat/images?key=${encodeURIComponent(img.s3Key)}`,
        filename: img.filename,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  }
  // Ensure at least one text part (AI SDK expects it)
  if (parts.length === 0) {
    parts.push({ type: 'text' as const, text: content || '' });
  }
  return parts;
}

function getUiMessageText(message: UIMessage): string {
  if (message.parts && message.parts.length > 0) {
    const textContent = message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
    if (textContent) return textContent;
  }

  const msgAny = message as unknown as { content?: string; text?: string };
  if (typeof msgAny.content === 'string' && msgAny.content) return msgAny.content;
  if (typeof msgAny.text === 'string' && msgAny.text) return msgAny.text;
  return '';
}

function normalizeMessageTextForMatch(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function messageSignature(role: UIMessage['role'], text: string): string {
  return `${role}\n${normalizeMessageTextForMatch(text)}`;
}

function messagesEquivalent(
  leftRole: UIMessage['role'],
  leftText: string,
  rightRole: UIMessage['role'],
  rightText: string
): boolean {
  if (leftRole !== rightRole) return false;

  const left = normalizeMessageTextForMatch(leftText);
  const right = normalizeMessageTextForMatch(rightText);

  if (!left && !right) return true;
  if (left === right) return true;

  // Streaming and persisted content can occasionally differ by short truncation.
  if (left.length >= 32 && right.length >= 32) {
    return left.includes(right) || right.includes(left);
  }

  return false;
}

export function ChatInterface({ id, initialMessages = [], initialModel }: ChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserNearBottom = useRef(true); // Track if user is near bottom

  // Track if component has mounted (for hydration safety)
  const [hasMounted, setHasMounted] = useState(false);

  // Check authentication status
  const { isAuthenticated, isLoading: isAuthLoading } = useUser();

  // Track conversationId - can be updated when agents create a conversation
  const [conversationId, setConversationId] = useState<string | undefined>(id);

  const searchParams = useSearchParams();
  const newChatTimestamp = searchParams?.get('new');

  // Sync with prop when navigating to different conversations
  useEffect(() => {
    setConversationId(id);
  }, [id]);

  // Initialize model with DEFAULT_MODEL to avoid hydration mismatch
  // localStorage is read only after mount
  const [selectedModel, setSelectedModel] = useState<string>(initialModel || DEFAULT_MODEL);

  // Multi-agent state
  const [selectedAgents, setSelectedAgents] = useState<AgentConfig[]>([]);
  const [orchestrationMode, setOrchestrationMode] = useState<OrchestrationMode>('sequential');
  const [maxRounds, setMaxRounds] = useState(3);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [geminiFileSearchEnabled, setGeminiFileSearchEnabled] = useState(false);
  const [selectedGeminiStoreIds, setSelectedGeminiStoreIds] = useState<string[]>([]);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [skillsEnabled, setSkillsEnabled] = useState(true);
  const [enabledSkillSlugs, setEnabledSkillSlugs] = useState<string[]>([]);
  const [isMultiAgentLoading, setIsMultiAgentLoading] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);

  // Voice mode state
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    voice: 'aura-asteria-en',
    speed: 1.0,
    provider: 'deepgram',
  });
  const [deepgramApiKey, setDeepgramApiKey] = useState<string | undefined>();

  // Streaming progress state for multi-agent
  const [currentAgent, setCurrentAgent] = useState<{ id: string; name: string } | null>(null);
  const [roundProgress, setRoundProgress] = useState<{
    round: number;
    maxRounds: number;
    phase: string;
  } | null>(null);

  // Autonomous mode state
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [activeTaskKey, setActiveTaskKey] = useState<string | null>(null);
  const [autonomousProgress, setAutonomousProgress] = useState<AutonomousProgressState | null>(
    null
  );
  const [isAutonomousLoading, setIsAutonomousLoading] = useState(false);

  // Context compaction state
  const [isCompacting, setIsCompacting] = useState(false);

  // Failover info state
  const [failoverInfo, setFailoverInfo] = useState<{
    modelId: string;
    usedFallback: boolean;
    fallbackModels: string[];
  } | null>(null);

  const handleCompact = useCallback(async () => {
    if (!conversationId) return;
    if (
      !window.confirm(
        "Compact this conversation's context? This stores a summary for future reference."
      )
    )
      return;
    try {
      setIsCompacting(true);
      const res = await fetch(`/api/conversations/${conversationId}/compact`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Compact failed');
      }
      toast.success(`Compacted ${data.compactedMessageCount} messages`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to compact');
    } finally {
      setIsCompacting(false);
    }
  }, [conversationId]);

  // CONSOLIDATED: Load all preferences from localStorage AFTER hydration
  // This runs once on mount and batches all localStorage reads into a single effect
  // to reduce render cycles (was 6 separate effects, now 1)
  useEffect(() => {
    setHasMounted(true);

    // Model preference
    if (!initialModel) {
      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
      if (savedModel) {
        setSelectedModel(savedModel);
      }
    }

    // RAG preference
    const savedRag = localStorage.getItem(RAG_ENABLED_KEY);
    if (savedRag) {
      setRagEnabled(savedRag === 'true');
    }

    // Gemini file search preference
    const savedGemini = localStorage.getItem(GEMINI_ENABLED_KEY);
    if (savedGemini) {
      setGeminiFileSearchEnabled(savedGemini === 'true');
    }

    // Tools preference
    const savedTools = localStorage.getItem(TOOLS_ENABLED_KEY);
    if (savedTools !== null) {
      setToolsEnabled(savedTools === 'true');
    }

    // Skills preference
    const savedSkills = localStorage.getItem(SKILLS_ENABLED_KEY);
    if (savedSkills !== null) {
      setSkillsEnabled(savedSkills === 'true');
    }

    // Memory preference
    const savedMemory = localStorage.getItem('maiachat-memory-enabled');
    if (savedMemory !== null) {
      setMemoryEnabled(savedMemory === 'true');
    }

    // Autonomous mode preference
    const savedAutonomous = localStorage.getItem(AUTONOMOUS_MODE_KEY);
    if (savedAutonomous !== null) {
      setAutonomousMode(savedAutonomous === 'true');
    }

    // Active autonomous task - check if there's a saved task key and verify its status
    const savedTaskKey = localStorage.getItem(AUTONOMOUS_TASK_KEY);
    if (savedTaskKey) {
      // Check if task is still running on the server
      fetch(`/api/task/autonomous?taskKey=${savedTaskKey}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.task?.isRunning) {
            // Task is still running - restore the progress UI
            setActiveTaskKey(savedTaskKey);
            setAutonomousProgress({
              step: data.task.currentStep || 0,
              maxSteps: data.task.maxSteps || 50,
              summary: data.task.progressSummary || 'Task in progress (reconnected)',
              toolCalls: data.task.toolCallsCount || 0,
              tokens: data.task.totalTokensUsed || 0,
              isComplete: false,
            });
            toast.info('Reconnected to active autonomous task');
          } else {
            // Task is no longer running - clear saved key
            localStorage.removeItem(AUTONOMOUS_TASK_KEY);
          }
        })
        .catch(() => {
          // Failed to check - clear saved key
          localStorage.removeItem(AUTONOMOUS_TASK_KEY);
        });
    }

    // Voice settings
    const savedVoiceSettings = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (savedVoiceSettings) {
      try {
        const parsed = JSON.parse(savedVoiceSettings);
        setVoiceSettings(parsed);
      } catch {
        /* ignore */
      }
    }
  }, [initialModel]);

  // Preload enabled skill slugs on mount so the chat API receives the correct
  // filter even before the user opens the SkillsPanel popover.
  useEffect(() => {
    if (!hasMounted) return;
    fetch('/api/skills')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.skills) {
          const slugs = (data.skills as { slug: string; isEnabled: boolean }[])
            .filter((s) => s.isEnabled)
            .map((s) => s.slug);
          setEnabledSkillSlugs(slugs);
        }
      })
      .catch(() => {
        /* skills preload is best-effort */
      });
  }, [hasMounted]);

  // Save model preference to localStorage
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  }, []);

  // Handle conversation creation from AgentSelector
  const handleConversationCreated = useCallback((newId: string) => {
    console.log('Conversation created by AgentSelector:', newId);
    setConversationId(newId);
  }, []);

  // Fetch Deepgram key when provider changes to deepgram
  useEffect(() => {
    if (voiceSettings.provider === 'deepgram' && !deepgramApiKey) {
      fetch('/api/audio/deepgram/token', { method: 'POST' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.apiKey) setDeepgramApiKey(data.apiKey);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }, [voiceSettings.provider, deepgramApiKey]);

  // Handle agents change from AgentSelector
  const handleAgentsChanged = useCallback(
    (agents: AgentConfig[], mode: OrchestrationMode, rounds: number) => {
      setSelectedAgents(agents);
      setOrchestrationMode(mode);
      setMaxRounds(rounds);
    },
    []
  );

  // Handle RAG toggle
  const handleRagEnabledChanged = useCallback((enabled: boolean) => {
    setRagEnabled(enabled);
    localStorage.setItem(RAG_ENABLED_KEY, String(enabled));
  }, []);

  // Note: Gemini toggle is now in Settings page, controlled via localStorage

  const handleToolsEnabledChanged = useCallback((enabled: boolean) => {
    setToolsEnabled(enabled);
    localStorage.setItem(TOOLS_ENABLED_KEY, String(enabled));
  }, []);

  const handleSkillsEnabledChanged = useCallback((enabled: boolean) => {
    setSkillsEnabled(enabled);
    localStorage.setItem(SKILLS_ENABLED_KEY, String(enabled));
  }, []);

  const handleGeminiStoreIdsChanged = useCallback((ids: string[]) => {
    setSelectedGeminiStoreIds(ids);
  }, []);

  // Voice mode handlers
  const handleVoiceModeToggle = useCallback((enabled: boolean) => {
    setVoiceModeEnabled(enabled);
    localStorage.setItem(VOICE_MODE_KEY, String(enabled));
  }, []);

  // Note: Memory toggle is now in Settings page, controlled via localStorage

  const handleAutonomousModeChanged = useCallback((enabled: boolean) => {
    setAutonomousMode(enabled);
    localStorage.setItem(AUTONOMOUS_MODE_KEY, String(enabled));
  }, []);

  // Auto-select MaiaChat Memory store when memory is enabled
  useEffect(() => {
    if (memoryEnabled && selectedGeminiStoreIds.length === 0) {
      // Fetch stores and find the MaiaChat Memory store
      fetch('/api/gemini/stores', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.stores) {
            // Find the MaiaChat Memory store (prefix: "MaiaChat Memory")
            const memoryStore = data.stores.find((store: { displayName: string; id: string }) =>
              store.displayName?.startsWith('MaiaChat Memory')
            );
            if (memoryStore) {
              console.log('[ChatInterface] Auto-selecting MaiaChat Memory store:', memoryStore.id);
              setSelectedGeminiStoreIds([memoryStore.id]);
            }
          }
        })
        .catch((err) => {
          console.error('[ChatInterface] Failed to fetch stores for memory auto-select:', err);
        });
    }
  }, [memoryEnabled, selectedGeminiStoreIds.length]);

  // Keyboard shortcut: Ctrl+Shift+A to toggle autonomous mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleAutonomousModeChanged(!autonomousMode);
        toast.info(autonomousMode ? 'Autonomous mode disabled' : 'Autonomous mode enabled');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autonomousMode, handleAutonomousModeChanged]);

  // Persist active task key to localStorage for page refresh recovery
  useEffect(() => {
    if (activeTaskKey) {
      localStorage.setItem(AUTONOMOUS_TASK_KEY, activeTaskKey);
    } else {
      localStorage.removeItem(AUTONOMOUS_TASK_KEY);
    }
  }, [activeTaskKey]);

  // Memory auto-save: track whether current conversation has been saved
  const memorySavedForConvRef = useRef<string | null>(null);
  const memoryEnabledRef = useRef(memoryEnabled);
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    memoryEnabledRef.current = memoryEnabled;
  }, [memoryEnabled]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
    // Reset saved flag when conversation changes
    memorySavedForConvRef.current = null;
  }, [conversationId]);

  const handleVoiceSettingsChange = useCallback(
    (key: keyof VoiceSettings, value: string | number) => {
      setVoiceSettings((prev) => {
        const updated = { ...prev, [key]: value };
        localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  // Ref to receive failover info from transport (avoids stale closure in useMemo)
  const failoverInfoCallback = useRef<
    (info: { modelId: string; usedFallback: boolean; fallbackModels: string[] }) => void
  >((info) => {
    setFailoverInfo(info);
    if (info.usedFallback) {
      toast.warning(`Model failover: using ${info.modelId} instead of primary model`);
    }
  });

  // Use static transport - dynamic values passed via sendMessage options
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        fetch: async (input, init) => {
          const response = await globalThis.fetch(input, init);
          const modelId = response.headers.get('x-model-id');
          const usedFallback = response.headers.get('x-model-fallback') === 'true';
          const fallbacksHeader = response.headers.get('x-model-fallbacks');
          const fallbackModels = fallbacksHeader ? fallbacksHeader.split(',').filter(Boolean) : [];
          if (modelId) {
            failoverInfoCallback.current({ modelId, usedFallback, fallbackModels });
          }
          return response;
        },
      }),
    []
  );

  const chatHelpers = useChat({
    // Use id for chat session tracking (optional)
    ...(id ? { id } : {}),
    // Initial messages from saved conversation
    ...(initialMessages?.length ? { messages: initialMessages } : {}),
    transport,
    // Add onError handler to catch issues
    onError: (err) => {
      console.error('useChat onError:', err);
    },
    onFinish: ({ message, finishReason }) => {
      console.log('[ChatInterface] onFinish - message received:', {
        id: message.id,
        role: message.role,
        finishReason,
        partsCount: message.parts?.length,
        partTypes: message.parts?.map((p) => p.type),
      });

      // Auto-speak response when voice mode is active (use refs to avoid stale closures)
      const vc = voiceConversationRef.current;
      if (voiceModeEnabledRef.current && vc.isActive && message.role === 'assistant') {
        if (voiceSettingsRef.current.provider === 'deepgram') {
          finalizeStreamingTts(message.id);
        } else {
          const textContent =
            message.parts
              ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
              .map((part) => part.text)
              .join('') || '';
          if (textContent) {
            vc.speakText(textContent);
          }
        }
      }
    },
  });

  // AI SDK v6+: useChat returns sendMessage, setMessages instead of append
  const { messages, sendMessage, setMessages, status, error } = chatHelpers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reload = (chatHelpers as any).regenerate || (chatHelpers as any).reload;

  // Track which "new" timestamp we've already handled to prevent loops
  const processedNewChatTimestamp = useRef<string | null>(null);

  // Clear state when "New Chat" is triggered (timestamp changes)
  useEffect(() => {
    if (newChatTimestamp && newChatTimestamp !== processedNewChatTimestamp.current) {
      console.log('New Chat detected, clearing state. Timestamp:', newChatTimestamp);
      setMessages([]);
      setConversationId(undefined);
      processedNewChatTimestamp.current = newChatTimestamp;
    }
  }, [newChatTimestamp, setMessages]);

  // Log errors only in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && error) {
      console.error('Chat error:', error);
    }
  }, [error]);

  // Show error toast if there's an error from useChat
  useEffect(() => {
    if (error) {
      console.error('useChat error:', error);
      toast.error(`Chat error: ${error.message}`);
    }
  }, [error]);

  // Ref to always have the latest status (avoids stale closure in submitMessage)
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const getMessageTextOnly = useCallback((message: UIMessage): string => {
    if (message.parts && message.parts.length > 0) {
      const textContent = message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('');
      if (textContent) return textContent;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgAny = message as any;
    if (typeof msgAny.content === 'string' && msgAny.content) return msgAny.content;
    if (typeof msgAny.text === 'string' && msgAny.text) return msgAny.text;
    return '';
  }, []);

  // Log status changes for debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ChatInterface] Status changed: ${status}, messages: ${messages.length}`);
    }
  }, [status, messages.length]);

  // Auto-save conversation to memory when AI finishes responding
  useEffect(() => {
    if (
      status === 'ready' &&
      memoryEnabledRef.current &&
      conversationIdRef.current &&
      messages.length >= 4 &&
      memorySavedForConvRef.current !== conversationIdRef.current
    ) {
      const convId = conversationIdRef.current;
      memorySavedForConvRef.current = convId;
      console.log('[Memory] Auto-saving conversation to memory:', convId);
      fetch('/api/memory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            console.log('[Memory] Conversation saved:', data.summary?.substring(0, 80));
          } else {
            console.warn('[Memory] Save failed:', data.error);
          }
        })
        .catch((err) => console.error('[Memory] Auto-save error:', err));
    }
  }, [status, messages.length]);

  // Manual input state management
  const [input, setInput] = useState('');

  // Image attachment state
  const [pendingImages, setPendingImages] = useState<FileUIPart[]>([]);
  const pendingImagesRef = useRef<FileUIPart[]>([]);

  // Voice conversation hook - auto-submits transcriptions
  const voiceConversation = useVoiceConversation({
    provider: voiceSettings.provider,
    voice: voiceSettings.voice,
    speed: voiceSettings.speed,
    deepgramApiKey,
    onTranscription: (text) => {
      // Auto-submit the transcribed text as a chat message
      voiceAutoSubmitRef.current?.(text);
    },
    onError: (error) => {
      toast.error('Voice error', { description: error });
    },
  });

  // Ref to avoid stale closure in voice transcription callback
  const voiceAutoSubmitRef = useRef<((text: string) => void) | null>(null);

  // Refs for voice state used inside onFinish (avoids stale closure)
  const voiceModeEnabledRef = useRef(voiceModeEnabled);
  const voiceSettingsRef = useRef(voiceSettings);
  const voiceConversationRef = useRef(voiceConversation);
  useEffect(() => {
    voiceModeEnabledRef.current = voiceModeEnabled;
  }, [voiceModeEnabled]);
  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);
  useEffect(() => {
    voiceConversationRef.current = voiceConversation;
  }, [voiceConversation]);

  const isDeepgramVoiceActive =
    voiceModeEnabled && voiceSettings.provider === 'deepgram' && voiceConversation.isActive;

  const ttsStreamStateRef = useRef<{
    messageId: string | null;
    lastLength: number;
    buffer: string;
  }>({
    messageId: null,
    lastLength: 0,
    buffer: '',
  });

  const resetTtsStreamState = useCallback(() => {
    ttsStreamStateRef.current = {
      messageId: null,
      lastLength: 0,
      buffer: '',
    };
  }, []);

  const extractTtsChunks = useCallback((buffer: string) => {
    const chunks: string[] = [];
    let startIndex = 0;

    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (char === '.' || char === '!' || char === '?' || char === '\n') {
        const slice = buffer.slice(startIndex, i + 1).trim();
        if (slice) chunks.push(slice);
        startIndex = i + 1;
      }
    }

    let remainder = buffer.slice(startIndex);
    while (remainder.length > TTS_MAX_CHUNK_CHARS) {
      const chunk = remainder.slice(0, TTS_MAX_CHUNK_CHARS).trim();
      if (chunk) chunks.push(chunk);
      remainder = remainder.slice(TTS_MAX_CHUNK_CHARS);
    }

    return { chunks, remainder };
  }, []);

  const finalizeStreamingTts = useCallback((messageId?: string) => {
    const vc = voiceConversationRef.current;
    const state = ttsStreamStateRef.current;

    if (!vc || !state.messageId) return;
    if (messageId && state.messageId !== messageId) return;

    const remainder = state.buffer.trim();
    if (remainder) {
      vc.enqueueTTS(stripMarkdownForTTS(remainder));
      state.buffer = '';
    }
    vc.setResponseStreaming(false);
  }, []);

  useEffect(() => {
    if (!isDeepgramVoiceActive) {
      resetTtsStreamState();
      const vc = voiceConversationRef.current;
      if (vc) {
        vc.flushTTSQueue();
        vc.setResponseStreaming(false);
      }
      return;
    }

    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistantMessage) return;

    const textContent = getMessageTextOnly(lastAssistantMessage);
    if (!textContent) return;

    const vc = voiceConversationRef.current;
    if (!vc) return;

    const state = ttsStreamStateRef.current;
    const messageId = lastAssistantMessage.id;

    if (state.messageId !== messageId) {
      state.messageId = messageId;
      state.lastLength = 0;
      state.buffer = '';
      vc.setResponseStreaming(true);
      vc.setThinking();
    }

    if (textContent.length < state.lastLength) {
      state.lastLength = 0;
      state.buffer = '';
    }

    const delta = textContent.slice(state.lastLength);
    if (delta) {
      state.lastLength = textContent.length;
      state.buffer += delta;
      const { chunks, remainder } = extractTtsChunks(state.buffer);
      state.buffer = remainder;
      chunks.forEach((chunk) => vc.enqueueTTS(stripMarkdownForTTS(chunk)));
    }

    if (status === 'ready' && state.messageId === messageId) {
      finalizeStreamingTts(messageId);
    }
  }, [
    isDeepgramVoiceActive,
    messages,
    status,
    extractTtsChunks,
    finalizeStreamingTts,
    getMessageTextOnly,
    resetTtsStreamState,
  ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Core message submission logic - used by both form submit and voice auto-submit
  const submitMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() && pendingImagesRef.current.length === 0) return;

      // Explicit model switch command support.
      // This updates selected model, but does not consume the message.
      const switchTarget = extractModelSwitchTarget(userMessage);
      if (switchTarget) {
        const requestedModel = resolveRequestedModelFromText(switchTarget);
        if (requestedModel) {
          handleModelChange(requestedModel.id);
          toast.success(`Model switched to ${requestedModel.name}`);
        } else {
          toast.error(`Model "${switchTarget}" not found. Message sent unchanged.`);
        }
      }

      // Ensure we have a conversation ID before sending any messages.
      // This prevents the server from creating a new conversation per message.
      let currentConvId = conversationId;
      if (!currentConvId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: userMessage.trim()
                ? userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')
                : 'Image conversation',
            }),
          });
          if (res.ok) {
            const data = await res.json();
            currentConvId = data.conversation.id;
            setConversationId(currentConvId);
            // Update the browser URL so navigating away and pressing back
            // lands on /chat/<id> (which loads messages from DB).
            // Using raw history API instead of Next.js router to avoid
            // triggering useSearchParams sync which would remount the component.
            if (typeof window !== 'undefined' && currentConvId) {
              window.history.replaceState(window.history.state, '', `/chat/${currentConvId}`);
            }
            refreshConversations();
          } else {
            console.error('Failed to create conversation:', res.status);
            toast.error('Failed to create conversation');
            return;
          }
        } catch (err) {
          console.error('Failed to create conversation:', err);
          toast.error('Failed to create conversation');
          return;
        }
      }

      // Check if we should use autonomous mode or multi-agent endpoint
      const useMultiAgent = selectedAgents.length > 0;
      const useAutonomous = autonomousMode && !useMultiAgent;

      if (useAutonomous) {
        // Autonomous mode: agent works continuously until task completion
        try {
          setIsAutonomousLoading(true);

          // Add user message to UI immediately
          const userMsgId = `user-${Date.now()}`;
          const userMsg: UIMessage = {
            id: userMsgId,
            role: 'user',
            parts: [{ type: 'text', text: userMessage }],
          };
          if (setMessages) {
            setMessages((prev: UIMessage[]) => [...prev, userMsg]);
          }

          // Call autonomous task endpoint
          const response = await fetch('/api/task/autonomous', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: userMessage,
              modelId: selectedModel,
              conversationId: currentConvId,
              maxSteps: 50,
              timeoutMs: 300000,
              config: {
                toolsEnabled,
                ragEnabled,
                memoryEnabled,
                temperature: 0.7,
              },
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Autonomous task failed to start');
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentTaskKey: string | null = null;
          let assistantMessageId: string | null = null;
          let accumulatedText = '';

          // Track files and activity for the task
          const filesCreated: FileInfo[] = [];
          const activityLog: ActivityLogEntry[] = [];
          let commandsExecuted = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const event = JSON.parse(line) as AutonomousStreamEvent;

                  if (event.type === 'init') {
                    currentTaskKey = event.taskKey;
                    setActiveTaskKey(event.taskKey);
                    setAutonomousProgress({
                      step: 0,
                      maxSteps: event.data?.maxSteps || 50,
                      summary: 'Starting autonomous task...',
                      toolCalls: 0,
                      tokens: 0,
                      isComplete: false,
                    });

                    if (event.data?.conversationId && !conversationId) {
                      setConversationId(event.data.conversationId);
                    }

                    // Create assistant message bubble
                    const msgId = `auto-${Date.now()}`;
                    assistantMessageId = msgId;
                    setMessages((prev: UIMessage[]) => [
                      ...prev,
                      {
                        id: msgId,
                        role: 'assistant',
                        parts: [{ type: 'text', text: '' }],
                      },
                    ]);
                  } else if (event.type === 'step_start') {
                    setAutonomousProgress((prev) =>
                      prev ? { ...prev, step: event.step || prev.step } : null
                    );
                  } else if (event.type === 'tool_call') {
                    // Add to activity log
                    if (event.data?.activityLog) {
                      activityLog.length = 0;
                      activityLog.push(...event.data.activityLog);
                    }
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            summary: `Using ${event.data?.toolName}...`,
                            toolCalls: prev.toolCalls + 1,
                            currentTool: event.data?.toolName,
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'tool_result') {
                    // Update activity log
                    if (event.data?.activityLog) {
                      activityLog.length = 0;
                      activityLog.push(...event.data.activityLog);
                    }
                    // Clear current tool when result is received
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            currentTool: undefined,
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'file_created') {
                    // Track file creation
                    if (event.data?.file) {
                      filesCreated.push(event.data.file);
                    }
                    if (event.data?.activityLog) {
                      activityLog.length = 0;
                      activityLog.push(...event.data.activityLog);
                    }
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            summary: `Created ${event.data?.file?.name || 'file'}`,
                            filesCreated: [...filesCreated],
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'file_read') {
                    if (event.data?.activityLog) {
                      activityLog.length = 0;
                      activityLog.push(...event.data.activityLog);
                    }
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            summary: `Reading ${event.data?.file?.name || 'file'}`,
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'command_executed') {
                    commandsExecuted++;
                    if (event.data?.activityLog) {
                      activityLog.length = 0;
                      activityLog.push(...event.data.activityLog);
                    }
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            summary: `Executed command`,
                            commandsExecuted,
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'text_delta' && event.data?.delta) {
                    accumulatedText += event.data.delta;
                    if (assistantMessageId) {
                      const msgId = assistantMessageId;
                      setMessages((prev: UIMessage[]) =>
                        prev.map((m) => {
                          if (m.id === msgId) {
                            return {
                              ...m,
                              parts: [{ type: 'text', text: accumulatedText }],
                            };
                          }
                          return m;
                        })
                      );
                    }
                  } else if (event.type === 'text_complete' && event.data?.content) {
                    accumulatedText = event.data.content;
                    if (assistantMessageId) {
                      const msgId = assistantMessageId;
                      setMessages((prev: UIMessage[]) =>
                        prev.map((m) => {
                          if (m.id === msgId) {
                            return {
                              ...m,
                              parts: [{ type: 'text', text: accumulatedText }],
                            };
                          }
                          return m;
                        })
                      );
                    }
                  } else if (event.type === 'progress') {
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            summary: event.data?.summary || prev.summary,
                            tokens: event.data?.totalTokens || prev.tokens,
                            step: event.data?.totalSteps || prev.step,
                            toolCalls: event.data?.totalToolCalls || prev.toolCalls,
                          }
                        : null
                    );
                  } else if (event.type === 'complete') {
                    // Merge files from event if available
                    if (event.data?.filesCreated) {
                      filesCreated.length = 0;
                      filesCreated.push(...event.data.filesCreated);
                    }
                    if (event.data?.activityLog) {
                      activityLog.length = 0;
                      activityLog.push(...event.data.activityLog);
                    }

                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            isComplete: true,
                            summary: 'Task complete',
                            filesCreated: [...filesCreated],
                            commandsExecuted: event.data?.commandsExecuted || commandsExecuted,
                            activityLog: [...activityLog],
                          }
                        : null
                    );

                    // Generate completion summary in chat if we have files or no text
                    if (filesCreated.length > 0 || !accumulatedText.trim()) {
                      let completionMessage =
                        accumulatedText.trim() || 'Task completed successfully.\n\n';

                      if (filesCreated.length > 0) {
                        completionMessage += '\n\n**Files Created:**\n';
                        for (const file of filesCreated) {
                          completionMessage += `- \`${file.path}\``;
                          if (file.size) {
                            completionMessage += ` (${file.size > 1024 ? `${(file.size / 1024).toFixed(1)}KB` : `${file.size}B`})`;
                          }
                          completionMessage += '\n';
                        }
                      }

                      if (assistantMessageId) {
                        const msgId = assistantMessageId;
                        setMessages((prev: UIMessage[]) =>
                          prev.map((m) => {
                            if (m.id === msgId) {
                              return {
                                ...m,
                                parts: [{ type: 'text', text: completionMessage }],
                              };
                            }
                            return m;
                          })
                        );
                      }
                    }

                    toast.success('Autonomous task completed', {
                      description: `${event.data?.totalSteps || 0} steps, ${filesCreated.length} files created`,
                    });
                  } else if (event.type === 'error') {
                    toast.error('Autonomous task error', {
                      description: event.data?.error,
                    });
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            isComplete: true,
                            summary: event.data?.error || 'Error',
                            error: event.data?.error,
                            filesCreated: [...filesCreated],
                            activityLog: [...activityLog],
                          }
                        : null
                    );

                    // Show error in chat message
                    if (assistantMessageId) {
                      const msgId = assistantMessageId;
                      const errorText = accumulatedText.trim()
                        ? `${accumulatedText}\n\n**Error:** ${event.data?.error}`
                        : `**Task Failed**\n\n${event.data?.error}`;
                      setMessages((prev: UIMessage[]) =>
                        prev.map((m) => {
                          if (m.id === msgId) {
                            return {
                              ...m,
                              parts: [{ type: 'text', text: errorText }],
                            };
                          }
                          return m;
                        })
                      );
                    }
                  } else if (event.type === 'aborted') {
                    toast.info('Autonomous task aborted');
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            isComplete: true,
                            summary: 'Aborted',
                            filesCreated: [...filesCreated],
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'timeout') {
                    toast.warning('Autonomous task timed out');
                    setAutonomousProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            isComplete: true,
                            summary: 'Timed out',
                            filesCreated: [...filesCreated],
                            activityLog: [...activityLog],
                          }
                        : null
                    );
                  } else if (event.type === 'steer_received') {
                    toast.info('Steering message received');
                    setAutonomousProgress((prev) =>
                      prev ? { ...prev, summary: 'Processing steering message...' } : null
                    );
                  }
                } catch {
                  console.error('Error parsing autonomous event line');
                }
              }
            }
          } finally {
            reader.releaseLock();
            setIsAutonomousLoading(false);
            // Don't auto-dismiss - let user dismiss manually
            // The progress panel has a dismiss button now
          }
        } catch (error) {
          console.error('Autonomous task error:', error);
          toast.error('Autonomous task failed: ' + (error as Error).message);
          setIsAutonomousLoading(false);
          setActiveTaskKey(null);
          setAutonomousProgress(null);
        }
      } else if (useMultiAgent) {
        // Multi-agent mode: call the multi-agent API directly
        try {
          setIsMultiAgentLoading(true);

          // Add user message to UI immediately using setMessages
          const userMsgId = `user-${Date.now()}`;
          const userMsg: UIMessage = {
            id: userMsgId,
            role: 'user',
            parts: [{ type: 'text', text: userMessage }],
          };
          if (setMessages) {
            setMessages((prev: UIMessage[]) => [...prev, userMsg]);
          }

          // Call multi-agent endpoint
          const response = await fetch('/api/chat/multi-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: currentConvId,
              message: userMessage,
              orchestrationMode,
              agentIds: selectedAgents.map((a) => a.id).filter(Boolean),
              enableDebug: false,
              maxRounds,
              toolsEnabled,
              skillsEnabled,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Multi-agent chat failed');
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          // Track the CURRENT message being streamed (not per-agent, since each response is a new bubble)
          let currentMessageId: string | null = null;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const data = JSON.parse(line);

                  if (data.type === 'init') {
                    if (data.conversationId && !conversationId) {
                      setConversationId(data.conversationId);
                    }
                  } else if (data.type === 'round') {
                    // Update round progress for consensus mode
                    setRoundProgress({
                      round: data.round,
                      maxRounds: data.maxRounds,
                      phase: data.phase,
                    });
                    // Show toast for round events
                    if (data.phase === 'start') {
                      toast.info(`Round ${data.round} of ${data.maxRounds} starting...`);
                    } else if (data.phase === 'synthesis') {
                      toast.info('Synthesizing responses...');
                    }
                  } else if (data.type === 'agent_start') {
                    // New agent starting to respond - create a NEW message bubble
                    const newMsgId = `agent-${data.agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                    currentMessageId = newMsgId;
                    setCurrentAgent({ id: data.agentId, name: data.agentName });

                    // Create new message bubble for this agent's response
                    setMessages((prev: UIMessage[]) => [
                      ...prev,
                      {
                        id: newMsgId,
                        role: 'assistant',
                        parts: [{ type: 'text', text: '' }],
                        metadata: {
                          agentName: data.agentName,
                          agentId: data.agentId,
                        },
                      },
                    ]);
                  } else if (data.type === 'agent_end') {
                    // Agent finished responding
                    currentMessageId = null;
                    setCurrentAgent(null);
                  } else if (data.type === 'token') {
                    // Append token to the current message
                    if (currentMessageId) {
                      const msgId = currentMessageId;
                      setMessages((prev: UIMessage[]) =>
                        prev.map((m) => {
                          if (m.id === msgId) {
                            // Get current content safely
                            let currentText = '';
                            if (m.parts && m.parts[0] && m.parts[0].type === 'text') {
                              currentText = m.parts[0].text;
                            }

                            return {
                              ...m,
                              parts: [{ type: 'text', text: currentText + data.content }],
                            };
                          }
                          return m;
                        })
                      );
                    }
                  } else if (data.type === 'complete') {
                    // Final sync - clear progress indicators
                    currentMessageId = null;
                    setCurrentAgent(null);
                    setRoundProgress(null);
                    console.log('Multi-agent stream complete', data);
                    toast.success(`${data.messages?.length || 0} agent responses received`);
                  } else if (data.type === 'error') {
                    currentMessageId = null;
                    setCurrentAgent(null);
                    setRoundProgress(null);
                    toast.error(data.error);
                    console.error('Stream error event:', data.error);
                  }
                } catch (e) {
                  console.error('Error parsing stream line', e);
                }
              }
            }
          } finally {
            reader.releaseLock();
            setIsMultiAgentLoading(false);
            setCurrentAgent(null);
            setRoundProgress(null);
          }
        } catch (error) {
          console.error('Multi-agent error:', error);
          toast.error('Multi-agent chat failed: ' + (error as Error).message);
          setIsMultiAgentLoading(false);
          setCurrentAgent(null);
          setRoundProgress(null);
        }
      } else {
        // Single-agent mode: use existing streaming chat
        try {
          // AI SDK v6: sendMessage expects { text: string } format
          // Dynamic values (conversationId, model) are passed via options.body
          // Guard: skip if chat hook is still streaming or in a transitional state
          if (statusRef.current === 'streaming' || statusRef.current === 'submitted') {
            console.warn(
              '[ChatInterface] Ignoring message — chat is busy (status:',
              statusRef.current,
              ')'
            );
            toast.error('Please wait for the current response to finish');
            return;
          }
          if (sendMessage) {
            const retrievalMode =
              ragEnabled && geminiFileSearchEnabled
                ? 'both'
                : ragEnabled
                  ? 'rag'
                  : geminiFileSearchEnabled
                    ? 'gemini'
                    : 'off';
            // Upload images to S3 and replace data URLs with presigned URLs
            let imagesToSend: FileUIPart[] | undefined;
            const uploadedS3Keys: Array<{ s3Key: string; mediaType: string; filename?: string }> =
              [];
            if (pendingImagesRef.current.length > 0) {
              try {
                imagesToSend = await Promise.all(
                  pendingImagesRef.current.map(async (img) => {
                    // Only upload data URLs (already-presigned URLs skip upload)
                    if (img.url.startsWith('data:')) {
                      const res = await fetch('/api/chat/images', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          dataUrl: img.url,
                          mediaType: img.mediaType,
                          filename: img.filename,
                        }),
                      });
                      if (!res.ok) throw new Error('Image upload failed');
                      const { url, s3Key } = await res.json();
                      uploadedS3Keys.push({
                        s3Key,
                        mediaType: img.mediaType,
                        filename: img.filename,
                      });
                      return { ...img, url };
                    }
                    return img;
                  })
                );
              } catch (err) {
                console.error('Failed to upload images:', err);
                toast.error('Failed to upload images');
                return;
              }
            }
            await sendMessage(
              { text: userMessage || 'Describe this image', files: imagesToSend },
              {
                body: {
                  conversationId: currentConvId,
                  model: selectedModel,
                  ragEnabled,
                  geminiFileSearchEnabled,
                  geminiStoreIds:
                    selectedGeminiStoreIds.length > 0 ? selectedGeminiStoreIds : undefined,
                  retrievalMode,
                  toolsEnabled,
                  skillsEnabled,
                  enabledSkills: enabledSkillSlugs,
                  memoryEnabled,
                  voiceMode: isDeepgramVoiceActive,
                  imageS3Keys: uploadedS3Keys.length > 0 ? uploadedS3Keys : undefined,
                },
              }
            );
            // Clear pending images after send
            setPendingImages([]);
            pendingImagesRef.current = [];
          } else {
            console.error('sendMessage not available');
            toast.error('Error: Chat functionality unavailable');
          }
        } catch (error) {
          console.error('Error sending message:', error);
          toast.error('Failed to send message: ' + (error as Error).message);
        }
      }
    },
    [
      conversationId,
      selectedAgents,
      orchestrationMode,
      maxRounds,
      ragEnabled,
      geminiFileSearchEnabled,
      selectedGeminiStoreIds,
      toolsEnabled,
      skillsEnabled,
      enabledSkillSlugs,
      memoryEnabled,
      selectedModel,
      sendMessage,
      setMessages,
      autonomousMode,
      isDeepgramVoiceActive,
      handleModelChange,
    ]
  );

  // Wire voice auto-submit ref
  useEffect(() => {
    voiceAutoSubmitRef.current = submitMessage;
  }, [submitMessage]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && pendingImages.length === 0) return;
    const userMessage = input;
    setInput('');
    await submitMessage(userMessage);
  };

  const isLoading =
    status === 'streaming' || status === 'submitted' || isMultiAgentLoading || isAutonomousLoading;

  const isCodingCliRunning = useMemo(() => {
    if (!isLoading) return false;
    let lastAssistant: UIMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistant = messages[i];
        break;
      }
    }
    if (!lastAssistant?.parts || lastAssistant.parts.length === 0) return false;
    return lastAssistant.parts.some(
      (part) => typeof part.type === 'string' && part.type === 'tool-coding_cli'
    );
  }, [isLoading, messages]);

  const [cliHeartbeatStartedAt, setCliHeartbeatStartedAt] = useState<number | null>(null);
  const [cliHeartbeatElapsed, setCliHeartbeatElapsed] = useState(0);

  useEffect(() => {
    if (isCodingCliRunning) {
      if (cliHeartbeatStartedAt === null) {
        setCliHeartbeatStartedAt(Date.now());
      }
    } else if (cliHeartbeatStartedAt !== null) {
      setCliHeartbeatStartedAt(null);
      setCliHeartbeatElapsed(0);
    }
  }, [isCodingCliRunning, cliHeartbeatStartedAt]);

  useEffect(() => {
    if (cliHeartbeatStartedAt === null) return;
    const interval = setInterval(() => {
      setCliHeartbeatElapsed(Math.floor((Date.now() - cliHeartbeatStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [cliHeartbeatStartedAt]);

  // State for showing scroll-to-bottom FAB
  const [showScrollFab, setShowScrollFab] = useState(false);

  // Check if user is near the bottom of the scroll container
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= SCROLL_THRESHOLD;
  }, []);

  // Handle scroll events to track user position
  const handleScroll = useCallback(() => {
    const nearBottom = checkIfNearBottom();
    isUserNearBottom.current = nearBottom;
    // Show FAB when not near bottom and there are messages
    setShowScrollFab(!nearBottom && messages.length > 0);
  }, [checkIfNearBottom, messages.length]);

  // Scroll to bottom function for FAB
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
      isUserNearBottom.current = true;
      setShowScrollFab(false);
    }
  }, []);

  // Scroll to bottom when opening a conversation (initial load or navigation)
  // This ensures the chat shows the most recent messages, not the middle
  const hasInitialScrolled = useRef(false);
  useEffect(() => {
    // Reset scroll flag when conversation changes
    hasInitialScrolled.current = false;
  }, [id]);

  useEffect(() => {
    // Scroll to bottom on initial load with messages
    if (!hasInitialScrolled.current && messages.length > 0 && scrollRef.current) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        isUserNearBottom.current = true;
        hasInitialScrolled.current = true;
      });
    }
  }, [messages.length]);

  // Auto-scroll to bottom - only if user is near bottom
  useEffect(() => {
    if (scrollRef.current && isUserNearBottom.current) {
      // Use instant scroll during streaming for better following
      const behavior = isLoading ? 'instant' : 'smooth';
      scrollRef.current.scrollIntoView({ behavior: behavior as ScrollBehavior });
    }
  }, [messages, isLoading, currentAgent]);

  // Additional scroll trigger during multi-agent streaming - only if user is near bottom
  useEffect(() => {
    if (isMultiAgentLoading && scrollRef.current) {
      const interval = setInterval(() => {
        if (isUserNearBottom.current) {
          scrollRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isMultiAgentLoading]);

  // Reset to near-bottom when user sends a new message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        // User just sent a message, scroll to bottom
        isUserNearBottom.current = true;
        scrollRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      }
    }
  }, [messages.length]);

  // Refresh sidebar when a new conversation gets its first response
  const hasRefreshed = useRef(false);
  useEffect(() => {
    // Only refresh for new conversations (no initial id)
    // and when we have at least one assistant message
    if (!id && !hasRefreshed.current) {
      const hasAssistantMessage = messages.some((m) => m.role === 'assistant');
      if (hasAssistantMessage) {
        hasRefreshed.current = true;
        refreshConversations();
      }
    }
  }, [id, messages]);

  const syncPersistedConversationMessages = useCallback(async () => {
    if (!conversationId) return;
    if (statusRef.current === 'streaming' || statusRef.current === 'submitted') return;
    if (isMultiAgentLoading || isAutonomousLoading) return;

    try {
      const response = await fetch(
        `/api/messages?conversationId=${encodeURIComponent(conversationId)}&order=desc&limit=100`,
        { cache: 'no-store' }
      );
      if (!response.ok) return;
      const data = await response.json();
      const persistedRaw = Array.isArray(data.messages)
        ? (data.messages as PersistedMessage[])
        : [];
      const persisted = [...persistedRaw].reverse(); // Keep chronological order for UI merge
      if (persisted.length === 0) return;

      setMessages((prev) => {
        const next = [...prev];
        const persistedIds = new Set(persisted.map((m) => m.id));
        const localReconciled = new Set<number>();

        const idToIndex = new Map<string, number>();
        next.forEach((m, idx) => idToIndex.set(m.id, idx));

        for (const persistedMsg of persisted) {
          const persistedUiMessage = {
            id: persistedMsg.id,
            role: persistedMsg.role,
            parts: buildPartsFromPersisted(persistedMsg.content || '', persistedMsg.metadata),
          } satisfies UIMessage;

          const existingIndex = idToIndex.get(persistedMsg.id);
          if (existingIndex !== undefined) {
            next[existingIndex] = persistedUiMessage;
            continue;
          }

          const persistedSig = messageSignature(persistedMsg.role, persistedMsg.content || '');
          const localMatchIndex = next.findIndex((candidate, idx) => {
            if (localReconciled.has(idx)) return false;
            if (persistedIds.has(candidate.id)) return false;
            const candidateText = getUiMessageText(candidate);
            const candidateSig = messageSignature(candidate.role, candidateText);
            if (candidateSig === persistedSig) return true;
            return messagesEquivalent(
              candidate.role,
              candidateText,
              persistedMsg.role,
              persistedMsg.content || ''
            );
          });

          if (localMatchIndex >= 0) {
            next[localMatchIndex] = persistedUiMessage;
            localReconciled.add(localMatchIndex);
            idToIndex.set(persistedMsg.id, localMatchIndex);
            continue;
          }

          next.push(persistedUiMessage);
          idToIndex.set(persistedMsg.id, next.length - 1);
        }

        const dedupedById: UIMessage[] = [];
        const seenIds = new Set<string>();
        for (const msg of next) {
          if (seenIds.has(msg.id)) continue;
          seenIds.add(msg.id);
          dedupedById.push(msg);
        }

        const dedupedAdjacentTransient: UIMessage[] = [];
        for (let i = 0; i < dedupedById.length; i++) {
          const msg = dedupedById[i];
          const isPersisted = persistedIds.has(msg.id);
          if (!isPersisted) {
            const prevMsg = i > 0 ? dedupedById[i - 1] : undefined;
            const nextMsg = i < dedupedById.length - 1 ? dedupedById[i + 1] : undefined;
            const msgText = getUiMessageText(msg);

            const hasPersistedNeighborDuplicate = [prevMsg, nextMsg].some((neighbor) => {
              if (!neighbor) return false;
              if (!persistedIds.has(neighbor.id)) return false;
              return messagesEquivalent(
                msg.role,
                msgText,
                neighbor.role,
                getUiMessageText(neighbor)
              );
            });

            if (hasPersistedNeighborDuplicate) {
              continue;
            }
          }

          dedupedAdjacentTransient.push(msg);
        }

        return dedupedAdjacentTransient;
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ChatInterface] Failed to sync persisted messages:', error);
      }
    }
  }, [conversationId, isAutonomousLoading, isMultiAgentLoading, setMessages]);

  useEffect(() => {
    if (!conversationId) return;

    void syncPersistedConversationMessages();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void syncPersistedConversationMessages();
    }, CONVERSATION_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [conversationId, syncPersistedConversationMessages]);

  // Helper to get text content from message - handles multiple formats
  const getMessageContent = (message: UIMessage): string => {
    // Try parts first (AI SDK v6 UIMessage format)
    if (message.parts && message.parts.length > 0) {
      const textContent = message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('');

      if (textContent) return textContent;

      // Fallback: If no text parts, check for tool invocation parts
      // AI SDK v6 uses type: "tool-<toolName>" for tool parts
      // This handles the case where tools were called but the model
      // hasn't generated text yet (e.g., still in multi-step execution)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolParts = message.parts.filter(
        (part: any) => typeof part.type === 'string' && part.type.startsWith('tool-')
      );
      if (toolParts.length > 0) {
        return (
          toolParts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((p: any) => `*Using tool: ${p.type.replace('tool-', '')}...*`)
            .join('\n')
        );
      }
    }

    // Fallback: Check for direct content property (older format or streaming)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgAny = message as any;
    if (typeof msgAny.content === 'string' && msgAny.content) {
      return msgAny.content;
    }

    // Fallback: Check for text property
    if (typeof msgAny.text === 'string' && msgAny.text) {
      return msgAny.text;
    }

    return '';
  };

  // Handle message edit
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!id) {
        toast.error('Cannot edit messages in unsaved conversations');
        return;
      }

      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent, metadata: {} }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to edit message');
      }

      // Note: The UI state is managed locally by ChatMessage component
      // For full sync, we might need to reload the conversation
    },
    [id]
  );

  // Deduplicate messages by ID using Set for O(n) performance instead of O(n²) findIndex
  // Prevents React key warnings from rapid voice submissions
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 sm:py-4 relative"
      >
        <div className="space-y-4 max-w-5xl mx-auto w-full">
          {((conversationId && uniqueMessages.length >= 4) ||
            failoverInfo?.fallbackModels.length) && (
            <div className="flex items-center justify-between">
              <div>
                {failoverInfo && failoverInfo.fallbackModels.length > 0 && (
                  <ModelFailoverBadge
                    primaryModel={selectedModel}
                    fallbackModels={failoverInfo.fallbackModels}
                    isEnabled={true}
                    usedFallback={failoverInfo.usedFallback}
                    actualModel={failoverInfo.modelId}
                  />
                )}
              </div>
              {conversationId && uniqueMessages.length >= 4 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={handleCompact}
                  disabled={isCompacting}
                >
                  <Minimize2 className="mr-1 h-3 w-3" />
                  {isCompacting ? 'Compacting...' : 'Compact'}
                </Button>
              )}
            </div>
          )}
          {uniqueMessages.length === 0 && (
            <>
              <WelcomeScreen />
              <QuickActions onSelectAction={(prompt) => submitMessage(prompt)} />
            </>
          )}
          {uniqueMessages.map((m, i) => {
            // Type for message metadata
            type MessageMetadata = {
              lastEditedAt?: string;
              editHistory?: Array<{ content: string; editedAt: string }>;
              model?: string;
              provider?: string;
              inputTokens?: number;
              outputTokens?: number;
              agentName?: string;
              agentId?: string;
            };
            const msgData = m as unknown as { createdAt?: Date; metadata?: MessageMetadata };

            // Extract image file parts from message parts
            const msgImageParts =
              m.parts
                ?.filter(
                  (p): p is { type: 'file'; mediaType: string; url: string; filename?: string } =>
                    p.type === 'file' &&
                    typeof (p as Record<string, unknown>).mediaType === 'string' &&
                    ((p as Record<string, unknown>).mediaType as string).startsWith('image/')
                )
                .map((p) => ({ mediaType: p.mediaType, url: p.url, filename: p.filename })) || [];

            return (
              <ChatMessage
                key={m.id}
                id={m.id}
                role={m.role as 'user' | 'assistant' | 'system'}
                content={getMessageContent(m)}
                timestamp={msgData.createdAt}
                imageParts={msgImageParts.length > 0 ? msgImageParts : undefined}
                metadata={msgData.metadata}
                onRegenerate={
                  i === uniqueMessages.length - 1 && m.role === 'assistant' ? reload : undefined
                }
                isRegenerating={
                  isLoading && i === uniqueMessages.length - 1 && m.role === 'assistant'
                }
                onEdit={m.role === 'user' && id ? handleEditMessage : undefined}
              />
            );
          })}
          {isCodingCliRunning && (
            <div className="flex justify-start w-full">
              <div className="bg-muted/50 border rounded-lg px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-pulse" />
                <span>CLI is working...</span>
                {cliHeartbeatStartedAt !== null && (
                  <span>
                    elapsed {Math.floor(cliHeartbeatElapsed / 60)}:
                    {String(cliHeartbeatElapsed % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
            </div>
          )}
          {isLoading &&
            uniqueMessages.length > 0 &&
            uniqueMessages[uniqueMessages.length - 1]?.role === 'user' && (
              <div className="flex justify-start w-full">
                <div className="bg-muted/50 border rounded-lg px-4 py-3 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                  {currentAgent && (
                    <span className="ml-2 text-muted-foreground">
                      {currentAgent.name} is typing...
                    </span>
                  )}
                </div>
              </div>
            )}
          {/* Round progress indicator for consensus mode */}
          {roundProgress && (
            <div className="flex justify-center w-full">
              <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-2 text-sm text-primary">
                {roundProgress.phase === 'synthesis' ? (
                  <span>Synthesizing final response...</span>
                ) : (
                  <span>
                    Discussion Round {roundProgress.round} of {roundProgress.maxRounds}
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Autonomous progress indicator */}
          {activeTaskKey && autonomousProgress && (
            <AutonomousProgress
              taskKey={activeTaskKey}
              progress={autonomousProgress}
              onAbort={async () => {
                if (activeTaskKey) {
                  try {
                    await fetch(`/api/task/autonomous?taskKey=${activeTaskKey}`, {
                      method: 'DELETE',
                    });
                    toast.info('Aborting task...');
                  } catch {
                    toast.error('Failed to abort task');
                  }
                }
              }}
              onSteer={async (message) => {
                if (activeTaskKey) {
                  try {
                    const response = await fetch(`/api/task/autonomous/${activeTaskKey}/steer`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ message }),
                    });
                    if (!response.ok) {
                      const data = await response.json();
                      throw new Error(data.error || 'Failed to steer task');
                    }
                    toast.success('Steering message sent');
                  } catch (error) {
                    toast.error('Failed to steer task: ' + (error as Error).message);
                  }
                }
              }}
              onDismiss={() => {
                setActiveTaskKey(null);
                setAutonomousProgress(null);
              }}
            />
          )}
          <div ref={scrollRef} />
        </div>

        {/* Scroll to bottom FAB */}
        {showScrollFab && (
          <Button
            onClick={scrollToBottom}
            size="icon"
            variant="secondary"
            className="absolute bottom-4 right-4 h-10 w-10 rounded-full shadow-lg border bg-background/95 backdrop-blur-sm hover:bg-background z-10 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Voice Overlay - shown when voice conversation is active */}
      {voiceModeEnabled && voiceConversation.isActive && (
        <VoiceOverlay
          state={voiceConversation.state}
          audioLevel={voiceConversation.audioLevel}
          interimText={voiceConversation.interimText}
          isPaused={voiceConversation.isPaused}
          provider={voiceSettings.provider}
          voice={voiceSettings.voice}
          speed={voiceSettings.speed}
          onPause={voiceConversation.pause}
          onResume={voiceConversation.resume}
          onStop={() => {
            voiceConversation.stop();
            handleVoiceModeToggle(false);
          }}
          onSkipSpeaking={voiceConversation.skipSpeaking}
          onProviderChange={(p) => handleVoiceSettingsChange('provider', p)}
          onVoiceChange={(v) => handleVoiceSettingsChange('voice', v)}
          onSpeedChange={(s) => handleVoiceSettingsChange('speed', s)}
        />
      )}

      <ChatInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        conversationId={conversationId}
        onConversationCreated={handleConversationCreated}
        onAgentsChanged={handleAgentsChanged}
        onRagEnabledChanged={handleRagEnabledChanged}
        ragEnabled={ragEnabled}
        geminiFileSearchEnabled={geminiFileSearchEnabled}
        selectedGeminiStoreIds={selectedGeminiStoreIds}
        onGeminiStoreIdsChanged={handleGeminiStoreIdsChanged}
        toolsEnabled={toolsEnabled}
        onToolsEnabledChanged={handleToolsEnabledChanged}
        skillsEnabled={skillsEnabled}
        onSkillsEnabledChanged={handleSkillsEnabledChanged}
        onEnabledSkillsChange={setEnabledSkillSlugs}
        voiceModeActive={voiceModeEnabled && voiceConversation.isActive}
        onVoiceModeToggle={(enabled) => {
          handleVoiceModeToggle(enabled);
          if (enabled) {
            voiceConversation.start();
          } else {
            voiceConversation.stop();
          }
        }}
        memoryEnabled={memoryEnabled}
        autonomousMode={autonomousMode}
        onAutonomousModeChanged={handleAutonomousModeChanged}
        pendingImages={pendingImages}
        onImagesSelected={(files) => {
          setPendingImages((prev) => {
            const next = [...prev, ...files];
            pendingImagesRef.current = next;
            return next;
          });
        }}
        onRemoveImage={(index) => {
          setPendingImages((prev) => {
            const next = prev.filter((_, i) => i !== index);
            pendingImagesRef.current = next;
            return next;
          });
        }}
      />
    </div>
  );
}
