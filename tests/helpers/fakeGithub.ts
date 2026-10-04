// @ts-nocheck — test double for the GitHub endpoints the publish proxy talks to
export const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);

// ── fake GitHub ───────────────────────────────────────────────────────────────
type Issue = { number: number; title: string; body: string; labels: string[]; state: string; created_at: string; html_url: string };
export function fakeGithub(users: Record<string, any>) {
  const st = { issues: [] as Issue[], comments: {} as Record<number, string[]>, labels: new Set<string>(), tokenRevoked: false, failComments: false, now: NOW };
  const json = (status: number, body: any) => new Response(JSON.stringify(body), { status });
  const fetch = async (url: string, init: any = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (u.href.startsWith('https://github.com/login/oauth/access_token')) {
      return body.code in users ? json(200, { access_token: `tok-${body.code}` }) : json(200, { error: 'bad_verification_code' });
    }
    if (u.pathname === '/user') return json(200, users[init.headers.Authorization.replace('Bearer tok-', '')]);
    if (u.pathname === '/applications/cid/token' && method === 'DELETE') { st.tokenRevoked = true; return json(204, {}); }
    const base = '/repos/k1ln/synflow';
    if (u.pathname === `${base}/labels` && method === 'POST') {
      if (st.labels.has(body.name)) return json(422, { message: 'already_exists' });
      st.labels.add(body.name); return json(201, {});
    }
    if (u.pathname === `${base}/issues` && method === 'GET') {
      const want = (u.searchParams.get('labels') || '').split(',').filter(Boolean);
      const state = u.searchParams.get('state');
      return json(200, st.issues.filter((i) => want.every((l) => i.labels.includes(l)) && (state === 'all' || i.state === state)));
    }
    if (u.pathname === `${base}/issues` && method === 'POST') {
      const n = st.issues.length + 1;
      const issue = { number: n, title: body.title, body: body.body, labels: body.labels, state: 'open', created_at: new Date(st.now).toISOString(), html_url: `https://github.com/k1ln/synflow/issues/${n}` };
      st.issues.push(issue); return json(201, issue);
    }
    const c = new RegExp(`^${base}/issues/(\\d+)/comments$`).exec(u.pathname);
    if (c && method === 'POST') {
      if (st.failComments) return json(500, { message: 'boom' });
      (st.comments[+c[1]] ||= []).push(body.body); return json(201, {});
    }
    const p = new RegExp(`^${base}/issues/(\\d+)$`).exec(u.pathname);
    if (p && method === 'PATCH') { st.issues[+p[1] - 1].state = body.state; return json(200, {}); }
    return json(404, { message: `unhandled ${method} ${u.pathname}` });
  };
  return { st, fetch };
}

export const USERS = {
  alice: { id: 1001, login: 'alice', type: 'User', created_at: '2020-01-01T00:00:00Z' },
  newbie: { id: 2002, login: 'newbie', type: 'User', created_at: new Date(NOW - 2 * 86400000).toISOString() },
  bot: { id: 3003, login: 'some-org', type: 'Organization', created_at: '2020-01-01T00:00:00Z' },
};

