# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Production API Routing Failure
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test implementation details from Bug Condition in design: production environment + non-HuggingFace API URL + AI endpoint
  - The test assertions should match the Expected Behavior Properties from design
  - Create test that simulates production environment where `NEXT_PUBLIC_API_URL` points to localhost:8000
  - Test should verify that `/analyze_document` calls fail to return AI-generated explanations (empty explanation fields)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Development Workflow and Non-AI Functionality
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (localhost development environment)
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Test that localhost development workflow continues to work (localhost:8000 API calls succeed)
  - Test that Sniper model clause detection continues to function correctly
  - Test that Scout model semantic search continues to work
  - Test that non-AI endpoints continue to return expected results
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for LEXGUARD AI Backend Routing

  - [x] 3.1 Implement environment detection and API URL selection logic
    - Add environment detection in frontend API call code
    - Implement conditional API URL selection based on deployment environment
    - Update API calls in `/app/dashboard/use/page.tsx` to use environment-aware URL
    - Update API calls in `/app/dashboard/testimony/page.tsx` to use environment-aware URL  
    - Update API calls in `/app/dashboard/page.tsx` to use environment-aware URL
    - Create utility function for API URL resolution
    - _Bug_Condition: isBugCondition(input) where input.environment == 'production' AND input.api_url NOT CONTAINS 'huggingface.co/spaces' AND input.endpoint IN ['/analyze_document', '/compare_testimonies']_
    - _Expected_Behavior: expectedBehavior(result) from design - production deployments correctly route to HuggingFace Spaces backend with full AI capabilities_
    - _Preservation: Preserve localhost development workflow and non-AI functionality from design_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Configure production environment variables
    - Identify the HuggingFace Spaces URL for the LEXGUARD backend
    - Set up production-specific environment variable configuration
    - Create separate environment handling for development vs production
    - Add fallback logic for missing environment variables
    - Document environment variable configuration for Vercel deployment
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: Preservation Requirements from design_
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.4_

  - [x] 3.3 Validate HuggingFace Spaces backend endpoint compatibility
    - Verify `/analyze_document` endpoint availability on HuggingFace Spaces
    - Verify `/compare_testimonies` endpoint availability on HuggingFace Spaces
    - Test CORS configuration for frontend access
    - Validate AI functionality availability (GROQ_API_KEY, ChatGroq analyst)
    - Ensure process_analyst_evaluation function works correctly
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: Preservation Requirements from design_
    - _Requirements: 2.1, 2.2, 2.3, 5.1, 5.2, 5.3_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Production AI Backend Routing
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify that production API calls now route to HuggingFace Spaces
    - Verify that AI-generated explanations are included in response objects
    - _Requirements: Expected Behavior Properties from design_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Development Workflow and Non-AI Functionality
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - Verify localhost development workflow still works correctly
    - Verify non-AI functionality remains unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Create deployment guide for Vercel environment variable configuration
  - Document the HuggingFace Spaces URL configuration process
  - Test end-to-end production deployment scenario if possible