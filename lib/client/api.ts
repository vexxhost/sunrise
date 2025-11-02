/**
 * Client-side API utilities for making requests to OpenStack services
 * via the Next.js API proxy endpoint
 */

/**
 * Base fetch wrapper for API proxy calls
 */
async function proxyFetch<T>(
  service: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `/api/proxy/${service}/${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Build query string from options object
 */
function buildQueryString(options?: Record<string, any>): string {
  if (!options) return '';
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const api = {
  /**
   * Generic proxy fetch method
   */
  fetch: proxyFetch,

  /**
   * Build query string helper
   */
  query: buildQueryString,
};
