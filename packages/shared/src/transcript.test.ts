import { expect, test } from "bun:test";
import { resolveSnippetRange } from "./transcript.ts";

const transcript = "Patient bathes with help. She grooms self every morning without assistance.";

test("an exact substring resolves to offsets that slice back to the snippet", () => {
  const range = resolveSnippetRange(transcript, "grooms self");
  expect(range).not.toBeNull();
  expect(transcript.slice(range!.start, range!.end)).toBe("grooms self");
});

test("a valid hint wins even when the phrase also appears earlier", () => {
  const repeated = "help needed. help needed again.";
  const secondOccurrenceStart = repeated.lastIndexOf("help needed");
  const range = resolveSnippetRange(repeated, "help needed", {
    start: secondOccurrenceStart,
    end: secondOccurrenceStart + "help needed".length,
  });
  expect(range).toEqual({
    start: secondOccurrenceStart,
    end: secondOccurrenceStart + "help needed".length,
  });
});

test("a stale hint that no longer slices to the snippet falls back to searching", () => {
  const range = resolveSnippetRange(transcript, "grooms self", { start: 0, end: 11 });
  expect(range).toEqual({
    start: transcript.indexOf("grooms self"),
    end: transcript.indexOf("grooms self") + "grooms self".length,
  });
});

test("an out-of-bounds hint is rejected, not sliced", () => {
  const range = resolveSnippetRange(transcript, "grooms self", {
    start: -3,
    end: transcript.length + 50,
  });
  expect(range).toEqual({
    start: transcript.indexOf("grooms self"),
    end: transcript.indexOf("grooms self") + "grooms self".length,
  });
});

test("whitespace and case drift still matches, covering the drifted run", () => {
  const drifted = "Notes: Grooms  self\nwithout assistance.";
  const range = resolveSnippetRange(drifted, "grooms self");
  expect(range).not.toBeNull();
  expect(drifted.slice(range!.start, range!.end).toLowerCase().replace(/\s+/g, " ")).toBe(
    "grooms self",
  );
});

test("regex metacharacters in the snippet are matched literally", () => {
  const withPunctuation = "Diagnosis: asthma (moderate) confirmed.";
  const range = resolveSnippetRange(withPunctuation, "asthma  (moderate)");
  expect(range).not.toBeNull();
  expect(withPunctuation.slice(range!.start, range!.end)).toBe("asthma (moderate)");
});

test("a snippet absent from the transcript resolves to null", () => {
  expect(resolveSnippetRange(transcript, "paraphrased not present")).toBeNull();
});

test("a null, undefined, empty, or whitespace-only snippet resolves to null", () => {
  expect(resolveSnippetRange(transcript, null)).toBeNull();
  expect(resolveSnippetRange(transcript, undefined)).toBeNull();
  expect(resolveSnippetRange(transcript, "")).toBeNull();
  expect(resolveSnippetRange(transcript, "   ")).toBeNull();
});

test("an empty transcript resolves to null", () => {
  expect(resolveSnippetRange("", "grooms self")).toBeNull();
});
