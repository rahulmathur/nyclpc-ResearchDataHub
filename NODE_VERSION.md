# Node.js Version Configuration

This project uses different Node.js versions for different branches:

## Development Branch
- **Node.js Version:** 18.x
- **Configuration Files:**
  - `backend/package.json` - `"node": "18.x"` in engines
  - `backend/.nvmrc` - `18`
  - `backend/.node-version` - `18`

## Staging Branch
- **Node.js Version:** 20.x
- **Configuration Files:**
  - `backend/package.json` - `"node": "20.x"` in engines
  - `backend/.nvmrc` - `20`
  - `backend/.node-version` - `20`

## Switching Node Versions

### Using nvm (Node Version Manager)
```bash
# In backend directory
cd backend
nvm use  # Automatically uses version from .nvmrc
```

### Manual Switch
```bash
# For development
nvm use 18

# For staging
nvm use 20
```

## Updating Node Version

When switching branches, make sure to:
1. Switch to the correct branch
2. Run `nvm use` in the backend directory
3. Verify with `node --version`

## Elastic Beanstalk Configuration

- **Development:** Not deployed to EB
- **Staging:** Configured for Node.js 20 in Elastic Beanstalk platform

## Notes

- Frontend doesn't have Node version restrictions (uses React Scripts which supports multiple versions)
- Backend requires specific Node versions due to deployment requirements
- Always check `.nvmrc` file when switching branches
