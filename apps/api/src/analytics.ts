import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import {
  answerSuggestions,
  assessments,
  auditLogs,
  patients,
  users,
  visits,
  type Db,
} from "@ohmyscribe/db";
import { OASIS_ITEMS } from "@ohmyscribe/shared";

export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const CMI_BUCKET_EDGES = [0.8, 1.0, 1.2, 1.4];

// accepted / (accepted + overridden); null when nothing was decided yet.
export function acceptanceRate(accepted: number, overridden: number): number | null {
  const decided = accepted + overridden;
  return decided === 0 ? null : accepted / decided;
}

export type CmiBucket = { label: string; count: number };

// Half-open buckets from the edges: (-inf, e0), [e0, e1), ..., [eLast, +inf).
export function bucketCaseMixWeights(caseMixWeights: number[], bucketEdges: number[]): CmiBucket[] {
  if (bucketEdges.length === 0) return [{ label: "all", count: caseMixWeights.length }];
  const labels = [
    `< ${bucketEdges[0]}`,
    ...bucketEdges.slice(0, -1).map((edge, index) => `${edge}-${bucketEdges[index + 1]}`),
    `≥ ${bucketEdges[bucketEdges.length - 1]}`,
  ];
  const counts = labels.map(() => 0);
  for (const weight of caseMixWeights) {
    const edgeIndex = bucketEdges.findIndex((edge) => weight < edge);
    counts[edgeIndex === -1 ? bucketEdges.length : edgeIndex]!++;
  }
  return labels.map((label, index) => ({ label, count: counts[index]! }));
}

// The latest audit event per (assessment, item) is that item's provenance status; older rows
// are history. Assessment-level events (itemCode null, e.g. a reviewer approval) are excluded.
const latestEventsCte = (db: Db) =>
  db.$with("latest_events").as(
    db
      .selectDistinctOn([auditLogs.assessmentId, auditLogs.itemCode], {
        assessmentId: auditLogs.assessmentId,
        itemCode: auditLogs.itemCode,
        event: auditLogs.event,
        actorId: auditLogs.actorId,
      })
      .from(auditLogs)
      .where(isNotNull(auditLogs.itemCode))
      .orderBy(auditLogs.assessmentId, auditLogs.itemCode, desc(auditLogs.serverSeq)),
  );

const OASIS_ITEM_CODES = OASIS_ITEMS.map((item) => item.code);

export type ItemAcceptance = {
  itemCode: string;
  label: string;
  accepted: number;
  overridden: number;
  pending: number;
  rate: number | null;
};

export async function acceptanceByItem(db: Db): Promise<ItemAcceptance[]> {
  const latestEvents = latestEventsCte(db);
  const rows = await db
    .with(latestEvents)
    .select({
      itemCode: latestEvents.itemCode,
      accepted: sql<number>`count(*) filter (where ${latestEvents.event} = 'accepted')`.mapWith(
        Number,
      ),
      overridden: sql<number>`count(*) filter (where ${latestEvents.event} = 'overridden')`.mapWith(
        Number,
      ),
      pending: sql<number>`count(*) filter (where ${latestEvents.event} = 'suggested')`.mapWith(
        Number,
      ),
    })
    .from(latestEvents)
    .where(inArray(latestEvents.itemCode, OASIS_ITEM_CODES))
    .groupBy(latestEvents.itemCode);

  const rowsByItemCode = new Map(rows.map((row) => [row.itemCode, row]));
  return OASIS_ITEMS.flatMap((item) => {
    const row = rowsByItemCode.get(item.code);
    if (!row) return [];
    return [
      {
        itemCode: item.code,
        label: item.label,
        accepted: row.accepted,
        overridden: row.overridden,
        pending: row.pending,
        rate: acceptanceRate(row.accepted, row.overridden),
      },
    ];
  });
}

export type DiagnosisAcceptance = { accepted: number; overridden: number; rate: number | null };

// Diagnosis provenance rows carry the diagnosis id as itemCode, i.e. everything non-OASIS.
export async function diagnosisCodingAcceptance(db: Db): Promise<DiagnosisAcceptance> {
  const latestEvents = latestEventsCte(db);
  const [row] = await db
    .with(latestEvents)
    .select({
      accepted: sql<number>`count(*) filter (where ${latestEvents.event} = 'accepted')`.mapWith(
        Number,
      ),
      overridden: sql<number>`count(*) filter (where ${latestEvents.event} = 'overridden')`.mapWith(
        Number,
      ),
    })
    .from(latestEvents)
    .where(notInArray(latestEvents.itemCode, OASIS_ITEM_CODES));
  const accepted = row?.accepted ?? 0;
  const overridden = row?.overridden ?? 0;
  return { accepted, overridden, rate: acceptanceRate(accepted, overridden) };
}

export type LowConfidenceAccept = {
  assessmentId: string;
  itemCode: string;
  suggestedValue: string | null;
  confidence: number;
  patientName: string | null;
};

export async function lowConfidenceAccepted(db: Db): Promise<LowConfidenceAccept[]> {
  const latestEvents = latestEventsCte(db);
  return db
    .with(latestEvents)
    .select({
      assessmentId: latestEvents.assessmentId,
      itemCode: answerSuggestions.itemCode,
      suggestedValue: answerSuggestions.suggestedValue,
      confidence: sql<number>`${answerSuggestions.confidence}`.mapWith(Number),
      patientName: patients.name,
    })
    .from(latestEvents)
    .innerJoin(
      answerSuggestions,
      and(
        eq(answerSuggestions.assessmentId, latestEvents.assessmentId),
        eq(answerSuggestions.itemCode, latestEvents.itemCode),
        isNull(answerSuggestions.deletedAt),
      ),
    )
    .innerJoin(
      assessments,
      and(eq(assessments.id, latestEvents.assessmentId), isNull(assessments.deletedAt)),
    )
    .innerJoin(visits, eq(visits.id, assessments.visitId))
    .leftJoin(patients, and(eq(patients.id, visits.patientId), isNull(patients.deletedAt)))
    .where(
      and(
        eq(latestEvents.event, "accepted"),
        isNotNull(answerSuggestions.confidence),
        lt(answerSuggestions.confidence, LOW_CONFIDENCE_THRESHOLD),
      ),
    )
    .orderBy(asc(answerSuggestions.confidence));
}

export type CmiDistribution = {
  buckets: CmiBucket[];
  filedCount: number;
  meanCaseMixWeight: number | null;
};

export async function cmiDistribution(db: Db): Promise<CmiDistribution> {
  const rows = await db
    .select({
      caseMixWeight: sql<number>`(${assessments.pdgmSnapshot} ->> 'caseMixWeight')::float8`.mapWith(
        Number,
      ),
    })
    .from(assessments)
    .where(
      and(
        isNotNull(assessments.completedAt),
        isNull(assessments.deletedAt),
        sql`${assessments.pdgmSnapshot} ->> 'caseMixWeight' is not null`,
      ),
    );
  const caseMixWeights = rows.map((row) => row.caseMixWeight);
  const total = caseMixWeights.reduce((sum, weight) => sum + weight, 0);
  return {
    buckets: bucketCaseMixWeights(caseMixWeights, CMI_BUCKET_EDGES),
    filedCount: caseMixWeights.length,
    meanCaseMixWeight: caseMixWeights.length === 0 ? null : total / caseMixWeights.length,
  };
}

export type NurseSummary = {
  userId: string | null;
  name: string;
  role: string | null;
  accepted: number;
  overridden: number;
  rate: number | null;
  filedVisits: number;
};

export async function perNurseSummary(db: Db): Promise<NurseSummary[]> {
  const latestEvents = latestEventsCte(db);
  const decisionRows = await db
    .with(latestEvents)
    .select({
      actorId: latestEvents.actorId,
      accepted: sql<number>`count(*) filter (where ${latestEvents.event} = 'accepted')`.mapWith(
        Number,
      ),
      overridden: sql<number>`count(*) filter (where ${latestEvents.event} = 'overridden')`.mapWith(
        Number,
      ),
    })
    .from(latestEvents)
    .where(inArray(latestEvents.event, ["accepted", "overridden"]))
    .groupBy(latestEvents.actorId);

  const filedRows = await db
    .select({
      assignedUserId: visits.assignedUserId,
      filedVisits: sql<number>`count(*)`.mapWith(Number),
    })
    .from(assessments)
    .innerJoin(visits, eq(visits.id, assessments.visitId))
    .where(and(isNotNull(assessments.completedAt), isNull(assessments.deletedAt)))
    .groupBy(visits.assignedUserId);

  const userRows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(isNull(users.deletedAt));
  const usersById = new Map(userRows.map((user) => [user.id, user]));

  const summariesByActorId = new Map<string | null, NurseSummary>();
  const summaryFor = (actorId: string | null): NurseSummary => {
    const existing = summariesByActorId.get(actorId);
    if (existing) return existing;
    const user = actorId === null ? undefined : usersById.get(actorId);
    const created: NurseSummary = {
      userId: actorId,
      name: user?.name ?? (actorId === null ? "Unassigned" : "Unknown user"),
      role: user?.role ?? null,
      accepted: 0,
      overridden: 0,
      rate: null,
      filedVisits: 0,
    };
    summariesByActorId.set(actorId, created);
    return created;
  };
  for (const row of decisionRows) {
    const summary = summaryFor(row.actorId);
    summary.accepted = row.accepted;
    summary.overridden = row.overridden;
    summary.rate = acceptanceRate(row.accepted, row.overridden);
  }
  for (const row of filedRows) {
    summaryFor(row.assignedUserId).filedVisits = row.filedVisits;
  }
  return [...summariesByActorId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type AnalyticsData = {
  acceptanceByItem: ItemAcceptance[];
  diagnosisAcceptance: DiagnosisAcceptance;
  lowConfidenceAccepted: LowConfidenceAccept[];
  cmiDistribution: CmiDistribution;
  perNurse: NurseSummary[];
};

export async function gatherAnalytics(db: Db): Promise<AnalyticsData> {
  const [itemAcceptance, diagnosisAcceptance, lowConfidenceAccepts, caseMixDistribution, perNurse] =
    await Promise.all([
      acceptanceByItem(db),
      diagnosisCodingAcceptance(db),
      lowConfidenceAccepted(db),
      cmiDistribution(db),
      perNurseSummary(db),
    ]);
  return {
    acceptanceByItem: itemAcceptance,
    diagnosisAcceptance,
    lowConfidenceAccepted: lowConfidenceAccepts,
    cmiDistribution: caseMixDistribution,
    perNurse,
  };
}
