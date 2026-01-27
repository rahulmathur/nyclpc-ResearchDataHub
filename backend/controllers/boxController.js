const { getPool } = require('../db');
const { BoxClient, BoxCcgAuth, CcgConfig, BoxDeveloperTokenAuth } = require('box-node-sdk');
const { BoxRetryStrategy, NetworkSession } = require('box-node-sdk/networking');
const { Readable } = require('stream');

/**
 * Custom retry strategy that never retries on 401 when using Developer Token.
 * The default BoxRetryStrategy calls refreshToken() on 401, which always throws
 * for Developer Tokens and masks the real API error (expired, scope, etc.).
 * By skipping 401 retries, the original Box API error propagates to us.
 */
class NoRefreshOn401RetryStrategy extends BoxRetryStrategy {
  async shouldRetry(fetchOptions, fetchResponse, attemptNumber) {
    if (fetchResponse.status === 401) {
      return false; // Do not retry, do not call refreshToken
    }
    return super.shouldRetry(fetchOptions, fetchResponse, attemptNumber);
  }
}

// Initialize Box SDK client (v10 API)
let boxClient = null;
let cachedDeveloperToken = null; // Track which token we used

function getBoxClient() {
  const developerToken = process.env.BOX_DEVELOPER_TOKEN?.trim();
  
  // If using Developer Token and it changed, clear cache to use new token
  if (developerToken && cachedDeveloperToken && cachedDeveloperToken !== developerToken) {
    console.log('Box.com: Developer Token changed, clearing cached client');
    console.log(`Box.com: Old token: ${cachedDeveloperToken.substring(0, 8)}...${cachedDeveloperToken.substring(cachedDeveloperToken.length - 4)}`);
    console.log(`Box.com: New token: ${developerToken.substring(0, 8)}...${developerToken.substring(developerToken.length - 4)}`);
    boxClient = null;
    cachedDeveloperToken = developerToken;
  }
  
  // If not using Developer Token anymore, clear cache
  if (!developerToken && cachedDeveloperToken) {
    boxClient = null;
    cachedDeveloperToken = null;
  }
  
  if (boxClient) {
    console.log('Box.com: Using cached Box client');
    return boxClient;
  }

  // Developer Token (for testing - expires in 60 minutes, no refresh)
  if (developerToken) {
    console.log('Box.com: Initializing with Developer Token...');
    console.log(`Box.com: Token from env: "${developerToken}" (length: ${developerToken.length})`);
    
    const auth = new BoxDeveloperTokenAuth({ token: developerToken });
    const noRefreshRetry = new NoRefreshOn401RetryStrategy({});
    const networkSession = new NetworkSession({ retryStrategy: noRefreshRetry });
    boxClient = new BoxClient({ auth, networkSession });
    cachedDeveloperToken = developerToken;
    console.log('Box.com: Developer Token client initialized (no 401 retry)');
    return boxClient;
  }

  // Client Credentials Grant (CCG) - for production
  const clientId = process.env.BOX_CLIENT_ID;
  const clientSecret = process.env.BOX_CLIENT_SECRET;
  const enterpriseId = process.env.BOX_ENTERPRISE_ID;
  const userId = process.env.BOX_USER_ID; // Service Account user ID (use when app uses user-level CCG)

  if (!clientId || !clientSecret) {
    throw new Error('Box.com credentials not configured. Set BOX_DEVELOPER_TOKEN (for testing) or BOX_CLIENT_ID + BOX_CLIENT_SECRET (for production).');
  }

  // CCG supports either user (Service Account) or enterprise. Use userId when set;
  // otherwise enterpriseId. "box_subject_type unauthorized" usually means the app
  // expects user-level auth but we sent enterprise (or vice versa).
  const configOpts = { clientId, clientSecret };
  
  if (userId) {
    const userIdStr = String(userId).trim();
    configOpts.userId = userIdStr;
    console.log(`Box.com: Using Client Credentials (CCG) with Service Account (User ID: ${userIdStr})`);
    console.log(`Box.com: NOTE: If you see "invalid_grant" errors, the Box app may not be configured for user-level CCG.`);
    console.log(`Box.com: Configure user-level CCG in Box Developer Console → your app → Configuration → Advanced Features → Service Account.`);
  } else if (enterpriseId) {
    const enterpriseIdStr = String(enterpriseId).trim();
    configOpts.enterpriseId = enterpriseIdStr;
    console.log(`Box.com: Using Client Credentials (CCG) with Enterprise (Enterprise ID: ${enterpriseIdStr})`);
  } else {
    throw new Error('Set either BOX_USER_ID (Service Account) or BOX_ENTERPRISE_ID for Client Credentials Grant.');
  }

  const config = new CcgConfig(configOpts);
  const auth = new BoxCcgAuth({ config });
  boxClient = new BoxClient({ auth });

  return boxClient;
}

function isExpiredTokenError(error) {
  // With our custom retry strategy, we shouldn't get refreshToken errors anymore,
  // but keep this for edge cases
  const msg = (error && error.message) ? String(error.message).toLowerCase() : '';
  const isRefreshError = msg.includes('developer token') && (msg.includes('expired') || msg.includes('expir'));
  return isRefreshError;
}

function clearBoxClient() {
  boxClient = null;
  cachedDeveloperToken = null;
}

const EXPIRED_TOKEN_MESSAGE =
  'Box Developer Token has expired (tokens last 60 minutes). ' +
  'Generate a new one in Box Developer Console → your app → Configuration → General → Generate Developer Token, ' +
  'update BOX_DEVELOPER_TOKEN in .env, and restart the backend server to pick up the new token.';

function handleBoxError(error, res, defaultMessage) {
  // BoxApiError has responseInfo.statusCode, responseInfo.body, etc.
  // BoxSdkError (like refreshToken errors) has error.response?.status
  const status = error.responseInfo?.statusCode ?? error.response?.status ?? error.statusCode;
  const responseBody = error.responseInfo?.body ?? error.response?.data;
  const errorCode = error.responseInfo?.code ?? error.code;
  const requestId = error.responseInfo?.requestId;
  
  // Log detailed error info for debugging
  console.error('Box API Error Details:', {
    message: error.message,
    status,
    code: errorCode,
    requestId,
    responseBody,
    stack: error.stack?.split('\n').slice(0, 3).join('\n'),
  });
  
  // Handle 401 errors (unauthorized)
  if (status === 401) {
    clearBoxClient();
    
    // Extract error message from response body (Box API uses 'message' field)
    const errorMsg = responseBody?.message || responseBody?.error || responseBody?.error_description || error.message || '';
    const errorMsgLower = String(errorMsg).toLowerCase();
    
    // Check for specific error types
    if (errorMsgLower.includes('insufficient') || errorMsgLower.includes('scope')) {
      return res.status(401).json({ 
        error: 'Insufficient permissions. Enable "Read and write all files and folders stored in Box" scope in Box Developer Console → your app → Configuration → Application Scopes, then generate a new Developer Token.',
      });
    }
    
    if (errorMsgLower.includes('expired') || errorMsgLower.includes('expir')) {
      return res.status(401).json({ error: EXPIRED_TOKEN_MESSAGE });
    }
    
    // Generic 401 error - use the actual message from Box API
    const cleanRequestId = (responseBody?.request_id || (requestId ? String(requestId).replace(/"/g, '') : '')).trim() || '';
    return res.status(401).json({
      error: `Box.com authentication failed: ${errorMsg || 'Unauthorized - Cannot authorize with this service'}.${cleanRequestId ? ` Request ID: ${cleanRequestId}` : ''} Check your Developer Token in Box Developer Console.`,
    });
  }
  
  // Other errors
  res.status(status && status >= 400 ? status : 500).json({
    error: error.message || defaultMessage,
    details: status ? `Box API error: ${status}` : undefined,
    requestId,
  });
}

// Get project folder path based on environment
// All Box content lives under root folder LPC-ResearchDataHub, then STAGING or PRODUCTION, then project GUID.
function getProjectFolderPath(projectGuid) {
  const rootFolder = process.env.BOX_ROOT_FOLDER || 'LPC-ResearchDataHub';
  const nodeEnv = process.env.NODE_ENV || 'development';
  const baseFolder = (nodeEnv === 'production') ? 'PRODUCTION' : 'STAGING';
  return `/${rootFolder}/${baseFolder}/${projectGuid}/`;
}

// Build full Box path for an item (file or folder) inside the project folder.
function getBoxItemPath(projectGuid, itemName) {
  const base = getProjectFolderPath(projectGuid);
  return base + (itemName || '').replace(/^\/+/, '');
}

// Box web URL for a file or folder (opens in Box app; user must have access).
function getBoxItemUrl(id, type) {
  const kind = type === 'folder' ? 'folder' : 'file';
  return `https://app.box.com/${kind}/${id}`;
}

// Ensure project folder exists on Box.com
async function ensureProjectFolder(pool, projectId) {
  try {
    console.log('Box.com: Ensuring project folder exists...');
    const result = await pool.query(
      'SELECT hub_project_guid FROM hub_projects WHERE hub_project_id = $1',
      [projectId]
    );

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    const projectGuid = result.rows[0].hub_project_guid;
    if (!projectGuid) {
      throw new Error('Project GUID not found. Please run migration script to add GUID column.');
    }

    const client = getBoxClient();
    const folderPath = getProjectFolderPath(projectGuid);
    const pathParts = folderPath.split('/').filter(p => p);

    let currentFolderId = '0';

    for (const folderName of pathParts) {
      try {
        const result = await client.folders.getFolderItems(currentFolderId, {});
        const entries = result.entries || [];
        const existing = entries.find(
          item => item.type === 'folder' && item.name === folderName
        );

        if (existing) {
          currentFolderId = String(existing.id);
        } else {
          const folder = await client.folders.createFolder({
            name: folderName,
            parent: { id: currentFolderId },
          });
          currentFolderId = String(folder.id);
        }
      } catch (err) {
        // BoxApiError uses responseInfo.statusCode and responseInfo.body.code
        const statusCode = err.responseInfo?.statusCode ?? err.response?.status ?? err.statusCode;
        const errorCode = err.responseInfo?.body?.code ?? err.code;
        const is409 = statusCode === 409;
        const isItemNameInUse = errorCode === 'item_name_in_use' || errorCode === '"item_name_in_use"';
        
        if (is409 && isItemNameInUse) {
          // Folder already exists. Box returns context_info.conflicts with the existing folder.
          // Use it directly — root listing can be paginated, so we might not find it there.
          const conflicts = err.responseInfo?.body?.context_info?.conflicts
            ?? err.responseInfo?.contextInfo?.conflicts
            ?? [];
          const conflict = conflicts.find(
            c => c.type === 'folder' && String(c.name || '').trim() === folderName
          );
          if (conflict && conflict.id) {
            currentFolderId = String(conflict.id);
            console.log(`Box.com: Using existing folder "${folderName}" (ID: ${currentFolderId}) from 409 conflicts`);
          } else {
            // Fallback: re-fetch folder items (may fail for root due to pagination)
            console.log(`Box.com: Folder "${folderName}" already exists, fetching existing folder...`);
            const listResult = await client.folders.getFolderItems(currentFolderId, { queryParams: { limit: 1000 } });
            const entries = listResult.entries || [];
            const existing = entries.find(
              item => item.type === 'folder' && item.name === folderName
            );
            if (existing) {
              currentFolderId = String(existing.id);
              console.log(`Box.com: Using existing folder "${folderName}" (ID: ${currentFolderId})`);
            } else {
              console.error(`Box.com: 409 but no conflict match and "${folderName}" not in listing`);
              throw err;
            }
          }
        } else {
          throw err;
        }
      }
    }

    console.log(`Box.com: Project folder ensured: ${currentFolderId}`);
    
    // Log which account owns this folder
    try {
      const folderInfo = await client.folders.getFolderById(currentFolderId);
      const owner = folderInfo.ownedBy;
      console.log(`Box.com: Folder owned by account: ${owner?.id || 'unknown'} (${owner?.name || owner?.login || 'unknown'})`);
    } catch (err) {
      // Ignore - folder exists, that's what matters
    }
    
    return { folderId: currentFolderId, projectGuid };
  } catch (error) {
    console.error('Error ensuring project folder:', error);
    if (error.responseInfo) {
      console.error('Box API Response:', {
        statusCode: error.responseInfo.statusCode,
        body: error.responseInfo.body,
      });
    }
    throw error;
  }
}

// Verify Box token (GET /users/me) — use to confirm token works before folder operations
async function verifyBoxToken(req, res) {
  try {
    const client = getBoxClient();
    const user = await client.users.getUserMe();
    
    // Determine authentication method
    const developerToken = process.env.BOX_DEVELOPER_TOKEN?.trim();
    const userId = process.env.BOX_USER_ID?.trim();
    const enterpriseId = process.env.BOX_ENTERPRISE_ID?.trim();
    
    let authMethod = 'Unknown';
    if (developerToken) {
      authMethod = 'Developer Token';
    } else if (userId) {
      authMethod = `User-level CCG (User ID: ${userId})`;
    } else if (enterpriseId) {
      authMethod = `Enterprise-level CCG (Enterprise ID: ${enterpriseId})`;
    }
    
    console.log(`Box.com: Verified authentication - Account: ${user.id} (${user.name || user.login}), Method: ${authMethod}`);
    
    res.json({
      success: true,
      message: 'Box token is valid',
      authMethod,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
      },
      note: developerToken 
        ? 'Using Developer Token - files go to the token owner\'s account'
        : userId
        ? `Using User-level CCG - files should go to User ID ${userId}`
        : `Using Enterprise-level CCG - files go to enterprise service account (Enterprise ID: ${enterpriseId})`,
    });
  } catch (error) {
    console.error('Box verify token error:', error.message);
    return handleBoxError(error, res, 'Box token verification failed');
  }
}

// List files in project folder
async function getProjectFiles(req, res) {
  const { projectId } = req.params;

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();

    const { folderId, projectGuid } = await ensureProjectFolder(pool, projectId);
    const client = getBoxClient();

    const result = await client.folders.getFolderItems(folderId, {
      queryParams: { limit: 1000 },
    });

    const entries = result.entries || [];
    const itemType = (item) => item.type || (item.size != null ? 'file' : 'folder');
    const files = entries.map(item => {
      const type = itemType(item);
      return {
        id: item.id,
        name: item.name,
        type,
        size: item.size ?? 0,
        modifiedAt: item.modifiedAt ?? item.modified_at,
        createdAt: item.createdAt ?? item.created_at,
        extension: item.extension ?? null,
        boxPath: getBoxItemPath(projectGuid, item.name),
        boxUrl: getBoxItemUrl(item.id, type),
      };
    });

    res.json({ success: true, data: files });
  } catch (error) {
    console.error('Error getting project files:', error);
    return handleBoxError(error, res, 'Failed to retrieve files');
  }
}

// Get project folder URL and optionally create shared link
async function getProjectFolderInfo(req, res) {
  const { projectId } = req.params;
  const { createSharedLink } = req.query; // ?createSharedLink=true

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();

    const { folderId, projectGuid } = await ensureProjectFolder(pool, projectId);
    const client = getBoxClient();

    // Get folder info
    const folder = await client.folders.getFolderById(folderId);
    const boxPath = getProjectFolderPath(projectGuid);
    const boxUrl = getBoxItemUrl(folderId, 'folder');

    let sharedLink = null;
    
    // Optionally create a shared link
    if (createSharedLink === 'true') {
      try {
        // Create or get shared link
        const updatedFolder = await client.folders.updateFolder(folderId, {
          sharedLink: {
            access: 'open', // 'open', 'company', 'collaborators'
          },
        });
        sharedLink = updatedFolder.sharedLink?.url || null;
        console.log(`Box.com: Created shared link for folder ${folderId}: ${sharedLink}`);
      } catch (linkError) {
        console.warn(`Box.com: Could not create shared link: ${linkError.message}`);
        // Continue without shared link
      }
    } else {
      // Check if folder already has a shared link
      if (folder.sharedLink?.url) {
        sharedLink = folder.sharedLink.url;
      }
    }

    // Get current user to show who owns the folder
    const currentUser = await client.users.getUserMe();

    res.json({
      success: true,
      data: {
        folderId,
        folderName: folder.name,
        boxPath,
        boxUrl,
        sharedLink,
        ownedBy: {
          id: folder.ownedBy?.id || currentUser.id,
          name: folder.ownedBy?.name || currentUser.name,
          login: folder.ownedBy?.login || currentUser.login,
        },
        currentAccount: {
          id: currentUser.id,
          name: currentUser.name,
          login: currentUser.login,
        },
        note: sharedLink 
          ? 'Use the sharedLink URL to access this folder without logging in'
          : 'Set ?createSharedLink=true to generate a shared link for easy access',
      },
    });
  } catch (error) {
    console.error('Error getting project folder info:', error);
    return handleBoxError(error, res, 'Failed to retrieve folder information');
  }
}

// Upload file to project folder
async function uploadFile(req, res) {
  const { projectId } = req.params;

  try {
    console.log(`Box.com: Upload request received for project ${projectId}`);
    
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    if (!req.file) {
      console.log('Box.com: No file in request (req.file is null/undefined)');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileName = req.file.originalname || 'upload';
    const fileSize = req.file.buffer?.length || 0;
    console.log(`Box.com: Uploading file "${fileName}" (${fileSize} bytes)`);

    const pool = getPool();
    const { folderId, projectGuid } = await ensureProjectFolder(pool, projectId);
    const client = getBoxClient();
    
    // Log which account is being used for upload
    try {
      const currentUser = await client.users.getUserMe();
      console.log(`Box.com: Uploading to account: ${currentUser.id} (${currentUser.name || currentUser.login})`);
    } catch (err) {
      console.warn('Box.com: Could not verify upload account:', err.message);
    }

    const fileStream = Readable.from(req.file.buffer);
    const contentType = req.file.mimetype || 'application/octet-stream';
    const CHUNKED_UPLOAD_MIN_SIZE = 20 * 1024 * 1024; // 20MB

    let uploadedFile;
    
    if (fileSize >= CHUNKED_UPLOAD_MIN_SIZE) {
      // Files >= 20MB must use chunked upload
      console.log(`Box.com: File size ${fileSize} bytes >= ${CHUNKED_UPLOAD_MIN_SIZE} bytes, using chunked upload...`);
      uploadedFile = await client.chunkedUploads.uploadBigFile(
        fileStream,
        fileName,
        fileSize,
        folderId
      );
    } else {
      // Files < 20MB use simple upload
      console.log(`Box.com: File size ${fileSize} bytes < ${CHUNKED_UPLOAD_MIN_SIZE} bytes, using simple upload...`);
      const uploadResult = await client.uploads.uploadFile({
        attributes: {
          name: fileName,
          parent: { id: folderId },
        },
        file: fileStream,
        fileFileName: fileName,
        fileContentType: contentType,
      });
      // uploadFile returns Files collection - get first entry
      uploadedFile = uploadResult.entries?.[0];
      if (!uploadedFile) {
        throw new Error('Upload succeeded but no file returned in response');
      }
    }
    const boxPath = getBoxItemPath(projectGuid, uploadedFile.name);
    const boxUrl = getBoxItemUrl(uploadedFile.id, 'file');
    console.log(`Box.com: File uploaded successfully: ${uploadedFile.id} (${uploadedFile.name})`);
    console.log(`Box.com: Path: ${boxPath}`);
    console.log(`Box.com: URL: ${boxUrl}`);
    
    // Log which account the file was uploaded to
    try {
      const currentUser = await client.users.getUserMe();
      console.log(`Box.com: File uploaded to account: ${currentUser.id} (${currentUser.name || currentUser.login})`);
      console.log(`Box.com: To view files, log into Box.com as this account or an admin with access to this account.`);
    } catch (err) {
      // Ignore - already logged above
    }

    res.json({
      success: true,
      data: {
        id: uploadedFile.id,
        name: uploadedFile.name,
        size: uploadedFile.size,
        createdAt: uploadedFile.createdAt ?? uploadedFile.created_at,
        modifiedAt: uploadedFile.modifiedAt ?? uploadedFile.modified_at,
        boxPath,
        boxUrl,
      },
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    if (error.responseInfo) {
      console.error('Box API Response:', {
        statusCode: error.responseInfo.statusCode,
        body: error.responseInfo.body,
      });
    }
    return handleBoxError(error, res, 'Failed to upload file');
  }
}

// Create folder in project folder
async function createFolder(req, res) {
  const { projectId } = req.params;
  const { folderName } = req.body;

  if (!folderName || typeof folderName !== 'string' || folderName.trim().length === 0) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const sanitizedName = folderName.trim().replace(/[<>:"/\\|?*]/g, '_');

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });
    const pool = getPool();

    const { folderId, projectGuid } = await ensureProjectFolder(pool, projectId);
    const client = getBoxClient();

    const folder = await client.folders.createFolder({
      name: sanitizedName,
      parent: { id: folderId },
    });

    const boxPath = getBoxItemPath(projectGuid, folder.name);
    const boxUrl = getBoxItemUrl(folder.id, 'folder');

    res.json({
      success: true,
      data: {
        id: folder.id,
        name: folder.name,
        type: 'folder',
        createdAt: folder.createdAt ?? folder.created_at,
        modifiedAt: folder.modifiedAt ?? folder.modified_at,
        boxPath,
        boxUrl,
      },
    });
  } catch (error) {
    console.error('Error creating folder:', error);

    // BoxApiError uses responseInfo.statusCode and responseInfo.body.code
    const statusCode = error.responseInfo?.statusCode ?? error.response?.status ?? error.statusCode;
    const errorCode = error.responseInfo?.body?.code ?? error.code;
    const is409 = statusCode === 409;
    const isItemNameInUse = errorCode === 'item_name_in_use' || errorCode === '"item_name_in_use"';

    if (is409 && isItemNameInUse) {
      // Folder already exists - try to find and return it
      try {
        const { folderId } = await ensureProjectFolder(pool, projectId);
        const client = getBoxClient();
        const result = await client.folders.getFolderItems(folderId, {});
        const entries = result.entries || [];
        const existing = entries.find(
          item => item.type === 'folder' && item.name === sanitizedName
        );
        if (existing) {
          return res.json({
            success: true,
            data: {
              id: existing.id,
              name: existing.name,
              type: 'folder',
              createdAt: existing.createdAt ?? existing.created_at,
              modifiedAt: existing.modifiedAt ?? existing.modified_at,
            },
            message: 'Folder already exists',
          });
        }
      } catch (lookupError) {
        console.error('Error looking up existing folder:', lookupError);
      }
      return res.status(409).json({ error: 'Folder with this name already exists' });
    }

    return handleBoxError(error, res, 'Failed to create folder');
  }
}

// Delete file or folder
async function deleteFile(req, res) {
  const { projectId, fileId } = req.params;
  const isFolder = req.query.type === 'folder';

  try {
    if (!getPool()) return res.status(500).json({ error: 'Database not connected' });

    const client = getBoxClient();

    if (isFolder) {
      await client.folders.deleteFolderById(fileId, {
        queryParams: { recursive: true },
      });
    } else {
      await client.files.deleteFileById(fileId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);

    if (
      error.response?.status === 404 ||
      error.statusCode === 404 ||
      error.code === 'not_found'
    ) {
      return res.status(404).json({ error: 'File or folder not found' });
    }
    return handleBoxError(error, res, 'Failed to delete');
  }
}

module.exports = {
  verifyBoxToken,
  getProjectFiles,
  getProjectFolderInfo,
  uploadFile,
  createFolder,
  deleteFile,
};
