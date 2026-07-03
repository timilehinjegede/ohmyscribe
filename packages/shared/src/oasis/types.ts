// Order here drives the assessment wizard's step order (functional → cognitive → mood).
export const oasisSections = ["functional", "cognitive", "mood"] as const;
export type OasisSection = (typeof oasisSections)[number];

export type OasisResponse = { value: string; label: string };
export type OasisItem = {
  code: string;
  label: string;
  section: OasisSection;
  responses: readonly OasisResponse[];
};
