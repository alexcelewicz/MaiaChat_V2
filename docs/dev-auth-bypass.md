# Development Auth Bypass

## Overview

The development auth bypass allows you to test the MAIAChat UI and features without setting up Firebase authentication. This is **development-only** and **automatically disabled in production**.

## How It Works

When enabled, the app:
- ✅ Bypasses all Firebase authentication checks
- ✅ Returns a mock user for all API calls
- ✅ Allows access to all protected routes
- ✅ Redirects `/login` and `/register` to `/chat` automatically

## Setup

### Enable Bypass

Add this single line to your `.env.local` file:

```env
DEV_BYPASS_AUTH=true
```

**That's it!** No other configuration needed.

### Disable Bypass

Simply remove or comment out the line:

```env
# DEV_BYPASS_AUTH=true
```

Or set it to `false`:

```env
DEV_BYPASS_AUTH=false
```

## Safety Features

The bypass is **automatically disabled** if:

1. `NODE_ENV` is not `"development"` (production/test environments)
2. `DEV_BYPASS_AUTH` is not explicitly set to `"true"`

This means:
- ✅ **Production**: Bypass is always disabled, even if the env var exists
- ✅ **Test**: Bypass is disabled to ensure proper testing
- ✅ **Development**: Only works when explicitly enabled

## Mock User Details

When bypass is enabled, all API calls use this mock user:

```typescript
{
  id: "dev-user-00000000-0000-0000-0000-000000000001",
  email: "dev@localhost.test",
  role: "user",
  preferences: { name: "Dev User" }
}
```

## Implementation Details

### Files Modified

The bypass is implemented in three files:

1. **`src/middleware.ts`** - Handles route protection and redirects
2. **`src/lib/auth/session.ts`** - Returns mock user for `getCurrentUser()` and `getSessionUserId()`
3. **`src/lib/firebase/admin.ts`** - Skips Firebase admin initialization when bypass is enabled (prevents startup errors)

### Code Locations

All bypass logic is clearly marked with comments:

```typescript
/**
 * =============================================================================
 * DEV MODE AUTH BYPASS
 * =============================================================================
 * ...
 */
```

## Testing

After enabling the bypass:

1. Restart your Next.js dev server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

2. Visit `http://localhost:3000`
   - You should be automatically redirected to `/chat` (or `/dashboard`)
   - No login required!

3. Test API endpoints:
   ```bash
   curl http://localhost:3000/api/auth/me
   ```
   Should return the mock user data.

## Troubleshooting

### Bypass Not Working?

1. **Check `.env.local`**:
   ```bash
   cat .env.local | grep DEV_BYPASS_AUTH
   ```
   Should show: `DEV_BYPASS_AUTH=true`

2. **Check NODE_ENV**:
   ```bash
   echo $NODE_ENV
   ```
   Should be `development` (or unset, which defaults to development)

3. **Restart the server**:
   Environment variables are only loaded on server start.

4. **Check console logs**:
   The middleware logs when bypass is active (in development mode).

### Still Having Issues?

- Make sure you're not in production mode
- Verify the `.env.local` file is in the `maiachat-v2/` directory
- Check that there are no syntax errors in `.env.local`
- Try removing the line and adding it again

## Reverting Changes

To completely remove the bypass feature:

1. Remove `DEV_BYPASS_AUTH=true` from `.env.local`
2. The code will remain but won't activate (safe to leave)

If you want to remove the code entirely, delete these sections:
- `src/middleware.ts`: Lines 4-20, 26-34
- `src/lib/auth/session.ts`: Lines 13-32, 59-62, 150-153, 188-191
- `src/lib/firebase/admin.ts`: Lines 5-15, 17-28, 32-33

**Note**: The code is well-documented and safe to leave in place. It only activates when explicitly enabled in development.

## Next Steps

Once you're ready to test with real authentication:

1. Remove `DEV_BYPASS_AUTH=true` from `.env.local`
2. Set up Firebase credentials (see `env.example`)
3. Restart the server
4. Test the login flow

---

**Last Updated**: 2025-01-XX  
**Status**: ✅ Implemented and Tested
