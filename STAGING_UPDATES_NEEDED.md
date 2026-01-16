# Staging Branch Updates Needed

## Current Status

- **Main branch:** Updated with all fixes (but doesn't use Cloudflare)
- **Staging branch:** Uses Cloudflare but has old code that needs updates

## Required Updates for Staging Branch

### 1. Cloudflare Function (`frontend/functions/api/[[path]].js`)

**Current (staging):**
- Uses `http://` (insecure)
- Hardcoded BACKEND_URL
- Overly permissive CORS (`*`)

**Needed:**
- Use HTTPS
- Support `BACKEND_URL` environment variable
- Configurable CORS via `ALLOWED_ORIGINS`

**Status:** ✅ Fixed in main, needs to be merged to staging

### 2. Frontend Axios Configuration

**Current (staging):**
- No axios configuration
- Doesn't use `REACT_APP_API_URL` environment variable
- All API calls use relative URLs

**Needed:**
- Create `frontend/src/api/axiosConfig.js`
- Import in `frontend/src/index.js`
- Use `REACT_APP_API_URL` when set in Cloudflare Pages

**Status:** ✅ Created in main, needs to be merged to staging

### 3. Frontend Proxy Port

**Current (staging):**
- `frontend/package.json` has `"proxy": "http://localhost:9000"`

**Needed:**
- Change to `"proxy": "http://localhost:5000"`

**Status:** ✅ Fixed in main, needs to be merged to staging

## How to Apply Updates

### Option 1: Merge from Main (Recommended)
```bash
git checkout staging
git merge main
# Resolve any conflicts if needed
git push origin staging
```

### Option 2: Cherry-pick Specific Files
```bash
git checkout staging
git checkout main -- frontend/functions/api/[[path]].js
git checkout main -- frontend/src/api/axiosConfig.js
git checkout main -- frontend/src/index.js
git checkout main -- frontend/package.json
git add .
git commit -m "Update Cloudflare function and add axios config for REACT_APP_API_URL"
git push origin staging
```

## Cloudflare Pages Environment Variables

After merging, ensure these are set in Cloudflare Pages:

1. **`REACT_APP_API_URL`** ⚠️ **REQUIRED**
   - Value: `http://your-beanstalk-url.elasticbeanstalk.com` (use `http://` if Beanstalk doesn't have HTTPS)
   - Or: `https://your-beanstalk-url.elasticbeanstalk.com` (if HTTPS is properly configured)
   - This enables direct backend access (bypasses Cloudflare function)
   - **Note:** If Beanstalk has HTTPS issues, use `http://` as a workaround

2. **`BACKEND_URL`** (Optional - for Cloudflare function fallback)
   - Value: `http://your-beanstalk-url.elasticbeanstalk.com` (use `http://` if Beanstalk doesn't have HTTPS)
   - Or: `https://your-beanstalk-url.elasticbeanstalk.com` (if HTTPS is properly configured)
   - Only needed if not using `REACT_APP_API_URL`
   - **Note:** Defaults to `http://` if protocol not specified (workaround for Beanstalk HTTPS issues)

3. **`ALLOWED_ORIGINS`** (Optional - for Cloudflare function CORS)
   - Value: `https://your-frontend-domain.com`
   - Comma-separated if multiple origins

## Testing After Update

1. ✅ Frontend should use `REACT_APP_API_URL` directly (check network tab - should see requests to Beanstalk URL)
2. ✅ Cloudflare function should use HTTPS (if `REACT_APP_API_URL` is not set)
3. ✅ CORS should be properly configured
4. ✅ All API calls should work correctly

## Notes

- The axios configuration in `frontend/src/api/axiosConfig.js` will automatically use `REACT_APP_API_URL` when set
- If `REACT_APP_API_URL` is not set, it falls back to relative URLs (which go through Cloudflare function)
- **Recommendation:** Set `REACT_APP_API_URL` in Cloudflare Pages for direct backend access (more efficient)
