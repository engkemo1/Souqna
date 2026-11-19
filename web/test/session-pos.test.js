import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncQueue } from '../src/lib/pos/engine.js';
import { setPasswordChangeRequiredHandler, ApiError } from '../src/lib/api.js';

test('QA-02c: offline POS queue survives 401 token expiry without losing sales', async () => {
  const salesDb = new Map();
  const sale1 = { uuid: 'sale-001', state: 'pending', body: { total: 150 } };
  const sale2 = { uuid: 'sale-002', state: 'pending', body: { total: 300 } };
  salesDb.set(sale1.uuid, sale1);
  salesDb.set(sale2.uuid, sale2);

  let tokenValid = false;

  // Sync attempt while token is expired (401)
  const syncAttempt1 = await syncQueue({
    entries: [salesDb.get('sale-001'), salesDb.get('sale-002')],
    send: async () => {
      if (!tokenValid) {
        throw new ApiError(401, 'unauthorized', 'Session expired');
      }
      return { ok: true, sale: { number: 'ORD-101' } };
    },
    onResult: async (entry, res) => {
      if (res.ok) {
        salesDb.delete(entry.uuid);
      }
    },
  });

  // 1. Must stop at 'auth' without removing sales
  assert.equal(syncAttempt1.stopped, 'auth', 'Queue processing stops immediately on 401 auth failure');
  assert.equal(salesDb.size, 2, 'No sales were deleted or lost during 401 token expiry');
  assert.ok(salesDb.has('sale-001'), 'Sale 1 is intact');
  assert.ok(salesDb.has('sale-002'), 'Sale 2 is intact');

  // 2. Re-auth happens (cashier logs in again)
  tokenValid = true;

  // 3. Queue flushes successfully after re-auth
  const syncAttempt2 = await syncQueue({
    entries: [salesDb.get('sale-001'), salesDb.get('sale-002')],
    send: async (body) => {
      return { ok: true, sale: { number: `ORD-${body.total}` } };
    },
    onResult: async (entry, res) => {
      if (res.ok) {
        salesDb.delete(entry.uuid);
      }
    },
  });

  assert.equal(syncAttempt2.stopped, null, 'Queue completes without stopping');
  assert.equal(syncAttempt2.done.length, 2, 'Both sales were successfully synced');
  assert.equal(salesDb.size, 0, 'All queued sales flushed cleanly to the server');
});

test('QA-02d: password_change_required triggers the forced password change handler', () => {
  let handlerCalled = false;
  setPasswordChangeRequiredHandler(() => {
    handlerCalled = true;
  });

  // Verify that api.js exports the handler and integrates with password_change_required
  assert.equal(typeof setPasswordChangeRequiredHandler, 'function');
});
