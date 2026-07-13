import { expect, test } from "bun:test";
import {
  acceptanceRate,
  bucketCaseMixWeights,
  CMI_BUCKET_EDGES,
  type AnalyticsData,
} from "./analytics.ts";
import { barWidthPercent, renderAnalyticsHtml } from "./routes/reviewer.tsx";

test("acceptanceRate is accepted over decided", () => {
  expect(acceptanceRate(3, 1)).toBe(0.75);
  expect(acceptanceRate(0, 4)).toBe(0);
});

test("acceptanceRate is null when nothing was decided (no divide by zero)", () => {
  expect(acceptanceRate(0, 0)).toBeNull();
});

test("bucketCaseMixWeights places weights into half-open buckets, edges falling upward", () => {
  const buckets = bucketCaseMixWeights([0.5, 0.8, 0.9, 1.0, 1.19, 1.2, 1.4, 2.0], CMI_BUCKET_EDGES);
  expect(buckets.map((bucket) => bucket.label)).toEqual([
    "< 0.8",
    "0.8-1",
    "1-1.2",
    "1.2-1.4",
    "≥ 1.4",
  ]);
  expect(buckets.map((bucket) => bucket.count)).toEqual([1, 2, 2, 1, 2]);
});

test("bucketCaseMixWeights counts every weight exactly once", () => {
  const caseMixWeights = [0.1, 0.9, 1.1, 1.3, 5.0, 1.0];
  const buckets = bucketCaseMixWeights(caseMixWeights, CMI_BUCKET_EDGES);
  const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  expect(totalCount).toBe(caseMixWeights.length);
});

test("bucketCaseMixWeights with no weights returns all-zero buckets", () => {
  const buckets = bucketCaseMixWeights([], CMI_BUCKET_EDGES);
  expect(buckets).toHaveLength(CMI_BUCKET_EDGES.length + 1);
  expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
});

test("barWidthPercent clamps to 0–100 and treats null/NaN as 0", () => {
  expect(barWidthPercent(2 / 3)).toBe(67);
  expect(barWidthPercent(1.5)).toBe(100);
  expect(barWidthPercent(-0.2)).toBe(0);
  expect(barWidthPercent(null)).toBe(0);
  expect(barWidthPercent(Number.NaN)).toBe(0);
});

const populatedFixture: AnalyticsData = {
  acceptanceByItem: [
    { itemCode: "M1800", label: "Grooming", accepted: 2, overridden: 1, pending: 1, rate: 2 / 3 },
  ],
  diagnosisAcceptance: { accepted: 1, overridden: 1, rate: 0.5 },
  lowConfidenceAccepted: [
    {
      assessmentId: "22222222-2222-2222-2222-222222222222",
      itemCode: "M1800",
      suggestedValue: '"9" & <em>unverified</em>',
      confidence: 0.2,
      patientName: '<script>alert("pwned")</script>',
    },
  ],
  cmiDistribution: {
    buckets: [
      { label: "< 0.8", count: 0 },
      { label: "0.8-1", count: 2 },
      { label: "1-1.2", count: 1 },
      { label: "1.2-1.4", count: 0 },
      { label: "≥ 1.4", count: 0 },
    ],
    filedCount: 3,
    meanCaseMixWeight: 1.021,
  },
  perNurse: [
    {
      userId: null,
      name: "Unassigned",
      role: null,
      accepted: 1,
      overridden: 2,
      rate: 1 / 3,
      filedVisits: 2,
    },
  ],
};

const emptyFixture: AnalyticsData = {
  acceptanceByItem: [],
  diagnosisAcceptance: { accepted: 0, overridden: 0, rate: null },
  lowConfidenceAccepted: [],
  cmiDistribution: { buckets: [], filedCount: 0, meanCaseMixWeight: null },
  perNurse: [],
};

test("renderAnalyticsHtml renders all four sections", () => {
  const html = renderAnalyticsHtml(populatedFixture);
  expect(html).toContain("Acceptance by OASIS item");
  expect(html).toContain("Low-confidence accepts");
  expect(html).toContain("Case-mix distribution");
  expect(html).toContain("Per-nurse summary");
  expect(html).toContain("M1800");
  expect(html).toContain("Unassigned");
});

test("renderAnalyticsHtml escapes DB-derived text (patient name, suggested value)", () => {
  const html = renderAnalyticsHtml(populatedFixture);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;");
  expect(html).toContain("&quot;9&quot; &amp; &lt;em&gt;unverified&lt;/em&gt;");
});

test("renderAnalyticsHtml keeps bar widths inside 0–100", () => {
  const html = renderAnalyticsHtml(populatedFixture);
  const widths = [...html.matchAll(/width:(-?\d+)%/g)].map((match) => Number(match[1]));
  expect(widths.length).toBeGreaterThan(0);
  expect(widths.every((width) => width >= 0 && width <= 100)).toBe(true);
});

test("renderAnalyticsHtml shows an empty state per section when there is no data", () => {
  const html = renderAnalyticsHtml(emptyFixture);
  expect(html).toContain("No reconciled AI drafts yet.");
  expect(html).toContain("No low-confidence AI answers were accepted.");
  expect(html).toContain("No filed assessments yet.");
  expect(html).toContain("No filed decisions yet.");
});
