// In dev, Vite runs on 3002, Next.js API on 3000
// In prod, both are on same domain
const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : '';

export async function apiGet<T>(endpoint: string, fallbackData?: T): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    
    if (!response.ok) {
      console.warn(`API error: ${response.status} - ${data.error || response.statusText}`);
      if (fallbackData !== undefined) return fallbackData;
      throw new Error(data.error || `API error: ${response.statusText}`);
    }

    return data as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('API request timed out');
      if (fallbackData !== undefined) return fallbackData;
      throw new Error('Request timed out. Server may not be running.');
    }
    console.error('API GET error:', error);
    if (fallbackData !== undefined) {
      console.log('Using fallback data');
      return fallbackData;
    }
    throw error;
  }
}

export async function apiPost<T>(endpoint: string, body: any, fallbackData?: T): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for POST

    console.log(`[API] POST ${endpoint}`, body);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: any;
    
    try {
      // Try to parse as JSON
      const text = await response.text();
      console.log(`[API] Raw response (${response.status}):`, text.substring(0, 500)); // Log first 500 chars
      
      if (text) {
        try {
          data = JSON.parse(text);
          console.log(`[API] Parsed JSON:`, data);
        } catch (parseError) {
          // Not valid JSON, use text as error
          console.error(`[API] JSON parse failed:`, parseError);
          data = { error: text || response.statusText };
        }
      } else {
        data = { error: response.statusText };
      }
    } catch (readError) {
      console.error(`[API] Failed to read response:`, readError);
      data = { error: response.statusText || 'Unknown error' };
    }

    if (!response.ok) {
      // Extract error message from multiple possible locations - check nested structures too
      let errorMessage = 
        data?.error || 
        data?.message || 
        data?.details || 
        (data?.success === false ? 'Request failed' : null) ||
        response.statusText || 
        'Unknown error';
      
      // Log to console with high visibility
      console.error('='.repeat(50));
      console.error(`[API] ERROR ${response.status}:`, errorMessage);
      console.error(`[API] Full response data:`, JSON.stringify(data, null, 2));
      console.error('='.repeat(50));
      
      if (fallbackData !== undefined) return fallbackData;
      
      // Ensure we have a meaningful error message
      if (errorMessage === 'Bad Request' || errorMessage === 'Unknown error') {
        if (data?.error && typeof data.error === 'string') {
          errorMessage = data.error;
        } else if (typeof data === 'object' && data !== null) {
          // Try to extract any useful message from the response
          const keys = Object.keys(data);
          for (const key of keys) {
            if (typeof data[key] === 'string' && data[key].length > 0 && key !== 'success') {
              errorMessage = data[key];
              break;
            }
          }
        }
      }
      
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).data = data;
      (error as any).response = response;
      throw error;
    }

    return data as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[API] Request timed out');
      if (fallbackData !== undefined) return fallbackData;
      throw new Error('Request timed out. Please try again.');
    }
    console.error('[API] POST error:', error);
    if (fallbackData !== undefined) {
      console.log('[API] Using fallback data');
      return fallbackData;
    }
    throw error;
  }
}

export async function apiDelete<T>(endpoint: string, body?: Record<string, any>): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.statusText}`);
    }

    return data as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    console.error('API DELETE error:', error);
    throw error;
  }
}

// Helper to check if API is available
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/etfs`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}
