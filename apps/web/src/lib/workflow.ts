export function firstIncompleteGate<T extends { done: boolean }>(gates: T[], index: number): T | undefined {
  return gates.slice(0, index).find((gate) => !gate.done);
}

export function belongsToProject(episode: { projectId: string } | undefined, projectId: string): boolean {
  return episode?.projectId === projectId;
}
