/**
 * Deterministic JSON serialisation.
 *
 * Same inputs must produce byte-identical outputs. Git history never shrinks,
 * so a run that rewrites all 400 day files nightly costs ~150MB of
 * unreclaimable history a year; a deterministic one changes two files a night.
 *
 * Key order comes from insertion order in the record builders, which is fixed
 * in code — not from sorting — so the published field order stays readable and
 * stable.
 */

/** Serialises to the exact bytes written to disk: 2-space indent, trailing newline. */
export function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
