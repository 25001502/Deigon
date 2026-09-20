// Accept only application-root-relative paths. Validate the decoded form too:
// browsers normalize backslashes and control characters during URL parsing.
export function safeCallbackPath(value: string | null): string {
  const fallback = "/account";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(value) ||
      /[\\\u0000-\u001f\u007f]/.test(decoded) ||
      value !== value.trim()
    ) return fallback;

    const base = "https://callback.invalid";
    const destination = new URL(value, base);
    if (destination.origin !== base) return fallback;
    // Dot-segment normalization must not produce a protocol-relative Location.
    if (destination.pathname.startsWith("//")) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
