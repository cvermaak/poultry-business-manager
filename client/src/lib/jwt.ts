const JWT_TOKEN_KEY = 'app_jwt_token';

/**
 * Store JWT token in localStorage
 */
export function setJWTToken(token: string): void {
  localStorage.setItem(JWT_TOKEN_KEY, token);
}

/**
 * Retrieve JWT token from localStorage
 */
export function getJWTToken(): string | null {
  return localStorage.getItem(JWT_TOKEN_KEY);
}

/**
 * Clear JWT token from localStorage
 */
export function clearJWTToken(): void {
  localStorage.removeItem(JWT_TOKEN_KEY);
}

/**
 * Get Authorization header with JWT token
 */
export function getAuthorizationHeader(): { Authorization: string } | {} {
  const token = getJWTToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
