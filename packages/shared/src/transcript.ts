// Locates a quoted snippet in the transcript, returning [start, end) character offsets, or null.
// Runs server-side to precompute offsets and client-side at render (hint = the stored offsets) so
// both agree. Trust order: a hint that still slices to the snippet, exact substring, then a
// whitespace/case-insensitive match so offsets survive transcript drift.
export function resolveSnippetRange(
  transcript: string,
  snippet: string | null | undefined,
  hint?: { start: number | null; end: number | null } | null,
): { start: number; end: number } | null {
  if (!transcript || !snippet) return null;
  if (
    hint &&
    hint.start != null &&
    hint.end != null &&
    hint.start >= 0 &&
    hint.end <= transcript.length &&
    transcript.slice(hint.start, hint.end) === snippet
  ) {
    return { start: hint.start, end: hint.end };
  }
  const exactIndex = transcript.indexOf(snippet);
  if (exactIndex >= 0) return { start: exactIndex, end: exactIndex + snippet.length };
  const fuzzyPattern = snippet
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!fuzzyPattern) return null;
  const match = new RegExp(fuzzyPattern, "i").exec(transcript);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
