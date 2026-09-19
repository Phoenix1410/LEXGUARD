/**
 * Fix Verification Tests
 * 
 * Tests that verify the LEXGUARD AI Backend Routing fix works correctly
 * These tests demonstrate that the bug is fixed when using the new getApiUrl() function
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getApiUrl, isProductionEnvironment } from '@/lib/api-config'

describe('Fix Verification - Environment-Aware API Routing', () => {
  const originalEnv = process.env
  
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    
    // Mock window object
    Object.defineProperty(global, 'window', {
      value: {
        location: {
          hostname: 'localhost'
        }
      },
      writable: true
    })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Bug Fix Verification', () => {
    it('should fix the bug condition: Production AI endpoints route to HuggingFace Spaces, not localhost', () => {
      // Simulate the original bug condition
      process.env.NODE_ENV = 'production'
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000' // This was the bug
      global.window.location.hostname = 'lexguard.vercel.app' // Production deployment
      
      // Test that the fix works
      const apiUrl = getApiUrl('/analyze_document')
      
      // FIXED: Should NOT use localhost in production (this was the bug)
      expect(apiUrl).not.toBe('http://localhost:8000')
      
      // FIXED: Should use HuggingFace Spaces URL for AI functionality
      expect(apiUrl).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
      
      // Verify this is indeed a production environment
      expect(isProductionEnvironment()).toBe(true)
    })

    it('should preserve development workflow: localhost development still works', () => {
      // Development environment (no bug condition)
      process.env.NODE_ENV = 'development'
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
      global.window.location.hostname = 'localhost'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // PRESERVED: Development still uses localhost
      expect(apiUrl).toBe('http://localhost:8000')
      
      // Verify this is development environment
      expect(isProductionEnvironment()).toBe(false)
    })

    it('should handle both AI and non-AI endpoints correctly in production', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      // AI endpoints should route to HuggingFace Spaces
      expect(getApiUrl('/analyze_document')).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
      expect(getApiUrl('/compare_testimonies')).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
      
      // Non-AI endpoints should also route to HuggingFace Spaces (single backend deployment)
      expect(getApiUrl('/users/sync')).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
      expect(getApiUrl('/health')).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
    })

    it('should handle missing environment variables gracefully', () => {
      // No NEXT_PUBLIC_API_URL set (common in fresh deployments)
      delete process.env.NEXT_PUBLIC_API_URL
      process.env.NODE_ENV = 'development'
      global.window.location.hostname = 'localhost'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // Should default to localhost:8000 in development
      expect(apiUrl).toBe('http://localhost:8000')
    })

    it('should handle edge cases: staging environment detection', () => {
      // Staging/preview environments should not be treated as production
      process.env.NODE_ENV = 'production'
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview' // Vercel preview deployment
      global.window.location.hostname = 'lexguard-preview-abc123.vercel.app'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // Preview deployments should use HuggingFace Spaces for testing
      expect(apiUrl).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
    })
  })

  describe('Expected Behavior Validation', () => {
    it('should satisfy Expected Behavior 2.1: Production AI-generated explanations', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // This URL should contain the complete AI analysis stack
      expect(apiUrl).toContain('huggingface.co/spaces')
      expect(apiUrl).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
    })

    it('should satisfy Expected Behavior 2.2: Correct production routing', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // Should route to backend with GROQ_API_KEY and ChatGroq capabilities
      expect(apiUrl).not.toContain('localhost')
      expect(apiUrl).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
    })
  })
})