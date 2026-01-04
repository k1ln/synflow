import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import type { Server } from 'http';

let server: Server; let base = '';

beforeAll(async () => {
  // Start backend app on ephemeral port
  const { app } = await import('../../backend/src/app.js');
  server = app.listen(0);
  const address = server.address();
  if (address && typeof address === 'object') {
    base = `http://127.0.0.1:${address.port}/api`;
  } else {
    throw new Error('Failed to get server address');
  }
  // Set base before dynamic import of apiClient so it picks it up
  (globalThis as any).FLOWSYNTH_API_BASE = base;
});

afterAll(()=> { server.close(); });

describe('Frontend apiClient integration', () => {
  it('registers, creates flow, lists flows, deletes flow', async () => {
  const api = await import('../../src/services/apiClient.js');
    let user;
    try {
      user = await api.register('fronttest@test.com','Passw0rd!');
    } catch(e:any){
      if(/API 409/.test(String(e.message))){
        user = await api.login('fronttest@test.com','Passw0rd!');
      } else { throw e; }
    }
    expect(user.email).toBe('fronttest@test.com');
    const saveRes = await api.saveFlow({ name: 'My Flow', data: { nodes: [], edges: [] }, is_public: false });
    expect(saveRes.id).toBeTruthy();
    const mine = await api.listMyFlows();
    expect(Array.isArray(mine)).toBe(true);
    expect(mine.some((f:any)=> f.id === saveRes.id)).toBe(true);
    await api.deleteFlow(saveRes.id);
    const mineAfter = await api.listMyFlows();
    expect(mineAfter.some((f:any)=> f.id === saveRes.id)).toBe(false);
  });

  it('creates component, lists and deletes it', async () => {
  const api = await import('../../src/services/apiClient.js');
    // login (user already registered in previous test or register again if needed)
    try { await api.login('fronttest@test.com','Passw0rd!'); } catch { await api.register('fronttest@test.com','Passw0rd!'); }
    const comp = await api.saveComponent({ name: 'CompX', code: 'export const X=1;' });
    expect(comp.id).toBeTruthy();
    const mine = await api.listMyComponents();
    expect(mine.some((c:any)=> c.id === comp.id)).toBe(true);
    await api.deleteComponent(comp.id);
    const mineAfter = await api.listMyComponents();
    expect(mineAfter.some((c:any)=> c.id === comp.id)).toBe(false);
  });
});