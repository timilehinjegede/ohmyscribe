import { expect, test } from "bun:test";
import { MAX_EXTRACTION_ATTEMPTS, nextStatusAfterFailure } from "./queue.ts";

test("the first failure burns an attempt and re-queues", () => {
  expect(nextStatusAfterFailure(0)).toEqual({ attempts: 1, status: "queued" });
});

test("the second failure burns another attempt and still re-queues", () => {
  expect(nextStatusAfterFailure(1)).toEqual({ attempts: 2, status: "queued" });
});

test("the third failure reaches the attempt cap and fails", () => {
  expect(nextStatusAfterFailure(2)).toEqual({ attempts: 3, status: "failed" });
});

test("a failure past the cap stays failed", () => {
  expect(nextStatusAfterFailure(5)).toEqual({ attempts: 6, status: "failed" });
});

test("the attempt cap is three", () => {
  expect(MAX_EXTRACTION_ATTEMPTS).toBe(3);
});
