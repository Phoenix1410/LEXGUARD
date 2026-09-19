# LEXGUARD Frontend Deployment Guide

## API Backend Routing Configuration

The LEXGUARD frontend now implements environment-aware API routing to ensure production deployments connect to the correct backend with AI capabilities.

### Environment Configuration

#### Development Environment
- **API URL**: `http://localhost:8000` (Docker backend for development)
- **Features**: Basic functionality for local development and testing
- **Environment Detection**: `NODE_ENV=development` + `hostname=localhost`

#### Production Environment  
- **API URL**: `https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API` (Full AI stack)
- **Features**: Complete AI functionality with GROQ_API_KEY and ChatGroq analyst
- **Environment Detection**: `NODE_ENV=production` + non-localhost hostname

### Vercel Deployment Configuration

#### Environment Variables
Set these environment variables in your Vercel deployment:

```bash
# Clerk Authentication (Required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZmxleGlibGUtd2FscnVzLTE4LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_gzUTeIfAkfCNOungCUnvMP6Ta5mgDK18iHUbKShomE

# Clerk URLs (Required)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# API Backend URL (OPTIONAL - auto-detected)
# NEXT_PUBLIC_API_URL=http://localhost:8000  # DO NOT set this in production

# Optional Production Override (Advanced)
# NEXT_PUBLIC_PRODUCTION_API_URL=https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API
```

**Important**: Do NOT set `NEXT_PUBLIC_API_URL` in production. The frontend will automatically detect the production environment and route to HuggingFace Spaces.

#### Deployment Steps

1. **Push to Repository**: Commit your code to the connected Git repository
2. **Vercel Auto-Deploy**: Vercel will automatically build and deploy
3. **Environment Detection**: Frontend automatically detects production environment
4. **API Routing**: All API calls route to HuggingFace Spaces backend with AI capabilities

### Backend Requirements

#### HuggingFace Spaces Backend
The production backend must be deployed at: `https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API`

Required features:
- **GROQ_API_KEY**: Environment variable for AI model access
- **ChatGroq Analyst**: AI agent for generating explanations
- **CORS Configuration**: Must allow requests from Vercel domain
- **All Endpoints**: `/analyze_document`, `/compare_testimonies`, `/users/sync`

#### Local Development Backend
For development, run the Docker backend on `http://localhost:8000`

### API Endpoints and Routing

#### AI-Powered Endpoints (Require HuggingFace Spaces in Production)
- `POST /analyze_document` - Contract analysis with AI explanations
- `POST /compare_testimonies` - Testimony comparison with AI analysis

#### Standard Endpoints (Work on Both Backends)
- `POST /users/sync` - User synchronization
- `GET /health` - Health check
- `GET /*` - All other endpoints

### Environment Variables Documentation

For detailed environment variable setup and configuration options, see:
- **Development**: `.env.local` file in the frontend directory
- **Production**: `PRODUCTION_ENV_CONFIG.md` for comprehensive deployment guide
- **Troubleshooting**: Environment detection debug commands in the production config guide

### Troubleshooting

#### Missing AI Explanations
**Symptoms**: Contract analysis returns results but explanation fields are empty

**Cause**: Frontend is routing to wrong backend (localhost instead of HuggingFace)

**Solution**: 
1. Check environment detection with browser dev tools console:
   ```javascript
   // Run in browser console
   import { getEnvironmentInfo } from '@/lib/api-config'
   console.log('Environment Info:', getEnvironmentInfo())
   ```
2. Verify `NODE_ENV=production` in deployment
3. Confirm domain is not localhost
4. Check network tab to see actual API calls

#### Development Environment Issues
**Symptoms**: API calls failing in local development

**Solutions**:
1. Ensure Docker backend is running on `http://localhost:8000`
2. Check `.env.local` file has correct `NEXT_PUBLIC_API_URL`
3. Verify `NODE_ENV=development` for local builds

#### Production Deployment Validation
**Steps to verify production deployment**:
1. Deploy to Vercel
2. Open browser developer tools → Console
3. Run environment check:
   ```javascript
   // Check if environment is detected correctly
   console.log('Window hostname:', window.location.hostname)
   console.log('Node ENV:', process.env.NODE_ENV)
   ```
4. Navigate to document analysis page
5. Upload a document and check Network tab
6. Verify API calls go to `huggingface.co/spaces/Phoenix1410/LEXGUARD_API`

### Migration from Old Configuration

If upgrading from the old hardcoded API URL approach:

1. **Remove Hardcoded URLs**: No need to manually set production API URLs
2. **Update API Calls**: Import and use `getApiUrl()` function
3. **Environment Variables**: Remove production `NEXT_PUBLIC_API_URL` overrides
4. **Test Deployment**: Verify production deployment uses HuggingFace Spaces

### Security Considerations

- **API Keys**: Never include GROQ_API_KEY in frontend environment variables
- **CORS**: HuggingFace Spaces backend must have proper CORS configuration
- **Authentication**: All API calls include Clerk JWT tokens
- **Environment Detection**: Multiple validation layers prevent misrouting

### Support

For deployment issues:
1. Check Vercel deployment logs
2. Verify HuggingFace Spaces backend is running
3. Test API endpoints directly with tools like Postman
4. Review network requests in browser developer tools
5. Check comprehensive configuration guide in `PRODUCTION_ENV_CONFIG.md`