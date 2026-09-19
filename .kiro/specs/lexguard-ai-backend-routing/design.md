# LEXGUARD AI Backend Routing Bugfix Design

## Overview

The LEXGUARD application suffers from incorrect API routing in production deployments, where the frontend connects to a basic Docker backend (port 8000) without AI capabilities instead of the HuggingFace Spaces deployment (port 7860) that contains the complete AI analysis stack. This results in missing AI-generated explanations in `/analyze_document` responses. The fix involves implementing environment-aware API routing that connects to HuggingFace Spaces in production while preserving localhost development workflow.

## Glossary

- **Bug_Condition (C)**: The condition where production API calls are routed to the wrong backend endpoint, causing AI functionality to be unavailable
- **Property (P)**: The desired behavior where production deployments correctly route to HuggingFace Spaces backend with full AI capabilities
- **Preservation**: Existing localhost development workflow and non-AI functionality that must remain unchanged by the fix
- **API_URL**: The environment variable `NEXT_PUBLIC_API_URL` that determines which backend the frontend connects to
- **HuggingFace Spaces Backend**: The deployment at port 7860 containing GROQ_API_KEY, ChatGroq analyst, and complete ML models
- **Docker Backend**: The basic backend at port 8000 with limited functionality, suitable for development but lacking AI capabilities
- **process_analyst_evaluation**: The function that generates AI explanations using ChatGroq, only available on HuggingFace Spaces backend

## Bug Details

### Bug Condition

The bug manifests when the frontend is deployed to production (Vercel) and `NEXT_PUBLIC_API_URL` points to `http://localhost:8000` or any backend without AI capabilities. The API routing fails to connect to the HuggingFace Spaces backend that contains the complete AI analysis stack, resulting in missing explanation fields in response objects.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type APIRequest
  OUTPUT: boolean
  
  RETURN input.environment == 'production'
         AND input.api_url NOT CONTAINS 'huggingface.co/spaces'
         AND input.endpoint IN ['/analyze_document', '/compare_testimonies']
         AND AI_explanation_required(input.endpoint)
END FUNCTION
```

### Examples

- **Production Analyze Document**: Frontend on Vercel calls `/analyze_document` → routed to Docker backend → returns results with empty `explanation` fields instead of AI-generated analysis
- **Production Testimony Comparison**: Frontend calls `/compare_testimonies` → routed to basic backend → missing ChatGroq-powered comparative analysis
- **Development Mode (Correct)**: Frontend on localhost calls `/analyze_document` → routed to localhost:8000 → works correctly for development testing
- **HuggingFace Spaces Direct (Correct)**: Direct API call to HuggingFace Spaces URL → returns complete results with AI explanations

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Local development workflow must continue to use `http://localhost:8000` for developer convenience
- Sniper model (DistilRoBERTa) clause detection and risk classification must remain unchanged
- Scout model semantic search and rule matching must continue to function correctly
- Authentication (Clerk) and file upload functionality must work across all backend configurations
- Non-AI API endpoints like `/users/sync` must continue to function normally

**Scope:**
All inputs that do NOT involve production deployment with AI-powered endpoints should be completely unaffected by this fix. This includes:
- Local development API calls to localhost:8000
- Non-AI API endpoints (user management, file uploads, basic data operations)
- Frontend authentication and routing logic
- ML model processing (Sniper/Scout) that doesn't require ChatGroq

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **Hardcoded Development URL**: The `NEXT_PUBLIC_API_URL` is hardcoded to `http://localhost:8000` in production environment variables
   - Vercel deployment uses the same .env configuration as development
   - No environment-specific API URL configuration exists

2. **Missing Production Environment Configuration**: No mechanism to differentiate between development and production API endpoints
   - Frontend lacks environment detection logic
   - No fallback or conditional routing based on deployment context

3. **Incomplete Backend Feature Parity**: The Docker backend (port 8000) lacks the GROQ_API_KEY and ChatGroq dependencies
   - AI analysis functions fail silently or return incomplete results
   - No clear separation between AI-enabled and basic backend functionality

4. **Environment Variable Management**: Production deployment doesn't override development environment variables
   - Vercel environment variables not properly configured
   - Missing production-specific API URL pointing to HuggingFace Spaces

## Correctness Properties

Property 1: Bug Condition - Production AI Backend Routing

_For any_ API request made from a production deployment where the endpoint requires AI functionality (`/analyze_document`, `/compare_testimonies`), the fixed routing system SHALL direct the request to the HuggingFace Spaces backend URL, ensuring AI-generated explanations are included in all response objects.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Development Workflow and Non-AI Functionality

_For any_ API request that does NOT involve production AI endpoints (local development calls, non-AI endpoints, authentication), the fixed system SHALL produce exactly the same routing behavior as the original system, preserving localhost development workflow and all existing non-AI functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `c:\Users\ambsn\Desktop\LEXGUARD\frontend\.env.local` (and Vercel environment variables)

**Function**: Environment variable configuration

**Specific Changes**:
1. **Environment-Specific API URLs**: Create separate environment variables for development and production
   - Keep `NEXT_PUBLIC_API_URL=http://localhost:8000` for local development
   - Add `NEXT_PUBLIC_PRODUCTION_API_URL=https://huggingface.co/spaces/[space-name]/` for production

2. **Environment Detection Logic**: Implement conditional API URL selection in frontend code
   - Detect deployment environment (development vs production)
   - Use appropriate API URL based on environment context

3. **Vercel Environment Configuration**: Set production environment variables in Vercel dashboard
   - Configure `NEXT_PUBLIC_API_URL` to point to HuggingFace Spaces URL in production
   - Ensure proper override of development environment variables

4. **API Client Configuration**: Update API client code to use environment-aware URL selection
   - Modify all API call locations to use dynamic URL resolution
   - Add fallback logic for missing environment variables

5. **Backend Endpoint Validation**: Ensure HuggingFace Spaces backend exposes all required endpoints
   - Verify `/analyze_document` endpoint availability and CORS configuration
   - Test AI functionality availability on HuggingFace Spaces deployment

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Deploy the current frontend to a test environment and monitor API calls to verify they're routed to the wrong backend. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Production Analyze Document Test**: Deploy frontend to Vercel, upload document, verify API call goes to localhost:8000 instead of HuggingFace Spaces (will fail on unfixed code)
2. **Missing AI Explanations Test**: Call `/analyze_document` through production deployment, verify response lacks explanation fields (will fail on unfixed code)
3. **Docker Backend Limitation Test**: Direct API call to Docker backend (port 8000), verify it lacks GROQ_API_KEY functionality (will fail on unfixed code)
4. **Environment Variable Test**: Check Vercel deployment environment variables, verify incorrect API URL configuration (may fail on unfixed code)

**Expected Counterexamples**:
- Production API calls routed to localhost:8000 (unreachable from Vercel deployment)
- Empty or missing explanation fields in AI analysis responses
- Possible causes: hardcoded development URLs, missing environment configuration, incomplete backend feature parity

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := routeAPICall_fixed(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT routeAPICall_original(input) = routeAPICall_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for local development and non-AI endpoints, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Development Workflow Preservation**: Observe that localhost:8000 works correctly in development, then write test to verify this continues after fix
2. **Non-AI Endpoint Preservation**: Observe that `/users/sync` and other non-AI endpoints work correctly, then write test to verify this continues after fix
3. **Authentication Preservation**: Observe that Clerk authentication flow works correctly, then write test to verify this continues after fix

### Unit Tests

- Test environment variable loading and URL selection logic
- Test API client configuration with different environment settings
- Test edge cases (missing environment variables, invalid URLs)
- Test that development workflow continues to use localhost:8000

### Property-Based Tests

- Generate random deployment contexts and verify correct API URL selection
- Generate random API endpoints and verify preservation of non-AI functionality
- Test that all local development scenarios continue to work across many configurations

### Integration Tests

- Test full document analysis flow in production environment with HuggingFace Spaces backend
- Test switching between development and production deployments
- Test that AI explanations are properly generated and returned in production responses