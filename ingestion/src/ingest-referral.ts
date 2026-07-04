import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { diagnoses, patients, rawReferrals, visits, type Db } from "@ohmyscribe/db";
import { normalizedReferralSchema, type NormalizedReferral } from "@ohmyscribe/shared";
import { parseReferral } from "./parse.ts";

export type IngestionResult =
  | { status: "ingested"; referralId: string; patientId: string; visitId: string }
  | { status: "duplicate"; referralId: string }
  | { status: "rejected"; referralId: string; errorReason: string };

type ParseResult = { ok: true; referral: NormalizedReferral } | { ok: false; reason: string };

// Trigger-agnostic core (runner now; file watcher and HTTP endpoint later). It
// treats input as untrusted: a malformed referral lands as 'rejected', not a throw.
export async function ingestReferral(
  bundle: unknown,
  db: Db,
  source = "synthea",
): Promise<IngestionResult> {
  const contentHash = createHash("sha256").update(stableString(bundle)).digest("hex");
  const parsed = parseAndValidate(bundle);

  return db.transaction(async (tx) => {
    // content_hash is unique: the same referral re-dropped is a no-op. Every
    // referral (good or bad) lands exactly one audit row here.
    const [row] = await tx
      .insert(rawReferrals)
      .values({
        contentHash,
        rawPayload: bundle ?? {},
        status: parsed.ok ? "ingested" : "rejected",
        errorReason: parsed.ok ? null : parsed.reason,
      })
      .onConflictDoNothing({ target: rawReferrals.contentHash })
      .returning({ id: rawReferrals.id });

    if (!row) {
      const seen = await tx
        .select({ id: rawReferrals.id })
        .from(rawReferrals)
        .where(eq(rawReferrals.contentHash, contentHash));
      return { status: "duplicate", referralId: assertRow(seen[0], "referral").id };
    }

    if (!parsed.ok) {
      return { status: "rejected", referralId: row.id, errorReason: parsed.reason };
    }

    // A new referral for an already-known patient reuses the patient row but
    // still gets its own visit.
    const { referral } = parsed;
    const [inserted] = await tx
      .insert(patients)
      .values({
        externalId: referral.externalId,
        name: `${referral.firstName} ${referral.lastName}`,
        dob: referral.dob,
        address: referral.address,
        referringPhysician: referral.referringPhysician ?? null,
        source,
      })
      .onConflictDoNothing({ target: patients.externalId })
      .returning({ id: patients.id });

    let patientId: string;
    if (inserted) {
      patientId = inserted.id;
    } else {
      const existing = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.externalId, referral.externalId));
      patientId = assertRow(existing[0], "patient").id;
    }

    const [visit] = await tx
      .insert(visits)
      .values({ patientId, type: "SOC", status: "open" })
      .returning({ id: visits.id });
    const visitId = assertRow(visit, "visit").id;

    if (referral.diagnoses.length > 0) {
      await tx
        .insert(diagnoses)
        .values(
          referral.diagnoses.map((diagnosis) => ({
            visitId,
            system: diagnosis.system,
            code: diagnosis.code,
            display: diagnosis.display ?? null,
            onset: toDate(diagnosis.onset),
          })),
        )
        // parser already dedups; this keeps the unique constraint from aborting
        // the whole transaction if the two ever drift apart.
        .onConflictDoNothing({
          target: [diagnoses.visitId, diagnoses.system, diagnoses.code],
        });
    }

    await tx.update(rawReferrals).set({ patientId }).where(eq(rawReferrals.id, row.id));

    return { status: "ingested", referralId: row.id, patientId, visitId };
  });
}

// Parse + validate, no DB access. A validation failure or a parse throw yields a reason.
function parseAndValidate(bundle: unknown): ParseResult {
  try {
    const result = normalizedReferralSchema.safeParse(parseReferral(bundle));
    if (result.success) return { ok: true, referral: result.data };
    const reason = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, reason };
  } catch (err) {
    return { ok: false, reason: `parse error: ${errorMessage(err)}` };
  }
}

function assertRow<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`ingestReferral: expected ${what} row not found`);
  return row;
}

// JSON.stringify throws on cycles/BigInt; the sentinel avoids crashing the hash.
function stableString(bundle: unknown): string {
  try {
    return JSON.stringify(bundle ?? null);
  } catch {
    return "unserializable";
  }
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

// onsetDateTime is untrusted; an unparseable value stores null rather than throwing.
const toDate = (value?: string): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
