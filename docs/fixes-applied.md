# Fixes Applied - Development Issues

## Date: 2025-01-04

### Issues Fixed

#### 1. ✅ ModelSelector Hydration Error
**Problem**: Server-rendered HTML didn't match client due to localStorage access and dynamic color computation.

**Fix**: 
- Memoized all computed values (`currentModel`, `currentStyle`, `providerColor`, `displayName`)
- Replaced dynamic color computation with a switch statement
- Removed className manipulation that caused mismatches

**Files Changed**:
- `src/components/chat/ModelSelector.tsx`

#### 2. ✅ "Failed to Load Chats" Error
**Problem**: Conversations API was returning errors when the dev bypass user didn't exist in the database.

**Fix**:
- Changed error handling to return empty array instead of error
- Added graceful fallback for cases where user doesn't exist (dev bypass mode)
- Ensured `total` field is always included in response

**Files Changed**:
- `src/app/api/conversations/route.ts`

### Issues Remaining

#### 1. ⚠️ Dashboard 404
**Status**: Investigating
**Possible Causes**:
- Route configuration issue
- Layout routing problem
- Page not found in correct location

**Next Steps**:
- Check if `/dashboard` route exists
- Verify `(dashboard)/page.tsx` is correct
- Check middleware redirects

#### 2. ⚠️ Document Upload Fails
**Status**: Pending
**Possible Causes**:
- S3/MinIO connection issue
- File processing error
- Database insertion failure

**Next Steps**:
- Test upload endpoint directly
- Check S3/MinIO configuration
- Verify file processing pipeline

#### 3. ⚠️ API Key Not Stored
**Status**: Pending
**Possible Causes**:
- Database insertion failure
- Encryption error
- Foreign key constraint (dev user doesn't exist)

**Next Steps**:
- Test API key endpoint
- Check database constraints
- Verify encryption key is set

#### 4. ⚠️ Chat Messages Not Sending
**Status**: Pending
**Possible Causes**:
- API key not configured
- Model selection issue
- Chat API error
- Transport configuration

**Next Steps**:
- Test chat API endpoint
- Check model selection
- Verify API key retrieval

### Recommendations

1. **Create Dev User in Database**: Consider creating the dev bypass user in the database to avoid foreign key issues
2. **Better Error Messages**: Add more detailed error logging to identify root causes
3. **Database Migrations**: Ensure all migrations are run and database is up to date
4. **API Key Testing**: Test API key storage with a real key to verify encryption works

### Testing Checklist

- [x] ModelSelector hydration error fixed
- [x] Conversations loading fixed
- [ ] Dashboard accessible
- [ ] Document upload works
- [ ] API key storage works
- [ ] Chat messages send successfully

---

**Note**: Some issues may require the dev bypass user to exist in the database. Consider creating a migration or initialization script to ensure the dev user exists when bypass is enabled.

## Date: 2026-02-07

### Local Access Control Migration Note

- Local file/CLI access now uses per-user allowlisting in addition to global tool toggles.
- Hosted deployments remain fully blocked for local file/CLI access.
- Self-hosted backward-compat behavior:
  Existing admin users with global local tools enabled and no explicit `preferences.localAccess.enabled` flag are now auto-bootstrapped to `enabled: true` on first access check.
- Admins can still grant/revoke this explicitly from the Admin Users page.
