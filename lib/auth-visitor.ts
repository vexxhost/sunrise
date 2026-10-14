export const RETURNING_VISITOR_COOKIE = "sunrise-returning-visitor";
export const RETURNING_VISITOR_COOKIE_VALUE = "1";
export const REMEMBERED_IDENTITY_PROVIDER_COOKIE =
  "sunrise-identity-provider";

const RETURNING_VISITOR_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function isReturningVisitor(value?: string): boolean {
  return value === RETURNING_VISITOR_COOKIE_VALUE;
}

export function returningVisitorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: RETURNING_VISITOR_MAX_AGE_SECONDS,
  };
}

export function rememberedIdentityProviderCookieOptions() {
  return returningVisitorCookieOptions();
}
