# LEXGUARD AI Backend Routing - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the LEXGUARD frontend with the AI backend routing fix. The fix ensures that production deployments correctly route to the HuggingFace Spaces backend for AI functionality while preserving the localhost development workflow.

## Prerequisites

- Access to Vercel dashboard for environment variable configuration
- HuggingFace Spaces backend deployed and accessible
- Frontend code with the routing fix implemented

## Production Deployment Configuration

### 1. Vercel Environment Variables

Configure the following environment variables in your Vercel project dashboard:

#### Required Variables

```bash
# Production API URL - Routes to HuggingFace Spaces backend with AI capabilities
NEXT_PUBLIC_API_URL=https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API

# Authentication (existing - preserve current values)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-clerk-key>
CLERK_SECRET_KEY=<your-clerk-secret>

# Additional Clerk configuration (preserve existing values)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

#### HuggingFace Spaces URL Format

The production API URL should follow this format:
```
https://huggingface.co/spaces/{USERNAME}/{SPACE_NAME}
```

**Current Configuration:**
- Username: `Phoenix1410`
- Space Name: `LEXGUARD_API`
- Full URL: `https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API`

### 2. Environment Variable Setup Steps

1. **Access Vercel Dashboard**
   - Go to [vercel.com](https://vercel.com)
   - Navigate to your LEXGUARD project
   - Click on "Settings" tab

2. **Configure Environment Variables**
   - Select "Environment Variables" from the sidebar
   - Add/update the variables listed above
   - Set environment scope to "Production" (or "All Environments" if preferred)

3. **Deploy Changes**
   - Trigger a new deployment to apply the environment variables
   - The new deployment will use the HuggingFace Spaces backend in production

### 3. Verification Steps

After deployment, verify the fix is working:

1. **Check Production Routing**
   - Visit your deployed application
   - Upload a document for analysis
   - Verify that AI explanations are included in the results

2. **Monitor Network Requests**
   - Open browser developer tools
   - Check Network tab during document analysis
   - Confirm API calls go to `huggingface.co/spaces/Phoenix1410/LEXGUARD_API`

3. **Test AI Functionality**
   - Verify `explanation` fields are populated in analysis results
   - Test document comparison features
   - Confirm ChatGroq-powered analysis is working

## Development Environment

### Local Development Setup

For local development, use the existing configuration:

```bash
# .env.local (development)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Authentication (same as production)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-clerk-key>
CLERK_SECRET_KEY=<your-clerk-secret>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Environment Detection Logic

The application automatically detects the environment:

- **Development**: `localhost` domains → routes to `http://localhost:8000`
- **Production**: `vercel.app` domains → routes to HuggingFace Spaces URL
- **Custom**: Override with `NEXT_PUBLIC_API_URL` environment variable

## HuggingFace Spaces Backend Configuration

### Backend Requirements

Ensure your HuggingFace Spaces backend has:

1. **Required Dependencies**
   - GROQ_API_KEY configured
   - ChatGroq analyst functionality
   - ML models (Sniper, Scout) deployed

2. **API Endpoints**
   - `/analyze_document` - Document analysis with AI explanations
   - `/compare_testimonies` - Testimony comparison with AI analysis
   - `/users/sync` - User management
   - Other required endpoints

3. **CORS Configuration**
   - Allow requests from your Vercel domain
   - Configure appropriate CORS headers

### Backend Validation

Test the HuggingFace Spaces backend directly:

```bash
# Test analyze_document endpoint
curl -X POST "https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API/analyze_document" \
  -H "Content-Type: application/json" \
  -d '{"document_text": "sample text", "user_id": "test"}'

# Verify AI explanations are included in response
```

## Troubleshooting

### Common Issues

1. **Missing AI Explanations**
   - **Cause**: API routing to wrong backend
   - **Solution**: Verify `NEXT_PUBLIC_API_URL` in Vercel environment variables
   - **Check**: Network tab should show requests to HuggingFace Spaces

2. **CORS Errors**
   - **Cause**: HuggingFace Spaces backend not configured for your domain
   - **Solution**: Update CORS settings in HuggingFace Spaces deployment
   - **Check**: Browser console for CORS-related errors

3. **Environment Variable Not Applied**
   - **Cause**: New deployment not triggered after variable changes
   - **Solution**: Trigger a new deployment in Vercel dashboard
   - **Check**: Verify variables in deployment logs

4. **Development Workflow Broken**
   - **Cause**: Incorrect localhost configuration
   - **Solution**: Ensure `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000`
   - **Check**: Local API calls should go to port 8000

### Debugging Steps

1. **Check Environment Detection**
   ```javascript
   // Add to browser console on deployed site
   console.log('Hostname:', window.location.hostname);
   console.log('Environment:', window.location.hostname.includes('localhost') ? 'development' : 'production');
   ```

2. **Verify API URL Resolution**
   - Check browser Network tab during API calls
   - Confirm requests go to expected backend URL

3. **Test Backend Directly**
   - Make direct API calls to HuggingFace Spaces URL
   - Verify backend functionality independent of frontend

## Next Steps

### After Successful Deployment

1. **Monitor Production Usage**
   - Track AI explanation generation success rate
   - Monitor backend response times
   - Check for any error patterns

2. **Performance Optimization**
   - Consider backend caching for ML models
   - Optimize API response sizes
   - Monitor HuggingFace Spaces resource usage

3. **Additional Features**
   - Add fallback logic for backend unavailability
   - Implement request retries for reliability
   - Add performance monitoring

### Future Considerations

- **Backend Scaling**: Consider multiple HuggingFace Spaces instances for load distribution
- **Environment Management**: Add staging environment with separate backend
- **Monitoring**: Implement comprehensive logging and error tracking
- **Security**: Review and enhance API authentication mechanisms

## Support

For issues with this deployment:

1. Check the troubleshooting section above
2. Verify environment variables in Vercel dashboard
3. Test HuggingFace Spaces backend accessibility
4. Review browser console and network logs for errors

The frontend routing fix ensures reliable production deployment while maintaining development workflow compatibility.