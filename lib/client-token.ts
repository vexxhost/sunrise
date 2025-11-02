// Client-side token utilities
export function getClientToken(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'sunrise_token') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export function setClientToken(token: string) {
  if (typeof document === 'undefined') return;

  // Set cookie with SameSite and Secure flags for security
  document.cookie = `sunrise_token=${encodeURIComponent(token)}; path=/; SameSite=Lax; max-age=86400`;
}

export function clearClientToken() {
  if (typeof document === 'undefined') return;

  document.cookie = 'sunrise_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}
