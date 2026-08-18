const UNKNOWN_ERROR = 'Unknown error';

/**
 * Coerce an unknown thrown value into a message safe to show the user.
 *
 * `catch` bindings are `unknown`: a rejection can carry an `Error`, a bare
 * string, or anything else. Falls back to a generic message rather than
 * rendering `[object Object]` or an empty banner.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return UNKNOWN_ERROR;
}
