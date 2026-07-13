import type { FunctionalLevel, PdgmResult } from "./calculator.ts";

export interface PdgmDelta {
  paymentDelta: number;
  functionalPointsDelta: number;
  functionalLevelBefore: FunctionalLevel;
  functionalLevelAfter: FunctionalLevel;
  functionalLevelChanged: boolean;
}

// How one recorded answer moved the estimate.
export function diffPdgm(before: PdgmResult, after: PdgmResult): PdgmDelta {
  return {
    paymentDelta: after.estimatedPayment - before.estimatedPayment,
    functionalPointsDelta: after.functional.points - before.functional.points,
    functionalLevelBefore: before.functional.level,
    functionalLevelAfter: after.functional.level,
    functionalLevelChanged: before.functional.level !== after.functional.level,
  };
}
