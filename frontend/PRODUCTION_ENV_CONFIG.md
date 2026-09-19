# LEXGUARD Production Environment Configuration

## Overview

The LEXGUARD frontend implements environment-aware API routing to ensure production deployments connect to the HuggingFace Spaces backend with full AI capabilities, while preserving the localhost development workflow.

## Environment Variables Configuration

### Required for All Environments

These variables must be set in both development and production:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZmxleGlibGUtd2FscnVzLTE4LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_gzUTeIfAkfCNOungCUnvMP6Ta5mgDK18iHUbKShomE

# Clerk URL Configuration
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### Development Environment (.env.local)

For local development, add this to your `.env.local` file:

```bash
# API Backend for Development
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Production Environment (Vercel)

**IMPORTANT**: Do NOT set `NEXT_PUBLIC_API_URL` in production environment variables.

The frontend automatically detects production environment and routes to HuggingFace Spaces.

#### Vercel Environment Variables Setup

1. **Go to Vercel Dashboard** → Your Project → Settings → Environment Variables

2. **Set Required Variables**:
   ```bash
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZmxleGlibGUtd2FscnVzLTE4LmNsZXJrLmFjY291bnRzLmRldiQ
   CLERK_SECRET_KEY=sk_test_gzUTeIfAkfCNOungCUnvMP6Ta5mgDK18iHUbKShomE
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   ```

3. **DO NOT SET** `NEXT_PUBLIC_API_URL` in production (let auto-detection work)

4. **Optional Override** (Advanced Users Only):
   ```bash
   # Only set this if you need to override the HuggingFace Spaces URL
   NEXT_PUBLIC_PRODUCTION_API_URL=https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API
   ```

## Environment Detection Logic

The frontend uses multiple indicators to detect production environment:

1. **NODE_ENV**: Must be `"production"`
2. **Hostname**: Must NOT be `localhost` or `127.0.0.1`
3. **Vercel Environment**: `NEXT_PUBLIC_VERCEL_ENV === "production"` (optional)

## Backend URLs by Environment

### Development Environment
- **API URL**: `http://localhost:8000`
- **Backend Type**: Docker container with basic functionality
- **AI Features**: Limited (for development/testing only)
- **Use Case**: Local development and testing

### Production Environment
- **API URL**: `https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API`
- **Backend Type**: HuggingFace Spaces with full AI stack
- **AI Features**: Complete (GROQ_API_KEY, ChatGroq analyst, process_analyst_evaluation)
- **Use Case**: Production deployments with AI-powered analysis

## API Endpoint Routing

### AI-Powered Endpoints
These endpoints require the HuggingFace Spaces backend in production:

- `POST /analyze_document` - Contract analysis with AI explanations
- `POST /compare_testimonies` - Testimony comparison with AI analysis

### Standard Endpoints
These endpoints work on both backends:

- `POST /users/sync` - User synchronization
- `GET /health` - Health check (if available)
- `GET /*` - Other non-AI endpoints

## Fallback Logic

The system implements multiple fallback layers:

1. **Environment Variable Fallback**:
   ```javascript
   const developmentUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
   ```

2. **Production Override Support**:
   ```javascript
   const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_API_URL || 'https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API'
   ```

3. **Server-Side Rendering Fallback**:
   - SSR context returns development URL by default
   - Client-side hydration applies proper environment detection

## Migration from Previous Configuration

### Before (Buggy Configuration)
```bash
# This caused the bug - hardcoded localhost in production
NEXT_PUBLIC_API_URL=http://localhost:8000  # ❌ Used in production
```

### After (Fixed Configuration)
```bash
# Development .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000  # ✅ Development only

# Production Vercel Environment Variables
# (Do not set NEXT_PUBLIC_API_URL - let auto-detection work) # ✅ Auto-routes to HuggingFace
```

## Troubleshooting

### Problem: Missing AI Explanations in Production
**Symptoms**: 
- Contract analysis returns results but explanation fields are empty
- `/analyze_document` response lacks AI-generated content

**Root Cause**: Frontend routing to wrong backend

**Solution**:
1. Check browser developer console for environment detection logs
2. Verify deployment hostname is not localhost
3. Confirm `NODE_ENV=production` in build
4. Check network tab to see actual API calls

**Debug Commands**:
```javascript
// Run in browser console to check environment
console.log('Environment Info:', window.__LEXGUARD_ENV_INFO__)

// Check API URL resolution
import { getApiUrl, getEnvironmentInfo } from '@/lib/api-config'
console.log('API URL:', getApiUrl('/analyze_document'))
console.log('Environment:', getEnvironmentInfo())
```

### Problem: Development API Calls Failing
**Symptoms**:
- Local development can't reach API
- Network errors on localhost API calls

**Solutions**:
1. Start Docker backend: `docker run -p 8000:8000 lexguard-backend`
2. Verify `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000`
3. Check Docker container is running: `docker ps`

### Problem: Production Environment Not Detected
**Symptoms**:
- Production deployment still uses localhost URLs
- Environment detection returns "development"

**Solutions**:
1. Verify Vercel build has `NODE_ENV=production`
2. Check deployment domain is not localhost
3. Ensure no `NEXT_PUBLIC_API_URL` override in Vercel environment variables

## Security Considerations

### Environment Variable Security
- **Never include GROQ_API_KEY in frontend environment variables**
- **Keep API keys on backend only (HuggingFace Spaces)**
- **Use Clerk JWT tokens for API authentication**

### CORS Configuration
The HuggingFace Spaces backend must allow requests from:
- Vercel deployment domains
- Development localhost (for testing)

### API URL Validation
The frontend validates API URLs to prevent malicious redirects:
- Only allows whitelisted domains
- Validates HTTPS in production
- Logs all API routing decisions

## Testing Environment Configuration

### Manual Testing Steps

1. **Local Development Test**:
   ```bash
   npm run dev
   # Should use http://localhost:8000
   ```

2. **Production Build Test**:
   ```bash
   npm run build
   npm start
   # Should auto-detect production and use HuggingFace Spaces
   ```

3. **Environment Detection Test**:
   ```javascript
   // Browser console
   import { getEnvironmentInfo } from '@/lib/api-config'
   console.log(getEnvironmentInfo())
   ```

### Automated Testing
- Unit tests verify environment detection logic
- Integration tests validate API routing
- Property-based tests ensure preservation of existing functionality

## Support and Maintenance

### Updating HuggingFace Spaces URL
If the HuggingFace Spaces URL changes:

1. Update the hardcoded URL in `/lib/api-config.ts`
2. Update this documentation
3. Test both development and production deployments
4. Update deployment guides

### Adding New AI Endpoints
To add new endpoints that require AI functionality:

1. Add endpoint to `isAIEndpoint()` function in `/lib/api-config.ts`
2. Update this documentation
3. Test routing behavior in both environments