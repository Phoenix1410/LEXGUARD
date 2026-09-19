/**
 * API Configuration Utility
 * 
 * Implements environment-aware API URL selection to fix the LEXGUARD AI Backend Routing bug.
 * 
 * Bug Condition: Production deployments incorrectly route to localhost:8000 (basic Docker backend)
 * instead of HuggingFace Spaces (full AI capabilities with GROQ_API_KEY and ChatGroq).
 * 
 * Expected Behavior: Production uses HuggingFace Spaces, development uses localhost:8000.
 */

/**
 * Determines if we're running in a production environment
 * Uses multiple indicators to detect production deployment
 */
export function isProductionEnvironment(): boolean {
  // Check if we're running in browser
  if (typeof window === 'undefined') {
    return false
  }
  
  // Multiple production environment indicators
  const isVercelProd = process.env.NODE_ENV === 'production'
  const isVercelDomain = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  const hasProductionEnvVar = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  
  return isVercelProd && isVercelDomain || hasProductionEnvVar
}

/**
 * Gets the appropriate API URL based on environment and endpoint requirements
 * 
 * @param endpoint - The API endpoint being called (e.g., '/analyze_document', '/compare_testimonies')
 * @returns The appropriate backend URL
 */
export function getApiUrl(endpoint?: string): string {
  // Development fallback (preserves existing localhost workflow)
  const developmentUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  
  // Production HuggingFace Spaces URL (contains full AI stack)
  // Allow override via environment variable for flexibility
  const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_API_URL || 'https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API'
  
  // Check if we're in production environment
  if (isProductionEnvironment()) {
    // For AI-powered endpoints, always use HuggingFace Spaces in production
    if (endpoint && isAIEndpoint(endpoint)) {
      console.log(`[API Config] Production AI endpoint ${endpoint} -> HuggingFace Spaces`)
      console.log(`[API Config] Using URL: ${productionUrl}`)
      return productionUrl
    }
    
    // For other endpoints in production, use HuggingFace Spaces as well
    // (since it should have all endpoints)
    console.log(`[API Config] Production endpoint ${endpoint || 'unknown'} -> HuggingFace Spaces`)
    console.log(`[API Config] Using URL: ${productionUrl}`)
    return productionUrl
  }
  
  // Development environment - use localhost for all endpoints
  console.log(`[API Config] Development endpoint ${endpoint || 'unknown'} -> localhost:8000`)
  console.log(`[API Config] Using URL: ${developmentUrl}`)
  return developmentUrl
}

/**
 * Determines if an endpoint requires AI functionality
 * These endpoints need the HuggingFace Spaces backend with GROQ_API_KEY
 * 
 * @param endpoint - The API endpoint path
 * @returns True if endpoint requires AI capabilities
 */
export function isAIEndpoint(endpoint: string): boolean {
  const aiEndpoints = [
    '/analyze_document',    // Requires ChatGroq for explanation generation
    '/compare_testimonies'  // Requires AI for comparative analysis
  ]
  
  return aiEndpoints.some(aiEndpoint => endpoint.includes(aiEndpoint))
}

/**
 * Legacy compatibility function
 * Provides the same interface as the original hardcoded approach
 * 
 * @deprecated Use getApiUrl() with endpoint parameter for better routing
 * @returns API base URL
 */
export function getLegacyApiUrl(): string {
  return getApiUrl()
}

/**
 * Environment info for debugging
 */
export function getEnvironmentInfo() {
  if (typeof window === 'undefined') {
    return {
      environment: 'server',
      hostname: 'N/A',
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV
    }
  }
  
  return {
    environment: isProductionEnvironment() ? 'production' : 'development',
    hostname: window.location.hostname,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    apiUrl: getApiUrl(),
    developmentUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    productionUrl: process.env.NEXT_PUBLIC_PRODUCTION_API_URL || 'https://huggingface.co/spaces/Phoenix1410/LEXGUARD_API'
  }
}

/**
 * Validates API connectivity (for debugging and health checks)
 * 
 * @param apiUrl - The API URL to test
 * @returns Promise with connectivity status
 */
export async function validateApiConnectivity(apiUrl?: string): Promise<{
  success: boolean;
  error?: string;
  url: string;
  timestamp: string;
}> {
  const testUrl = apiUrl || getApiUrl()
  
  try {
    // Try to fetch from the root endpoint
    const response = await fetch(testUrl, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    return {
      success: response.ok,
      url: testUrl,
      timestamp: new Date().toISOString(),
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
    }
  } catch (error) {
    return {
      success: false,
      url: testUrl,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}