/** @jsxImportSource hono/jsx */
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_REVIEWER_ID } from "@ohmyscribe/db";
import {
  answerDisagrees,
  diagnosisDisagrees,
  getOasisItem,
  getOasisResponseLabel,
  type CodedDiagnosis,
  type PdgmResult,
} from "@ohmyscribe/shared";
import { db } from "../db.ts";
import { Layout } from "./layout.tsx";
import {
  approveAssessment,
  findReviewer,
  getReviewDetail,
  listReviewQueue,
  returnAssessment,
  type ReturnFlag,
  type ReviewDetail,
  type ReviewQueueItem,
} from "../review.ts";

const formatDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "—");

function MessagePage({ title, message }: { title: string; message: string }) {
  return (
    <Layout title={title}>
      <h1>{title}</h1>
      <p>{message}</p>
      <p>
        <a href="/review">Back to the queue</a>
      </p>
    </Layout>
  );
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  returned: "Returned",
  approved: "Approved",
};

function StatusPill({ reviewStatus }: { reviewStatus: string | null }) {
  return (
    <span class={`status ${reviewStatus ?? ""}`}>
      {STATUS_LABELS[reviewStatus ?? ""] ?? "Draft"}
    </span>
  );
}

function QueuePage({ queue }: { queue: ReviewQueueItem[] }) {
  return (
    <Layout title="Review queue">
      <h1>Review queue</h1>
      {queue.length === 0 ? (
        <p class="muted">No assessments awaiting review.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Nurse</th>
              <th>Visit date</th>
              <th>Case-mix weight</th>
              <th>Disagreements</th>
              <th>Open flags</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <tr>
                <td>{item.patientName ?? "Unknown patient"}</td>
                <td>{item.nurseName ?? "Unassigned"}</td>
                <td>{formatDate(item.visitDate)}</td>
                <td>{item.caseMixWeight ?? "—"}</td>
                <td>{item.disagreements}</td>
                <td>{item.unresolvedFlagCount}</td>
                <td>
                  <StatusPill reviewStatus={item.reviewStatus} />
                </td>
                <td>
                  <a href={`/review/${item.assessmentId}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}

function DiagnosisRow({ diagnosis }: { diagnosis: CodedDiagnosis }) {
  return (
    <tr class={diagnosisDisagrees(diagnosis) ? "disagrees" : ""}>
      <td>
        {diagnosis.display ?? diagnosis.code}
        <div class="muted">
          {diagnosis.code}
          {diagnosis.onset ? ` · onset ${diagnosis.onset.slice(0, 10)}` : ""}
        </div>
      </td>
      <td>{diagnosis.suggestedCode?.icd10 ?? "—"}</td>
      <td>
        {diagnosis.suggestion ? (
          <>
            {diagnosis.suggestion.isPrimary ? "Primary" : "Secondary"}
            {diagnosis.suggestion.confidence !== null
              ? ` (${Math.round(diagnosis.suggestion.confidence * 100)}%)`
              : ""}
            {diagnosis.suggestion.rationale ? (
              <div class="muted">{diagnosis.suggestion.rationale}</div>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </td>
      <td>
        {diagnosis.coding
          ? `${diagnosis.coding.icd10Code} · ${diagnosis.coding.isPrimary ? "Primary" : "Secondary"}`
          : "Not coded"}
      </td>
    </tr>
  );
}

function PdgmBlock({ snapshot }: { snapshot: PdgmResult | null }) {
  if (!snapshot) return <p class="muted">No frozen PDGM snapshot.</p>;
  return (
    <table>
      <tbody>
        <tr>
          <th>Clinical group</th>
          <td>
            {snapshot.clinicalGroupLabel}
            {snapshot.clinicalGroupDriver ? (
              <span class="muted"> · driven by {snapshot.clinicalGroupDriver}</span>
            ) : null}
          </td>
        </tr>
        <tr>
          <th>Functional level</th>
          <td>
            {snapshot.functional.level} ({snapshot.functional.points} points)
          </td>
        </tr>
        <tr>
          <th>Comorbidity</th>
          <td>{snapshot.comorbidity.level}</td>
        </tr>
        <tr>
          <th>Timing / admission</th>
          <td>
            {snapshot.timing} / {snapshot.admissionSource}
          </td>
        </tr>
        <tr>
          <th>Case-mix weight</th>
          <td>{snapshot.caseMixWeight}</td>
        </tr>
        <tr>
          <th>Estimated payment</th>
          <td>${snapshot.estimatedPayment}</td>
        </tr>
      </tbody>
    </table>
  );
}

function DetailPage({ detail }: { detail: ReviewDetail }) {
  const patientName = detail.visit.patient?.name ?? "Unknown patient";
  const filed = detail.completedAt !== null;

  return (
    <Layout title={`Review · ${patientName}`}>
      <h1>
        {patientName} <StatusPill reviewStatus={detail.reviewStatus} />
      </h1>
      <p class="muted">
        {detail.visit.type} visit · nurse {detail.nurseName ?? "unassigned"} · filed{" "}
        {formatDate(detail.completedAt)}
      </p>

      <h2>Diagnosis coding</h2>
      <table>
        <thead>
          <tr>
            <th>Referral diagnosis</th>
            <th>Crosswalk code</th>
            <th>AI role suggestion</th>
            <th>Nurse coding</th>
          </tr>
        </thead>
        <tbody>
          {detail.coded.map((diagnosis) => (
            <DiagnosisRow diagnosis={diagnosis} />
          ))}
        </tbody>
      </table>

      {detail.flags.length > 0 ? (
        <>
          <h2>Quality flags</h2>
          <ul class="flags">
            {detail.flags.map((flag) => (
              <li>
                {flag.itemCode ? `${flag.itemCode}: ` : ""}
                {flag.message}{" "}
                <span class="muted">
                  ({flag.ruleId}
                  {flag.resolved ? " · resolved" : ""})
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Frozen PDGM</h2>
      <PdgmBlock snapshot={detail.pdgmSnapshot} />

      <h2>OASIS answers</h2>
      {filed ? (
        <form method="post" action={`/review/${detail.assessmentId}/return`}>
          <AnswersTable detail={detail} flaggable={true} />
          <div class="action">
            <label>
              Note to the nurse
<textarea name="message" rows={3}></textarea>
            </label>
            <div class="buttons">
              <button type="submit" class="return">
                Return to nurse
              </button>
              <button
                type="submit"
                class="approve"
                formaction={`/review/${detail.assessmentId}/approve`}
              >
                Approve
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <AnswersTable detail={detail} flaggable={false} />
          <p class="muted">Returned to the nurse — actions unlock when the assessment is refiled.</p>
        </>
      )}
    </Layout>
  );
}

// One table for both review states: flaggable adds the checkbox column for the Return form,
// read-only keeps the same evidence (confidence, snippets, disagreement highlights).
function AnswersTable({ detail, flaggable }: { detail: ReviewDetail; flaggable: boolean }) {
  const answerValuesByItemCode = new Map(
    detail.answers.map((answer) => [answer.itemCode, answer.value]),
  );
  const suggestionsByItemCode = new Map(
    detail.suggestions.map((suggestion) => [suggestion.itemCode, suggestion]),
  );
  const itemCodes = [
    ...new Set([...suggestionsByItemCode.keys(), ...answerValuesByItemCode.keys()]),
  ].sort();

  return (
    <table>
      <thead>
        <tr>
          {flaggable ? <th>Flag</th> : null}
          <th>Item</th>
          <th>AI draft</th>
          <th>Nurse answer</th>
        </tr>
      </thead>
      <tbody>
        {itemCodes.map((itemCode) => {
          const suggestion = suggestionsByItemCode.get(itemCode) ?? null;
          const nurseValue = answerValuesByItemCode.get(itemCode);
          const disagrees = suggestion !== null && answerDisagrees(nurseValue, suggestion.value);
          return (
            <tr class={disagrees ? "disagrees" : ""}>
              {flaggable ? (
                <td>
                  <input type="checkbox" name="flagItem" value={itemCode} checked={disagrees} />
                </td>
              ) : null}
              <td>
                {itemCode}
                <div class="muted">{getOasisItem(itemCode)?.label ?? ""}</div>
              </td>
              <td>
                {suggestion ? (
                  <>
                    {getOasisResponseLabel(itemCode, suggestion.value) ?? suggestion.value}
                    {suggestion.confidence !== null
                      ? ` (${Math.round(suggestion.confidence * 100)}%)`
                      : ""}
                    {suggestion.transcriptSnippet ? (
                      <div class="snippet">“{suggestion.transcriptSnippet}”</div>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {nurseValue !== undefined
                  ? (getOasisResponseLabel(itemCode, nurseValue) ?? nurseValue)
                  : "Not answered"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Identity without auth: an explicit form pick wins, then the x-user-id header,
// then the seeded reviewer. An explicit non-reviewer id is rejected, not defaulted.
async function resolveActor(
  form: Record<string, string | File | (string | File)[]>,
  headerUserId: string | undefined,
): Promise<string | null> {
  const formUserId = typeof form["userId"] === "string" && form["userId"] ? form["userId"] : null;
  const requested = formUserId ?? headerUserId ?? DEFAULT_REVIEWER_ID;
  if (!z.string().uuid().safeParse(requested).success) return null;
  return findReviewer(db, requested);
}

const formValues = (value: string | File | (string | File)[] | undefined): string[] => {
  if (value === undefined) return [];
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter((entry): entry is string => typeof entry === "string");
};

const assessmentParam = zValidator(
  "param",
  z.object({ assessmentId: z.string().uuid() }),
  (result, c) => {
    if (!result.success) {
      return c.html(<MessagePage title="Not found" message="Invalid assessment id." />, 404);
    }
  },
);

export const review = new Hono();

review.get("/", async (c) => {
  const queue = await listReviewQueue(db);
  return c.html(<QueuePage queue={queue} />);
});

review.get("/:assessmentId", assessmentParam, async (c) => {
  const { assessmentId } = c.req.valid("param");
  const detail = await getReviewDetail(db, assessmentId);
  if (!detail) {
    return c.html(
      <MessagePage title="Not found" message="No filed assessment with that id." />,
      404,
    );
  }
  return c.html(<DetailPage detail={detail} />);
});

review.post("/:assessmentId/approve", assessmentParam, async (c) => {
  const { assessmentId } = c.req.valid("param");
  const form = await c.req.parseBody();
  const actorId = await resolveActor(form, c.req.header("x-user-id"));
  if (!actorId) {
    return c.html(<MessagePage title="Forbidden" message="Only a reviewer can approve." />, 403);
  }
  const result = await approveAssessment(db, assessmentId, actorId);
  if (!result.ok) {
    return c.html(
      <MessagePage title="Not filed" message="Only a filed assessment can be approved." />,
      422,
    );
  }
  return c.redirect("/review");
});

review.post("/:assessmentId/return", assessmentParam, async (c) => {
  const { assessmentId } = c.req.valid("param");
  const form = await c.req.parseBody({ all: true });
  const actorId = await resolveActor(form, c.req.header("x-user-id"));
  if (!actorId) {
    return c.html(<MessagePage title="Forbidden" message="Only a reviewer can return." />, 403);
  }

  const message = typeof form["message"] === "string" ? form["message"].trim() : "";
  const flags: ReturnFlag[] = formValues(form["flagItem"]).map((itemCode) => ({
    itemCode,
    kind: "nurse_vs_ai",
    message: `Reviewer flagged ${itemCode} for another look.`,
  }));
  // The note is one general flag rather than a copy on every checked item.
  if (message) {
    flags.push({ itemCode: null, kind: "missing", message });
  }
  if (flags.length === 0) {
    return c.html(
      <MessagePage
        title="Nothing to return"
        message="Flag at least one item or write a note for the nurse."
      />,
      422,
    );
  }

  const result = await returnAssessment(db, assessmentId, flags);
  if (!result.ok) {
    return c.html(
      <MessagePage title="Not filed" message="Only a filed assessment can be returned." />,
      422,
    );
  }
  return c.redirect("/review");
});
