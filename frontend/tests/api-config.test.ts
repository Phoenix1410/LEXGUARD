/**
 * Unit tests for the API configuration utility
 * 
 * Tests the environment detection and API URL selection logic
 * that fixes the LEXGUARD AI Backend Routing bug
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isProductionEnvironment, getApiUrl, isAIEndpoint, getEnvironmentInfo } from '@/lib/api-config'

// Mock window object for environment detection tests
const mockWindow = vi.fn()

describe('API Configuration Utility', () => {
  const originalEnv = process.env
  const originalWindow = global.window

  beforeEach(() => {
    // Reset environment variables
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
    global.window = originalWindow
  })

  describe('isProductionEnvironment', () => {
    it('should return false in development environment', () => {
      process.env.NODE_ENV = 'development'
      global.window.location.hostname = 'localhost'
      
      expect(isProductionEnvironment()).toBe(false)
    })

    it('should return true in production with production domain', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      expect(isProductionEnvironment()).toBe(true)
    })

    it('should return false in production but localhost domain', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'localhost'
      
      expect(isProductionEnvironment()).toBe(false)
    })

    it('should return true when VERCEL_ENV is production', () => {
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
      global.window.location.hostname = 'example.com'
      
      expect(isProductionEnvironment()).toBe(true)
    })

    it('should return false on server side (no window)', () => {
      // @ts-ignore - deliberately testing undefined window
      global.window = undefined as any
      
      expect(isProductionEnvironment()).toBe(false)
    })
  })

  describe('isAIEndpoint', () => {
    it('should identify AI endpoints correctly', () => {
      expect(isAIEndpoint('/analyze_document')).toBe(true)
      expect(isAIEndpoint('/compare_testimonies')).toBe(true)
      expect(isAIEndpoint('/api/analyze_document')).toBe(true)
      expect(isAIEndpoint('/v1/compare_testimonies')).toBe(true)
    })

    it('should identify non-AI endpoints correctly', () => {
      expect(isAIEndpoint('/users/sync')).toBe(false)
      expect(isAIEndpoint('/health')).toBe(false)
      expect(isAIEndpoint('/upload')).toBe(false)
      expect(isAIEndpoint('/documents')).toBe(false)
    })
  })

  describe('getApiUrl', () => {
    const HUGGINGFACE_URL = 'https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API'
    
    it('should return localhost in development environment', () => {
      process.env.NODE_ENV = 'development'
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
      global.window.location.hostname = 'localhost'
      
      expect(getApiUrl('/analyze_document')).toBe('http://localhost:8000')
      expect(getApiUrl('/users/sync')).toBe('http://localhost:8000')
    })

    it('should return HuggingFace URL for AI endpoints in production', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      expect(getApiUrl('/analyze_document')).toBe(HUGGINGFACE_URL)
      expect(getApiUrl('/compare_testimonies')).toBe(HUGGINGFACE_URL)
    })

    it('should return HuggingFace URL for all endpoints in production', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      expect(getApiUrl('/users/sync')).toBe(HUGGINGFACE_URL)
      expect(getApiUrl('/health')).toBe(HUGGINGFACE_URL)
      expect(getApiUrl()).toBe(HUGGINGFACE_URL)
    })

    it('should use default localhost when NEXT_PUBLIC_API_URL is missing', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.NEXT_PUBLIC_API_URL
      global.window.location.hostname = 'localhost'
      
      expect(getApiUrl('/analyze_document')).toBe('http://localhost:8000')
    })

    it('should preserve custom localhost URLs in development', () => {
      process.env.NODE_ENV = 'development'
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001'
      global.window.location.hostname = 'localhost'
      
      expect(getApiUrl('/analyze_document')).toBe('http://localhost:3001')
    })
  })

  describe('getEnvironmentInfo', () => {
    it('should return server info when window is undefined', () => {
      // @ts-ignore - deliberately testing undefined window
      global.window = undefined as any
      
      const info = getEnvironmentInfo()
      
      expect(info.environment).toBe('server')
      expect(info.hostname).toBe('N/A')
    })

    it('should return development info correctly', () => {
      process.env.NODE_ENV = 'development'
      global.window.location.hostname = 'localhost'
      
      const info = getEnvironmentInfo()
      
      expect(info.environment).toBe('development')
      expect(info.hostname).toBe('localhost')
      expect(info.nodeEnv).toBe('development')
    })

    it('should return production info correctly', () => {
      process.env.NODE_ENV = 'production'
      global.window.location.hostname = 'lexguard.vercel.app'
      
      const info = getEnvironmentInfo()
      
      expect(info.environment).toBe('production')
      expect(info.hostname).toBe('lexguard.vercel.app')
      expect(info.nodeEnv).toBe('production')
    })
  })

  describe('Bug Condition Prevention', () => {
    it('should NOT route production AI endpoints to localhost', () => {
      // This test verifies the bug condition is fixed
      process.env.NODE_ENV = 'production'
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000' // Bug condition: wrong URL in production
      global.window.location.hostname = 'lexguard.vercel.app'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // Should NOT use localhost in production, even if env var is set to localhost
      expect(apiUrl).not.toBe('http://localhost:8000')
      expect(apiUrl).toBe('https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API')
    })

    it('should preserve development workflow with localhost', () => {
      // This test verifies preservation requirement 3.1
      process.env.NODE_ENV = 'development'
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
      global.window.location.hostname = 'localhost'
      
      const apiUrl = getApiUrl('/analyze_document')
      
      // Should continue using localhost in development
      expect(apiUrl).toBe('http://localhost:8000')
    })
  })
})