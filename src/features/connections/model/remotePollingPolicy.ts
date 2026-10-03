/** Transcript reads may slow down in the background; explicit commands never do. */
export function remoteSessionPollDelay(
  active: boolean,
  visible: boolean,
  hidden: boolean,
  failures = 0,
): number {
  const normal = hidden
    ? active
      ? 5_000
      : 30_000
    : !visible
      ? active
        ? 3_000
        : 10_000
      : active
        ? 750
        : 3_000;
  return failures
    ? Math.max(normal, Math.min(30_000, 750 * 2 ** Math.min(failures, 6)))
    : normal;
}
