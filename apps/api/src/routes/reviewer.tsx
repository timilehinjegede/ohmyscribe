/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { getOasisResponseLabel } from "@ohmyscribe/shared";
import { db } from "../db.ts";
import { gatherAnalytics, type AnalyticsData } from "../analytics.ts";
import { Layout } from "./layout.tsx";

export function barWidthPercent(fraction: number | null): number {
  if (fraction === null || Number.isNaN(fraction)) return 0;
  return Math.min(100, Math.max(0, Math.round(fraction * 100)));
}

const formatRate = (rate: number | null): string =>
  rate === null ? "—" : `${Math.round(rate * 100)}%`;

function Bar({ fraction }: { fraction: number | null }) {
  return (
    <div class="bar">
      <span style={`width:${barWidthPercent(fraction)}%`}></span>
    </div>
  );
}

function RateBar({ rate }: { rate: number | null }) {
  return (
    <div class="rate">
      <Bar fraction={rate} />
      {formatRate(rate)}
    </div>
  );
}

function AcceptanceSection({ data }: { data: AnalyticsData }) {
  return (
    <>
      <h2>Acceptance by OASIS item</h2>
      {data.acceptanceByItem.length === 0 ? (
        <p class="muted">No reconciled AI drafts yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Accepted</th>
              <th>Overridden</th>
              <th>Pending</th>
              <th>Acceptance rate</th>
            </tr>
          </thead>
          <tbody>
            {data.acceptanceByItem.map((item) => (
              <tr>
                <td>
                  {item.itemCode}
                  <div class="muted">{item.label}</div>
                </td>
                <td class="num">{item.accepted}</td>
                <td class="num">{item.overridden}</td>
                <td class="num">{item.pending}</td>
                <td>
                  <RateBar rate={item.rate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="muted">
        Diagnosis role suggestions: {data.diagnosisAcceptance.accepted} accepted ·{" "}
        {data.diagnosisAcceptance.overridden} overridden (
        {formatRate(data.diagnosisAcceptance.rate)})
      </p>
    </>
  );
}

function LowConfidenceSection({ data }: { data: AnalyticsData }) {
  if (data.lowConfidenceAccepted.length === 0) {
    return (
      <>
        <h2>Low-confidence accepts</h2>
        <p class="muted">No low-confidence AI answers were accepted.</p>
      </>
    );
  }
  return (
    <>
      <h2>Low-confidence accepts</h2>
      <p class="muted">AI answers accepted as filed despite model confidence below 50%.</p>
      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>Item</th>
            <th>Accepted value</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {data.lowConfidenceAccepted.map((accept) => (
            <tr>
              <td>{accept.patientName ?? "Unknown patient"}</td>
              <td>{accept.itemCode}</td>
              <td>
                {getOasisResponseLabel(accept.itemCode, accept.suggestedValue ?? undefined) ??
                  accept.suggestedValue ??
                  "—"}
              </td>
              <td class="num">{Math.round(accept.confidence * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CmiSection({ data }: { data: AnalyticsData }) {
  const { buckets, filedCount, meanCaseMixWeight } = data.cmiDistribution;
  if (filedCount === 0) {
    return (
      <>
        <h2>Case-mix distribution</h2>
        <p class="muted">No filed assessments yet.</p>
      </>
    );
  }
  const largestBucketCount = Math.max(...buckets.map((bucket) => bucket.count));
  return (
    <>
      <h2>Case-mix distribution</h2>
      <p class="muted">
        {filedCount} filed visit{filedCount === 1 ? "" : "s"} · mean case-mix weight{" "}
        {meanCaseMixWeight === null ? "—" : meanCaseMixWeight.toFixed(3)}
      </p>
      <table>
        <thead>
          <tr>
            <th>Case-mix weight</th>
            <th>Visits</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr>
              <td>{bucket.label}</td>
              <td class="num">{bucket.count}</td>
              <td>
                <Bar fraction={bucket.count / largestBucketCount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PerNurseSection({ data }: { data: AnalyticsData }) {
  if (data.perNurse.length === 0) {
    return (
      <>
        <h2>Per-nurse summary</h2>
        <p class="muted">No filed decisions yet.</p>
      </>
    );
  }
  return (
    <>
      <h2>Per-nurse summary</h2>
      <table>
        <thead>
          <tr>
            <th>Nurse</th>
            <th>Filed visits</th>
            <th>Accepted</th>
            <th>Overridden</th>
            <th>Acceptance rate</th>
          </tr>
        </thead>
        <tbody>
          {data.perNurse.map((nurse) => (
            <tr>
              <td>
                {nurse.name}
                {nurse.role === null ? null : <div class="muted">{nurse.role}</div>}
              </td>
              <td class="num">{nurse.filedVisits}</td>
              <td class="num">{nurse.accepted}</td>
              <td class="num">{nurse.overridden}</td>
              <td>
                <RateBar rate={nurse.rate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AnalyticsPage({ data }: { data: AnalyticsData }) {
  return (
    <Layout title="AI provenance analytics">
      <h1>AI provenance analytics</h1>
      <AcceptanceSection data={data} />
      <LowConfidenceSection data={data} />
      <CmiSection data={data} />
      <PerNurseSection data={data} />
    </Layout>
  );
}

export function renderAnalyticsHtml(data: AnalyticsData): string {
  return String(<AnalyticsPage data={data} />);
}

export const reviewer = new Hono();

reviewer.get("/", (c) => c.redirect("/reviewer/analytics"));

reviewer.get("/analytics", async (c) => c.html(renderAnalyticsHtml(await gatherAnalytics(db))));
