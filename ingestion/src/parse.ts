import type { Diagnosis, NormalizedReferral } from "@ohmyscribe/shared";

type FhirResource = Record<string, any>;
type FhirBundle = { entry?: Array<{ resource?: FhirResource }> };

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const FHIR = { PATIENT: "Patient", CONDITION: "Condition" } as const;

// Never throws — wrong-typed/missing fields degrade to a validation rejection.
export function parseReferral(bundle: unknown): Partial<NormalizedReferral> {
  const resources = asArray<{ resource?: FhirResource }>((bundle as FhirBundle)?.entry)
    .map((e) => e?.resource)
    .filter((r): r is FhirResource => Boolean(r));

  const patient = resources.find((r) => r.resourceType === FHIR.PATIENT);
  const conditions = resources.filter((r) => r.resourceType === FHIR.CONDITION);

  const names = asArray<any>(patient?.name);
  const name = names.find((n) => n?.use === "official") ?? names[0];
  const given = asArray<string>(name?.given);
  const address = asArray<any>(patient?.address)[0];
  const line = asArray<string>(address?.line);

  const addressText = address
    ? [line.join(" "), address.city, address.state, address.postalCode]
        .map(str)
        .filter(Boolean)
        .join(", ")
    : "";

  return {
    externalId: patient?.id,
    firstName: given[0],
    lastName: name?.family,
    dob: patient?.birthDate,
    address: addressText || undefined,
    referringPhysician: str(patient?.generalPractitioner?.[0]?.display) || undefined,
    diagnoses: extractDiagnoses(conditions),
  };
}

// Synthea mixes clinical disorders with social "findings" and repeats disorders
// across resources — hence the active-disorder filter and dedup. The
// "(disorder)" check is SNOMED-specific; general code systems are future work.
function extractDiagnoses(conditions: FhirResource[]): Diagnosis[] {
  const byCode = new Map<string, Diagnosis>();
  for (const c of conditions) {
    if (str(c.clinicalStatus?.coding?.[0]?.code) !== "active") continue;
    const coding = asArray<any>(c.code?.coding).find((cd) =>
      str(cd?.display).toLowerCase().includes("(disorder)"),
    );
    const system = str(coding?.system);
    const code = str(coding?.code);
    if (!system || !code) continue;
    const key = `${system}|${code}`;
    if (!byCode.has(key)) {
      byCode.set(key, {
        system,
        code,
        display: str(coding.display) || undefined,
      });
    }
  }
  return [...byCode.values()];
}
