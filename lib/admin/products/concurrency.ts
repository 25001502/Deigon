import "server-only";

export function nextProductUpdatedAt(current: Date, now = new Date()): Date {
  const currentMilliseconds = current.getTime();
  if (!Number.isFinite(currentMilliseconds)) throw new RangeError("Invalid current Product timestamp");
  const clockMilliseconds = now.getTime();
  return new Date(Math.max(
    Number.isFinite(clockMilliseconds) ? clockMilliseconds : currentMilliseconds + 1,
    currentMilliseconds + 1,
  ));
}
