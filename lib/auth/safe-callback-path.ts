// Accept only application-root-relative paths. Validate the decoded form too:
// browsers normalize backslashes and control characters during URL parsing.
export function safeCallbackPath(value: unknown): string {
  const fallback = "/account";
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
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

export function authPathFor(mode: "login" | "signup", next: unknown): string {
  const destination = safeCallbackPath(next);
  return destination === "/account"
    ? `/${mode}`
    : `/${mode}?next=${encodeURIComponent(destination)}`;
}
