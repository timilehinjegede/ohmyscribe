import { expect, test } from "bun:test";
import { parseReferral } from "./parse.ts";

function condition(status: string, code: string, display: string) {
  return {
    resource: {
      resourceType: "Condition",
      clinicalStatus: { coding: [{ code: status }] },
      code: { coding: [{ system: "http://snomed.info/sct", code, display }] },
    },
  };
}

const bundle = {
  resourceType: "Bundle",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "p1",
        name: [{ use: "official", family: "Doe", given: ["Jane", "A"] }],
        birthDate: "1950-01-02",
        address: [{ line: ["1 Main St"], city: "Boston", state: "MA", postalCode: "02101" }],
      },
    },
    condition("active", "111", "Anemia (disorder)"),
    condition("active", "222", "Full-time employment (finding)"), // finding -> dropped
    condition("resolved", "333", "Old problem (disorder)"), // inactive -> dropped
    condition("active", "111", "Anemia (disorder)"), // duplicate -> deduped
  ],
};

test("parseReferral extracts patient demographics", () => {
  const r = parseReferral(bundle);
  expect(r.externalId).toBe("p1");
  expect(r.firstName).toBe("Jane");
  expect(r.lastName).toBe("Doe");
  expect(r.dob).toBe("1950-01-02");
  expect(r.address).toBe("1 Main St, Boston, MA, 02101");
});

test("diagnoses: active disorders only, findings + inactive dropped, deduped", () => {
  const r = parseReferral(bundle);
  expect(r.diagnoses).toEqual([
    { system: "http://snomed.info/sct", code: "111", display: "Anemia (disorder)" },
  ]);
});

test("never throws on malformed input, degrades to empty", () => {
  expect(() => parseReferral(null)).not.toThrow();
  expect(() => parseReferral({ entry: "not-an-array" })).not.toThrow();
  expect(parseReferral(null).diagnoses).toEqual([]);
  expect(parseReferral(undefined).externalId).toBeUndefined();
});
