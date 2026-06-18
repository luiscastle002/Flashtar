/**
 * Translates an error key if it starts with 'errors.', otherwise returns the raw message fallback.
 */
export function translateError(
  errorKeyOrMsg: string | undefined | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string
): string {
  if (!errorKeyOrMsg) return "";
  if (errorKeyOrMsg.startsWith("errors.")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return t(errorKeyOrMsg as any);
    } catch {
      return errorKeyOrMsg;
    }
  }
  return errorKeyOrMsg;
}
