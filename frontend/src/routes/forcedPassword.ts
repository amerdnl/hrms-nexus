/**
 * Where an account still holding a temporary password is sent.
 *
 * Kept in its own module so the route definition, the guard and the redirect all
 * name the same path; a typo in one of three string literals would otherwise
 * produce a redirect loop.
 */
export const FORCED_PASSWORD_PATH = "/change-password";
