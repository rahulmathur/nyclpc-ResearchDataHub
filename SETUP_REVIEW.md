# Setup Review & Recommendations

**Date:** January 2025  
**Project:** NYC LPC Research Data Hub

## Executive Summary

The codebase is well-structured with good separation of concerns. However, there are several critical configuration issues and security concerns that need immediate attention before production deployment.

---

## ✅ Strengths

1. **Clean Architecture**
   - Well-organized controllers pattern
   - Database utilities properly abstracted
   - Modular component structure in frontend

2. **Security Measures**
   - Parameterized queries throughout (prevents SQL injection)
   - Query endpoint has read-only restrictions, timeouts, and row limits
   - Input validation in controllers

3. **Deployment Documentation**
   - Clear DEPLOYMENT.md with staging setup instructions
   - Migration scripts for dev → staging
   - Smoke test scripts for validation

4. **Environment Management**
   - Separate dev/staging configurations
   - SSL certificate handling for AWS RDS

---

## 🚨 Critical Issues

### 1. Port Mismatch (HIGH PRIORITY) ✅ FIXED
**Location:** `frontend/package.json:37`
- **Issue:** Frontend proxy points to port `9000`, but backend runs on port `5000`
- **Impact:** Local development will fail to connect to backend
- **Fix:** ✅ Changed proxy to `http://localhost:5000`

### 2. Cloudflare Function Security (HIGH PRIORITY) ✅ FIXED
**Location:** `frontend/functions/api/[[path]].js:2`
- **Issue:** 
  - Uses `http://` instead of `https://` (security risk)
  - Hardcoded backend URL (not configurable)
  - Overly permissive CORS (`Access-Control-Allow-Origin: *`)
- **Impact:** Security vulnerabilities, difficult to maintain
- **Fix:** ✅ Updated to use HTTPS, environment variables (`BACKEND_URL`, `ALLOWED_ORIGINS`), and configurable CORS

### 3. Missing Environment Configuration Files
**Location:** `backend/` directory
- **Issue:** No `.env.example` file exists
- **Impact:** New developers don't know required environment variables
- **Fix:** Create `.env.example` with all required variables (without sensitive values)

### 4. Frontend API Configuration ✅ FIXED
**Location:** `frontend/src/` components
- **Issue:** Frontend uses relative URLs (`/api/...`) but doesn't support `REACT_APP_API_URL` environment variable
- **Impact:** Cannot easily switch between local and staging/production backends
- **Fix:** ✅ Created `frontend/src/api/axiosConfig.js` that configures axios to use `REACT_APP_API_URL` when set, imported in `index.js` to configure globally

### 5. CORS Configuration (MEDIUM PRIORITY) ✅ FIXED
**Location:** `backend/server.js:13`
- **Issue:** `app.use(cors())` allows all origins
- **Impact:** Security risk in production
- **Fix:** ✅ Configured CORS to use `CORS_ORIGIN` environment variable, restricts origins in production

### 6. SQL Files in Repository
**Location:** `backend/` directory
- **Issue:** Multiple `.sql` files present despite `.gitignore` excluding them
- **Impact:** Potential data exposure, repository bloat
- **Fix:** Remove SQL files or move to separate backup location

---

## ⚠️ Medium Priority Issues

### 7. No Authentication/Authorization
- **Issue:** All endpoints are publicly accessible
- **Impact:** Anyone can modify/delete data
- **Recommendation:** Implement authentication middleware (JWT, API keys, etc.)

### 8. Error Handling
- **Issue:** Some endpoints may not handle all error cases gracefully
- **Recommendation:** Add consistent error handling middleware

### 9. Logging
- **Issue:** Limited logging for debugging and monitoring
- **Recommendation:** Add structured logging (Winston, Pino, etc.)

### 10. Rate Limiting
- **Issue:** No rate limiting on API endpoints
- **Recommendation:** Add rate limiting middleware (express-rate-limit)

---

## 📋 Recommended Actions

### Immediate (Before Next Deployment)
1. ✅ **DONE** Fix frontend proxy port (9000 → 5000)
2. ✅ **DONE** Update Cloudflare function to use HTTPS and environment variables
3. ⚠️ **PARTIAL** Create `.env.example` files (blocked by .gitignore - see notes below)
4. ✅ **DONE** Configure frontend to use `REACT_APP_API_URL` (axios configuration created)
5. ✅ **DONE** Restrict CORS origins in backend

### Short Term (Next Sprint)
6. Remove or archive SQL backup files from repository
7. Implement authentication/authorization
8. Add comprehensive error handling
9. Set up structured logging

### Long Term (Future Enhancements)
10. Add rate limiting
11. Implement API versioning
12. Add request/response validation middleware
13. Set up monitoring and alerting
14. Add API documentation (Swagger/OpenAPI)

---

## 🔧 Configuration Checklist

### Backend Environment Variables
```env
# Required
PORT=5000
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database
DB_USER=your_username
DB_PASSWORD=your_password

# Optional
NODE_ENV=development
MAX_QUERY_ROWS=1000
QUERY_TIMEOUT_MS=5000
CORS_ORIGIN=http://localhost:3000
```

### Frontend Environment Variables
```env
# Development (optional - uses proxy)
REACT_APP_API_URL=http://localhost:5000

# Production/Staging (required)
REACT_APP_API_URL=https://your-backend-url.com
```

### Cloudflare Pages Environment Variables
```env
REACT_APP_API_URL=https://your-beanstalk-url.elasticbeanstalk.com
BACKEND_URL=https://your-beanstalk-url.elasticbeanstalk.com
```

---

## 📝 Notes

- The `.gitignore` file correctly excludes `.env` files and `*.sql` files, but existing SQL files should be removed
- The backend correctly handles SSL certificates for AWS RDS
- Migration scripts are well-structured for dev → staging workflows
- Smoke test script provides good validation

---

## 🎯 Priority Matrix

| Issue | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Port mismatch | HIGH | Low | High |
| Cloudflare function security | HIGH | Medium | High |
| Missing .env.example | MEDIUM | Low | Medium |
| Frontend API config | MEDIUM | Medium | Medium |
| CORS configuration | MEDIUM | Low | Medium |
| SQL files in repo | LOW | Low | Low |
| Authentication | HIGH | High | Critical |
| Error handling | MEDIUM | Medium | Medium |
| Logging | LOW | Medium | Low |
| Rate limiting | MEDIUM | Low | Medium |

---

## ✅ Fixes Applied

The following fixes have been implemented:

1. **Frontend Proxy Port** - Fixed port mismatch (9000 → 5000)
2. **Cloudflare Function** - Updated to use HTTPS, environment variables, and configurable CORS
3. **Backend CORS** - Configured to respect `CORS_ORIGIN` environment variable
4. **Frontend API Configuration** - Created axios configuration that uses `REACT_APP_API_URL` when set, works with all existing code

## 📝 Additional Notes

- `.env.example` files cannot be created directly (blocked by .gitignore). Create them manually:
  - `backend/.env.example` - See configuration checklist above
  - `frontend/.env.example` - See configuration checklist above
- ✅ Frontend axios configuration: Created `frontend/src/api/axiosConfig.js` that automatically uses `REACT_APP_API_URL` when set
- Cloudflare Pages environment variables needed:
  - `REACT_APP_API_URL` - ⚠️ **IMPORTANT:** Set this to your Elastic Beanstalk HTTPS URL for direct backend access
  - `BACKEND_URL` - Your Elastic Beanstalk HTTPS URL (for Cloudflare function, if not using direct access)
  - `ALLOWED_ORIGINS` - Comma-separated list of allowed origins (e.g., `https://your-domain.com`)

---

**Next Steps:** 
1. Create `.env.example` files manually (see configuration checklist)
2. Configure Cloudflare Pages environment variables
3. Consider implementing axios base URL configuration in frontend
4. Review remaining medium/low priority items

