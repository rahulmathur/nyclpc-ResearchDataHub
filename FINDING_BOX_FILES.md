# How to Find Files Uploaded to Box.com

If you can't see service accounts on Box.com, here are several ways to find and access your uploaded files.

## Method 1: Use the Folder Info Endpoint (Easiest)

I've added a new endpoint that gives you direct access to your project folder:

```bash
# Get folder URL and info
curl http://localhost:5001/api/projects/{projectId}/folder-info

# Get folder URL AND create a shared link (recommended)
curl http://localhost:5001/api/projects/{projectId}/folder-info?createSharedLink=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "folderId": "362946683803",
    "folderName": "29928f7e-3fb1-4304-82b6-6981068b7ef7",
    "boxPath": "/LPC-ResearchDataHub/STAGING/29928f7e-3fb1-4304-82b6-6981068b7ef7/",
    "boxUrl": "https://app.box.com/folder/362946683803",
    "sharedLink": "https://app.box.com/s/abc123xyz",
    "ownedBy": {
      "id": "223194937",
      "name": "Service Account Name",
      "login": "service@example.com"
    },
    "currentAccount": {
      "id": "223194937",
      "name": "Service Account Name"
    }
  }
}
```

**To access files:**
1. Use `boxUrl` - Direct link to the folder (requires Box login with access)
2. Use `sharedLink` - Public link (if created with `?createSharedLink=true`)

---

## Method 2: Use the Verify Endpoint

Check which account is being used:

```bash
curl http://localhost:5001/api/box/verify
```

This shows:
- Which authentication method is active
- Which account files are uploaded to
- Where to find the files

---

## Method 3: Use Folder URLs from Upload Response

When you upload a file, the response includes a `boxUrl`. You can also construct the folder URL:

```
https://app.box.com/folder/{folderId}
```

Where `folderId` comes from your backend logs (e.g., `362946683803`).

---

## Method 4: Search in Box.com

1. Log into Box.com
2. Use the search bar (top of page)
3. Search for: `LPC-ResearchDataHub`
4. Or search for a specific project GUID (from your database)

**Note:** You'll only see files if:
- You're logged in as the account that owns them (Developer Token owner)
- You have access to the enterprise service account
- The folder has been shared with you
- You use a shared link

---

## Method 5: Check Backend Logs

When files are uploaded, the backend logs show:

```
Box.com: File uploaded to account: 223194937 (User Name)
Box.com: Folder owned by account: 223194937 (User Name)
Box.com: URL: https://app.box.com/file/123456789
```

Use these URLs to access files directly.

---

## Method 6: Create Shared Links (Recommended for Easy Access)

The easiest way to access files without admin access is to create shared links:

### Via API:
```bash
# Create a shared link for a project folder
curl "http://localhost:5001/api/projects/{projectId}/folder-info?createSharedLink=true"
```

### Via Box.com (if you can access the folder):
1. Navigate to the folder using the `boxUrl` from the API
2. Click "Share" → "Create shared link"
3. Copy the link and share it

---

## Troubleshooting

### "I can't see the files in Box.com"

1. **Check which account owns the files:**
   ```bash
   curl http://localhost:5001/api/box/verify
   ```

2. **Get the folder URL:**
   ```bash
   curl http://localhost:5001/api/projects/{projectId}/folder-info
   ```

3. **Create a shared link:**
   ```bash
   curl "http://localhost:5001/api/projects/{projectId}/folder-info?createSharedLink=true"
   ```

4. **Use the shared link** - This works even if you don't have direct access to the account

### "The folder URL doesn't work"

- You need to be logged into Box.com as a user with access to that account
- Or use a shared link instead
- Or ask a Box admin to share the folder with your account

### "I don't have admin access"

- Use shared links (Method 6 above)
- Ask a Box admin to:
  1. Find the service account
  2. Share the `LPC-ResearchDataHub` folder with your account
  3. Or give you admin access

---

## Quick Reference

| Method | When to Use | Requires |
|--------|-------------|----------|
| Folder Info Endpoint | Always works | API access |
| Shared Link | Easiest access | API access to create link |
| Box.com Search | If you have access | Box.com login + access |
| Direct Folder URL | If you know folder ID | Box.com login + access |
| Verify Endpoint | To check account | API access |

---

## Example: Getting Folder Access

```bash
# Step 1: Check which account is being used
curl http://localhost:5001/api/box/verify

# Step 2: Get folder info and create shared link
curl "http://localhost:5001/api/projects/1/folder-info?createSharedLink=true"

# Step 3: Use the sharedLink from the response to access files
# Open in browser: https://app.box.com/s/abc123xyz
```

The shared link allows anyone with the link to access the folder, even without a Box account (depending on permissions).
