# Box.com File Management Integration - Setup Instructions

## Overview
This integration adds Box.com file management capabilities to projects, allowing users to upload, view, create folders, and delete files within project-specific folders on Box.com.

## Prerequisites

1. **Box.com Developer App**: A Box.com Developer App must be created with the following:
   - Client ID
   - Client Secret
   - Enterprise ID (if using App Auth)
   - Private Key (if using JWT authentication)

2. **Database Migration**: The `hub_projects` table needs a `hub_project_guid` column.

## Setup Steps

### 1. Install Box.com SDK

```bash
cd backend
npm install box-node-sdk
```

### 2. Run Database Migration

Run the migration script to add the `project_guid` column:

```bash
cd backend
node scripts/add-project-guid.js
```

This script will:
- Add `hub_project_guid UUID` column to `hub_projects` table
- Generate UUIDs for existing projects
- Create an index on `hub_project_guid`

### 3. Configure Environment Variables

The Box.com credentials are already configured in:
- `backend/.env.development`
- `backend/.env.staging`

**For Testing (while waiting for authorization):**
Use a Developer Token (expires in 60 minutes, no refresh):
```bash
BOX_DEVELOPER_TOKEN=your_developer_token_here
```
Get it from: Box Developer Console → your app → Configuration → General → Generate Developer Token

**"insufficient_scope" error:** Enable **Application Scopes** in the Developer Console:
1. Go to [Box Developer Console](https://app.box.com/developers/console) → your app → **Configuration**
2. Under **Application Scopes**, enable **"Read and write all files and folders stored in Box"** (`root_readwrite`)
3. Save changes
4. **Generate a new Developer Token** (existing tokens keep old scopes)
5. If using CCG/JWT, **re-authorize** the app (Admin Console) after scope changes

**For Production:**
Add to your production `.env`:
```
BOX_CLIENT_ID=your_client_id
BOX_CLIENT_SECRET=your_client_secret
# Use one of:
BOX_USER_ID=your_service_account_user_id   # Service Account (user-level CCG) – recommended for Custom Apps
BOX_ENTERPRISE_ID=your_enterprise_id       # Enterprise-level CCG
NODE_ENV=production
```

**"box_subject_type unauthorized"**: Use `BOX_USER_ID` (Service Account user ID) instead of `BOX_ENTERPRISE_ID`. Find it in Box Developer Console → your app → Configuration → General (Service Account).

If using JWT authentication, also add:
```
BOX_PRIVATE_KEY_PATH=path/to/private_key.pem
BOX_PRIVATE_KEY_PASSWORD=password_if_encrypted
```

### 4. Box.com Folder Structure

Files are stored in Box.com with the following structure:
- **Development/Staging**: `/STAGING/{ProjectGUID}/`
- **Production**: `/PRODUCTION/{ProjectGUID}/`

The folder structure is automatically created when the first file operation is performed for a project.

## Features

### Backend API Endpoints

- `GET /api/projects/:projectId/files` - List all files and folders in the project's Box folder
- `POST /api/projects/:projectId/files` - Upload a file to the project's Box folder
- `POST /api/projects/:projectId/folders` - Create a new folder in the project's Box folder
- `DELETE /api/projects/:projectId/files/:fileId` - Delete a file or folder

### Frontend Features

- **Manage Files Button**: Available in the CreateProject component when editing an existing project
- **File List**: Displays all files and folders with metadata (name, type, size, modified date)
- **Upload**: Upload files from your computer to the project folder
- **Create Folder**: Create subfolders within the project folder
- **Delete**: Delete files and folders with confirmation dialog

## Usage

1. Open or create a project in the application
2. Click the "Manage Files" button
3. Use the modal to:
   - Upload files
   - Create folders
   - View file list
   - Delete files/folders

## Authentication

The integration supports two authentication methods:

1. **Client Credentials Grant**: Basic authentication using Client ID and Secret
2. **App Auth (JWT)**: More secure authentication using a private key (recommended for production)

The system will automatically use JWT if `BOX_PRIVATE_KEY_PATH` is configured, otherwise it falls back to Client Credentials.

## Troubleshooting

### "Project GUID not found" Error
- Run the database migration script: `node scripts/add-project-guid.js`
- Ensure the column name is `hub_project_guid` (not `project_guid`)

### "Box.com credentials not configured" Error
- Ensure `BOX_CLIENT_ID` and `BOX_CLIENT_SECRET` are set in your `.env` file

### "Failed to create folder" Error
- Check Box.com API permissions for your Developer App
- Ensure the app has access to create folders in the root directory

### File Upload Fails
- Check file size limits (currently 100MB)
- Verify Box.com API rate limits
- Check network connectivity to Box.com

## Security Notes

- File names are sanitized to prevent path traversal attacks
- Project GUIDs ensure folder isolation between projects
- Delete operations require confirmation
- User roles/permissions will be added in a future update

## Future Enhancements

- User role-based permissions (restrict upload/delete based on roles)
- File preview/download functionality
- File versioning
- Bulk file operations
