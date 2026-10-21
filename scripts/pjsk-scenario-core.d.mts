export function decodeScenario(
  source: unknown,
  expectedId: string,
  options?: { sourceScenarioId?: string },
): {
  source: unknown;
  issues: unknown[];
  timeline: unknown[];
};
