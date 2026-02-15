# New Features - January 31, 2026

This document describes the new features implemented and provides functional testing instructions.

---

## Overview of Changes

1. **Autonomous Tasks Database Support** - Database table for autonomous mode
2. **Sidebar Responsive Fix** - Recent Chats now visible on Full HD monitors
3. **Local Memory File System** - Memory works without Gemini API
4. **Configurable Gemini Retrieval Model** - Uses `gemini-3-flash-preview` by default
5. **User Profile Memory** - Agents learn and remember personal information
6. **My Data (GDPR Privacy)** - View/delete personal data, account deletion

---

## 1. Autonomous Tasks Database Support

### What it does
Creates the `autonomous_tasks` table required for the autonomous mode feature (auto toggle in chat). This enables agents to run multi-step tasks independently.

### How to test
1. Go to the chat interface
2. Enable the **Auto** toggle (next to Tools toggle)
3. Send a message like: "Research the latest news about AI and summarize it"
4. The agent should work autonomously, using tools and completing steps

### Expected behavior
- No database errors when enabling Auto mode
- Agent shows progress as it works through steps
- Task completes with a final summary

### If it fails
- Check server logs for `autonomous_tasks` table errors
- Verify migration ran: Look for `0012_autonomous_tasks.sql` in drizzle folder

---

## 2. Sidebar Responsive Fix for Full HD

### What it does
- Makes the **Management** section collapsible (click the chevron to expand/collapse)
- Guarantees **Recent Chats** section has minimum 160px height
- Ensures conversations are always visible even on 1080p monitors

### How to test
1. Open MaiaChat on a 1920x1080 (Full HD) monitor
2. Look at the left sidebar
3. Verify you can see "Recent Chats" section with your conversations
4. Click the **Management** header to collapse/expand

### Expected behavior
- Recent Chats section should always be visible
- Management section has a chevron icon (▼/▲)
- Clicking "Management" collapses/expands the section
- More room for Recent Chats when Management is collapsed

### If it fails
- Check browser console for React errors
- Verify Collapsible component is imported correctly

---

## 3. Local Memory File System with Auto-Upload to Gemini

### What it does
Creates local `.md` files for conversation memory with intelligent search indexing and automatic Gemini sync.

**Storage location:** `/app/data/memory/{userId}/working_memory.md`
**Search Index:** `/app/data/memory/{userId}/search_index.json`

**Dynamic Thresholds (based on Google API key):**
- **With Google API key:** 500KB / 50 entries → Auto-uploads to Gemini, smaller local files
- **Without Google API key:** 1MB / 100 entries → Larger local files for more storage

**Flow:**
1. Every conversation is summarized and saved to local working memory
2. A search index (BM25-style) is maintained for efficient retrieval
3. When threshold is reached AND user has Google API key:
   - File is archived locally
   - Content is uploaded to Gemini File Search Store automatically
   - New working memory file is started
4. When threshold is reached WITHOUT Google API key:
   - File is archived locally only
   - Larger thresholds allow more local storage

**Local RAG (Search-Based Retrieval):**
- Uses keyword indexing with BM25 scoring
- Only loads relevant entries, not entire file
- Dramatically reduces token usage for large memory files

### How to test

#### Test 1: Memory saves locally with index
1. Start a new conversation
2. Enable **Memory** toggle
3. Have a conversation (at least 4 messages)
4. Check server logs for: `[LocalMemory] Appended memory for conversation...`
5. Verify `search_index.json` is created in the memory directory

#### Test 2: Memory retrieval uses search (not full file)
1. In a new conversation, enable **Memory**
2. Ask: "What did we talk about recently?"
3. Agent should reference past conversations
4. Check logs - should NOT show loading entire file

#### Test 3: Auto-upload to Gemini (with API key)
1. Add Google API key in Settings
2. Have 50+ conversations with Memory enabled (or wait for 500KB threshold)
3. Check server logs for: `[LocalMemory] Uploading archived memory to Gemini...`
4. Verify new memory file is started after upload

#### Test 4: Larger thresholds without Google API key
1. Remove Google API key from Settings
2. Check `/api/memory` or logs for threshold info
3. Threshold should be 1MB / 100 entries (not 500KB / 50)

### Expected behavior
- Logs show: `[LocalMemory] Appended memory for conversation...`
- Chat logs show: `[Chat] Memory context: local=XXXchars, search=XXXchars, gemini=XXXchars`
- With Google API key: Auto-uploads to Gemini at 500KB/50 entries
- Without Google API key: Archives locally at 1MB/100 entries
- Search uses index for efficient retrieval (low token usage)

### If it fails
- Check server has write access to `/app/data/memory/` directory
- Check for errors in: `[LocalMemory]` log prefix
- Verify `search_index.json` exists and is valid JSON

---

## 4. Configurable Gemini Retrieval Model

### What it does
Uses **`gemini-3-flash-preview`** for all Gemini File Search operations:
- Memory retrieval
- Conversation summarization
- RAG document search

This is the latest Gemini 3 Flash model - fast, affordable, 1M token context.

### Where to configure
**Admin Panel → Admin Settings → Memory & Retrieval**

Options:
- `gemini-3-flash-preview` (Recommended - Fast & Affordable)
- `gemini-2.5-flash` (Legacy)
- `gemini-2.0-flash` (Legacy)
- `gemini-2.5-pro` (More capable, slower)

### How to test
1. Go to Admin Settings and check the "Gemini Retrieval Model" dropdown
2. Enable Memory in a conversation
3. Ask about past conversations
4. Check server logs for: `[gemini-stores] searchWithStores called with:`
5. Verify `model: "gemini-3-flash-preview"` in the logs

### Expected behavior
- Logs show model: `gemini-3-flash-preview`
- Memory retrieval is fast (Gemini 3 Flash is optimized for speed)
- No errors about invalid model names

### If it fails
- Model name might need updating if Google changes it
- Check for: `[gemini-stores] searchWithStores error:`

---

## 5. User Profile Memory

### What it does
Automatically learns and remembers personal information about users:
- Name, location, timezone
- Occupation, interests, hobbies
- Communication preferences
- Important facts from conversations

**Storage location:** `/app/data/profiles/{userId}/user_profile.json`

### Where to configure
**Admin Panel → Admin Settings → Memory & Retrieval → User Profile Memory**

Toggle ON/OFF to enable/disable automatic profile learning.

### How to test

#### Test 1: Profile extraction
1. Start a new conversation with Memory enabled
2. Say: "My name is Alex and I live in the UK"
3. Say: "I work as a software developer"
4. Say: "I really enjoy playing chess and hiking"

#### Test 2: Profile is remembered
1. Start a NEW conversation
2. Enable Memory
3. Ask: "What do you know about me?"
4. Agent should mention: name (Alex), location (UK), occupation (software developer), interests

#### Test 3: Check profile file
On the server, check the profile was saved:
```bash
cat /app/data/profiles/{your-user-id}/user_profile.json
```

### Expected behavior
- Agent references your name, location, etc. naturally
- Profile builds up over multiple conversations
- Information is used to personalize responses

### If it fails
- Check logs for: `[UserProfile]` errors
- Verify `/app/data/profiles/` directory exists and is writable
- Check `user_profile_memory_enabled` is true in admin settings

---

## Database Migration

The following changes are made to the database:

### New Table: `autonomous_tasks`
- Stores autonomous task state
- Tracks progress, tool calls, completion status

### New Columns in `admin_settings`
- `gemini_retrieval_model` (default: `gemini-3-flash-preview`)
- `user_profile_memory_enabled` (default: `true`)

### Migration File
`drizzle/0012_autonomous_tasks.sql`

---

## Files Changed

### New Files
- `src/lib/memory/local-memory.ts` - Local memory file system
- `src/lib/memory/user-profile.ts` - User profile memory
- `src/app/(dashboard)/settings/my-data/page.tsx` - GDPR privacy controls page
- `src/app/api/user/profile/route.ts` - User profile data API
- `src/app/api/user/delete-account/route.ts` - Account deletion API
- `drizzle/0012_autonomous_tasks.sql` - Database migration
- `docs/2026-01-31-new-features.md` - This documentation

### Modified Files
- `src/components/layout/Sidebar.tsx` - Collapsible Management section
- `src/lib/db/schema.ts` - New columns in admin_settings
- `src/lib/ai/gemini-stores.ts` - Configurable retrieval model
- `src/lib/memory/memory-store.ts` - Improved logging
- `src/lib/memory/summarizer.ts` - Uses gemini-3-flash-preview
- `src/lib/channels/processor.ts` - Saves to local + Gemini memory
- `src/app/api/chat/route.ts` - Local memory + profile retrieval
- `src/app/api/memory/save/route.ts` - Saves to local + Gemini
- `src/app/admin/settings/page.tsx` - Memory & Retrieval settings UI
- `src/app/(dashboard)/settings/page.tsx` - Added My Data link

---

## Troubleshooting

### Error: `column "gemini_retrieval_model" does not exist`
**Solution:** Run migration locally: `npm run db:push`

### Error: `ECONNREFUSED 127.0.0.1:1234` (LM Studio)
**This is normal** - LM Studio is not running locally. Ignore this warning.

### Error: `ECONNREFUSED 127.0.0.1:11434` (Ollama)
**This is normal** - Ollama is not running locally. Ignore this warning.

### Memory not working
1. Check Google API key is set in Settings
2. Check Memory toggle is enabled in chat
3. Check server logs for `[Memory Store]` or `[LocalMemory]` errors

### User profile not being learned
1. Check `user_profile_memory_enabled` in admin settings
2. Use clear phrases like "My name is..." or "I live in..."
3. Check server logs for `[UserProfile]` messages

### My Data page not loading
1. Make sure you're logged in
2. Check browser console for API errors
3. Verify `/api/user/profile` endpoint is accessible

### Account deletion fails
1. Ensure confirmation text is exactly `DELETE MY ACCOUNT`
2. Check server logs for deletion errors
3. Database foreign key constraints may need attention

---

## 6. My Data (GDPR Privacy Controls)

### What it does
Provides a GDPR-compliant interface for users to view, manage, and delete their personal data:
- View what AI agents have learned about them
- Delete specific facts or entire profile
- Clear all conversation memory
- Delete their account and all associated data

### How to access
**Settings → My Data & Privacy → View My Data**

### Features

#### View Profile Data
- Basic info: Name, location, timezone
- Professional: Occupation, company
- Interests: Hobbies, interests
- Learned Facts: All facts extracted from conversations

#### Delete Options
- Delete individual facts (click trash icon next to each)
- Clear specific categories (name, location, occupation, interests)
- Clear all profile data
- Delete account entirely

### How to test

#### Test 1: View learned data
1. Go to **Settings → My Data**
2. View what agents have learned about you
3. Each section should be expandable/collapsible

#### Test 2: Delete a fact
1. Find a fact in the "Learned Facts" section
2. Click the trash icon next to it
3. Fact should be removed immediately

#### Test 3: Clear all profile
1. Click "Clear All" button in the profile section
2. Confirm in the dialog
3. All profile data should be cleared

#### Test 4: Account deletion preview
1. Scroll to "Delete Account" section
2. Click "Delete My Account"
3. View the data that will be deleted
4. Cancel (unless you want to delete)

### Expected behavior
- All profile data loads correctly
- Deletion is immediate and reflected in UI
- Account deletion requires typing "DELETE MY ACCOUNT" to confirm
- After account deletion, user is logged out and redirected

### GDPR Compliance
- Right to access: Users can view all stored data
- Right to rectification: Users can delete incorrect information
- Right to erasure (Right to be forgotten): Users can delete all data including account
- Data portability: Data shown in structured format

---

## Quick Verification Checklist

- [ ] App starts without database errors
- [ ] Sidebar shows Recent Chats on Full HD monitor
- [ ] Management section can be collapsed/expanded
- [ ] Auto mode doesn't throw database errors
- [ ] Memory saves to local file (check logs)
- [ ] Memory retrieval works (ask "what did we discuss?")
- [ ] Gemini model shows as `gemini-3-flash-preview` in logs
- [ ] User profile extraction works ("My name is...")
- [ ] Profile remembered in new conversation
- [ ] My Data page loads without errors
- [ ] Can delete individual facts from profile
- [ ] Account deletion preview shows correct data counts
