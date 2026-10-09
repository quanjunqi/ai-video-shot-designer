import assert from 'node:assert/strict';
import test from 'node:test';
import { belongsToProject, firstIncompleteGate } from '../src/lib/workflow.ts';

test('optional props do not bypass an incomplete character gate', () => {
  const gates = [{ done: true }, { done: false }, { done: true }, { done: false }];
  assert.equal(firstIncompleteGate(gates, 3), gates[1]);
});
test('first stage and a complete prerequisite chain are accessible', () => {
  assert.equal(firstIncompleteGate([{ done: false }], 0), undefined);
  assert.equal(firstIncompleteGate([{ done: true }, { done: true }], 2), undefined);
});
test('episode route requires the owning project', () => {
  assert.equal(belongsToProject({ projectId: 'star' }, 'wudu'), false);
  assert.equal(belongsToProject({ projectId: 'star' }, 'star'), true);
  assert.equal(belongsToProject(undefined, 'star'), false);
});
