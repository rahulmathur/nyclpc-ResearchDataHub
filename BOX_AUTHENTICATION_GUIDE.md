# Box.com Authentication Guide

This document explains the different Box authentication methods and where files are uploaded.

## Authentication Methods

### 1. Developer Token (Testing/Development)

**Configuration:**
```env
BOX_DEVELOPER_TOKEN=your_token_here
```

**How it works:**
- Uses a temporary token (expires in 60 minutes)
- Files are uploaded to **the account that generated the token**
- Easy to test - just generate a token in Box Developer Console
- **Files go to:** The user account that created the Developer Token

**Where to find files:**
- Log into Box.com as the user who generated the Developer Token
- Navigate to: `LPC-ResearchDataHub/STAGING/{project-guid}/` or `LPC-ResearchDataHub/PRODUCTION/{project-guid}/`

**Pros:**
- ✅ Simple setup
- ✅ Files go to a specific user account you control
- ✅ Good for testing

**Cons:**
- ❌ Token expires every 60 minutes (must regenerate)
- ❌ Not suitable for production
- ❌ Manual token refresh required

---

### 2. User-Level CCG (Client Credentials Grant)

**Configuration:**
```env
BOX_USER_ID=223194937
BOX_CLIENT_ID=your_client_id
BOX_CLIENT_SECRET=your_client_secret
# Do NOT set BOX_DEVELOPER_TOKEN
```

**How it works:**
- Uses OAuth2 Client Credentials Grant with a specific user ID
- Files are uploaded to **the specified user account (User ID: 223194937)**
- Requires Box app to be configured for user-level CCG
- **Files go to:** The user account specified by `BOX_USER_ID`

**Where to find files:**
- Log into Box.com as User ID 223194937 (or an admin with access)
- Navigate to: `LPC-ResearchDataHub/STAGING/{project-guid}/` or `LPC-ResearchDataHub/PRODUCTION/{project-guid}/`

**Setup Requirements:**
1. Go to Box Developer Console → your app → Configuration
2. Under "Advanced Features", enable "Service Account" (user-level CCG)
3. Ensure User ID 223194937 is set up as a service account user in your Box enterprise

**Pros:**
- ✅ Files go to a specific user account
- ✅ Automatic token refresh (no manual intervention)
- ✅ Suitable for production
- ✅ Persistent authentication

**Cons:**
- ❌ Requires Box app configuration
- ❌ May fail with "invalid_grant" if not properly configured

**Common Error:**
```
"invalid_grant" - "Grant credentials are invalid"
```
**Solution:** Configure the Box app for user-level CCG in Box Developer Console.

---

### 3. Enterprise-Level CCG (Client Credentials Grant)

**Configuration:**
```env
BOX_ENTERPRISE_ID=313549760
BOX_CLIENT_ID=your_client_id
BOX_CLIENT_SECRET=your_client_secret
# Do NOT set BOX_DEVELOPER_TOKEN or BOX_USER_ID
```

**How it works:**
- Uses OAuth2 Client Credentials Grant at enterprise level
- Files are uploaded to **the enterprise service account**
- **Files go to:** The enterprise service account (not a specific user)

**Where to find files:**
- Log into Box.com as a Box Admin
- Go to Admin Console → Users → Service Accounts
- Find the service account associated with your Box app
- Navigate to: `LPC-ResearchDataHub/STAGING/{project-guid}/` or `LPC-ResearchDataHub/PRODUCTION/{project-guid}/`
- **OR** use the folder URL: `https://app.box.com/folder/{folder-id}`

**Pros:**
- ✅ Automatic token refresh
- ✅ Suitable for production
- ✅ No user-specific configuration needed
- ✅ Works out of the box (if app supports enterprise CCG)

**Cons:**
- ❌ Files go to service account (harder to access)
- ❌ Requires admin access to view files
- ❌ May need to share folders with specific users

---

## Priority Order

The authentication method is chosen in this order:

1. **Developer Token** (if `BOX_DEVELOPER_TOKEN` is set) - **Highest Priority**
2. **User-Level CCG** (if `BOX_USER_ID` is set)
3. **Enterprise-Level CCG** (if `BOX_ENTERPRISE_ID` is set)

**Important:** If `BOX_DEVELOPER_TOKEN` is set, it will **always** be used, even if CCG credentials are configured.

---

## Verifying Which Account is Being Used

### Method 1: Check Backend Logs

When the server starts or uploads a file, look for:
```
Box.com: Uploading to account: 223194937 (User Name)
Box.com: File uploaded to account: 223194937 (User Name)
```

### Method 2: Use the Verify Endpoint

Call `GET /api/box/verify` to see which account is authenticated:

```bash
curl http://localhost:5001/api/box/verify
```

Response:
```json
{
  "success": true,
  "authMethod": "Developer Token",
  "user": {
    "id": "223194937",
    "name": "John Doe",
    "login": "john@example.com"
  },
  "note": "Using Developer Token - files go to the token owner's account"
}
```

### Method 3: Check Folder Ownership

When a folder is created, logs show:
```
Box.com: Folder owned by account: 223194937 (User Name)
```

---

## Troubleshooting

### "Files are being written but I can't find them"

1. **Check which account is being used:**
   - Call `/api/box/verify` endpoint
   - Check backend logs for "Uploading to account" messages

2. **If using Developer Token:**
   - Log into Box.com as the user who generated the token
   - Search for "LPC-ResearchDataHub" in Box.com

3. **If using Enterprise CCG:**
   - Log into Box.com as a Box Admin
   - Go to Admin Console → Service Accounts
   - Find your app's service account
   - Or use the folder URL from the upload response

4. **If using User-Level CCG:**
   - Log into Box.com as User ID 223194937
   - Or as an admin with access to that account
   - Search for "LPC-ResearchDataHub"

### "invalid_grant" Error

This means the Box app is not configured for the authentication method you're trying to use.

**For User-Level CCG:**
- Configure the app for user-level CCG in Box Developer Console
- Ensure User ID 223194937 is set up as a service account user

**For Enterprise-Level CCG:**
- Ensure the app supports enterprise-level CCG
- Check that `BOX_ENTERPRISE_ID` is correct

---

## Recommended Configuration

### For Development/Testing:
```env
BOX_DEVELOPER_TOKEN=your_token
# Comment out CCG credentials
# BOX_USER_ID=223194937
# BOX_CLIENT_ID=...
# BOX_CLIENT_SECRET=...
```

### For Production (User-Specific):
```env
# Comment out Developer Token
# BOX_DEVELOPER_TOKEN=...
BOX_USER_ID=223194937
BOX_CLIENT_ID=your_client_id
BOX_CLIENT_SECRET=your_client_secret
BOX_ENTERPRISE_ID=313549760
```

### For Production (Enterprise Service Account):
```env
# Comment out Developer Token and User ID
# BOX_DEVELOPER_TOKEN=...
# BOX_USER_ID=223194937
BOX_CLIENT_ID=your_client_id
BOX_CLIENT_SECRET=your_client_secret
BOX_ENTERPRISE_ID=313549760
```

---

## File Location Structure

Regardless of authentication method, files follow this structure:

```
LPC-ResearchDataHub/
  └── STAGING/  (or PRODUCTION in production mode)
       └── {project-guid}/
            └── [uploaded files]
```

Where:
- `LPC-ResearchDataHub` = Value of `BOX_ROOT_FOLDER` (default)
- `STAGING` or `PRODUCTION` = Based on `NODE_ENV` (development = STAGING, production = PRODUCTION)
- `{project-guid}` = The `hub_project_guid` from your database
