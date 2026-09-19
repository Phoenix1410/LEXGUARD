/**
 * Bug Condition Exploration Test - Task 1 (Updated for Task 3.4)
 * 
 * **Property 1: Expected Behavior** - Production AI Backend Routing (FIXED)
 * 
 * **UPDATED**: This test now validates that the routing fix works correctly
 * **GOAL**: Verify production deployments route to HuggingFace Spaces backend
 * **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getApiUrl, isProductionEnvironment, getEnvironmentInfo } from '../lib/api-config'

interface AnalysisResult {
  id: number
  text: string
  risk_type: string
  confidence: number
  explanation: string
  source?: string
}

interface AnalysisResponse {
  filename: string
  total_clauses_scanned: number
  risks_found: number
  results: AnalysisResult[]
}

describe('Bug Condition Exploration - Production AI Backend Routing (FIXED)', () => {
  const originalEnv = process.env
  const originalWindow = global.window

  beforeEach(() => {
    vi.clearAllMocks()
    // Preserve original environment
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    global.window = originalWindow
  })

  it('should confirm routing fix: Production environment correctly routes to HuggingFace Spaces', async () => {
    // **ROUTING FIX VALIDATION**: Verify the fix routes production calls correctly
    
    // Simulate production environment conditions
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    
    // Mock browser environment for production detection
    Object.defineProperty(global, 'window', {
      writable: true,
      value: {
        location: {
          hostname: 'lexguard-app.vercel.app' // Simulated production domain
        }
      }
    })

    // **CRITICAL ASSERTION**: Verify production environment is detected
    expect(isProductionEnvironment(), 
      'Production environment should be detected correctly'
    ).toBe(true)

    // **ROUTING FIX VERIFICATION**: Check that AI endpoints route to HuggingFace Spaces
    const analyzeDocumentUrl = getApiUrl('/analyze_document')
    const compareTestimoniesUrl = getApiUrl('/compare_testimonies')
    
    // Verify routing to HuggingFace Spaces (not localhost:8000)
    expect(analyzeDocumentUrl, 
      'Production /analyze_document should route to HuggingFace Spaces, not localhost:8000'
    ).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
    
    expect(compareTestimoniesUrl,
      'Production /compare_testimonies should route to HuggingFace Spaces, not localhost:8000'
    ).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')

    // Verify the URL does NOT contain localhost (bug condition eliminated)
    expect(analyzeDocumentUrl).not.toContain('localhost')
    expect(analyzeDocumentUrl).not.toContain('8000')
    
    // Verify the URL DOES contain HuggingFace Spaces (expected behavior)
    expect(analyzeDocumentUrl).toContain('huggingface.co/spaces')
    
    // **ENVIRONMENT INFO DEBUGGING**
    const envInfo = getEnvironmentInfo()
    console.log('🔧 ROUTING FIX VERIFIED:')
    console.log(`  - Environment detected: ${envInfo.environment}`)
    console.log(`  - Hostname: ${envInfo.hostname}`)
    console.log(`  - API URL for /analyze_document: ${analyzeDocumentUrl}`)
    console.log(`  - API URL for /compare_testimonies: ${compareTestimoniesUrl}`)
    console.log(`  ✅ Production routes to HuggingFace Spaces (bug fixed)`)
    console.log(`  ✅ No longer routes to localhost:8000 in production`)
  })

  it('should verify development environment preservation: localhost routing still works', async () => {
    // **PRESERVATION VERIFICATION**: Ensure development workflow is preserved
    
    // Simulate development environment
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
    delete process.env.NEXT_PUBLIC_VERCEL_ENV
    
    // Mock browser environment for development
    Object.defineProperty(global, 'window', {
      writable: true,
      value: {
        location: {
          hostname: 'localhost'
        }
      }
    })

    // **PRESERVATION ASSERTION**: Development should still use localhost
    expect(isProductionEnvironment(), 
      'Development environment should be detected correctly'
    ).toBe(false)

    const devAnalyzeUrl = getApiUrl('/analyze_document')
    const devCompareUrl = getApiUrl('/compare_testimonies')
    
    // Verify development still routes to localhost (preservation requirement)
    expect(devAnalyzeUrl, 
      'Development /analyze_document should preserve localhost:8000 routing'
    ).toBe('http://localhost:8000')
    
    expect(devCompareUrl,
      'Development /compare_testimonies should preserve localhost:8000 routing'  
    ).toBe('http://localhost:8000')

    console.log('🔧 DEVELOPMENT PRESERVATION VERIFIED:')
    console.log(`  - Environment: development`)
    console.log(`  - API URL: ${devAnalyzeUrl}`)
    console.log(`  ✅ Development still uses localhost:8000 (preservation confirmed)`)
  })

  it('should verify environment variable override capability', async () => {
    // **FLEXIBILITY VERIFICATION**: Test custom production URL override
    
    const customHuggingFaceUrl = 'https://huggingface.co/spaces/custom/LEXGUARD_CUSTOM'
    
    // Simulate production with custom override
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_PRODUCTION_API_URL = customHuggingFaceUrl
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    
    Object.defineProperty(global, 'window', {
      writable: true,
      value: {
        location: {
          hostname: 'custom-lexguard.vercel.app'
        }
      }
    })

    const customUrl = getApiUrl('/analyze_document')
    
    // Verify custom URL is used
    expect(customUrl).toBe(customHuggingFaceUrl)
    expect(customUrl).toContain('custom/LEXGUARD_CUSTOM')
    
    console.log('🔧 CUSTOM URL OVERRIDE VERIFIED:')
    console.log(`  - Custom production URL: ${customUrl}`)
    console.log(`  ✅ Environment variable override works correctly`)
  })
})