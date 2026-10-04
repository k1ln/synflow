# Synflow publish proxy

The editor's **Publish to GitHub** button talks to this small service. It turns a flow into a
reviewable **GitHub issue** on `k1ln/synflow`; when you add the `approved` label, a workflow puts the
flow in the public gallery.

```
editor ──(signed-in GitHub user)──▶ this proxy ──Issues API──▶ issue "Publish: My Flow"  (label publish-request)
                                                                     │  you read it, add label `approved`
                                                                     ▼
                       .github/workflows/gallery-publish.yml  ──▶  site/gallery/data/my-flow.json ──▶ GitHub Pages
```

It exists because GitHub Pages is static (nothing there can receive a submission) and because creating
an issue needs a credential that must never ship in the editor. That credential lives only here.

## How spam is prevented

A public "publish" button on a site with no accounts is an invitation, so every layer assumes the
client is hostile:

| Layer | What it does | Setting |
|---|---|---|
| **GitHub sign-in** | The identity is the numeric GitHub user id, not an IP or a client-made token. Sessions are HMAC-signed, expire after a few hours and live in `sessionStorage`. The GitHub token is revoked right after we read the profile. | `SESSION_HOURS` (6) |
| **Account age** | Throw-away accounts can't publish. | `MIN_ACCOUNT_AGE_DAYS` (7) |
| **Per-account quota** | At most N publishes per rolling 24 h. Counted from the issues themselves (label `by-<id>`), so there's no database, it survives restarts and works across instances. Signing in again doesn't reset it. | `DAILY_LIMIT` (3) |
| **Cooldown** | Minimum gap between two publishes. | `COOLDOWN_SECONDS` (120) |
| **Global circuit breaker** | Cap on submissions per day across everyone, and on unreviewed open requests. When hit, the service answers 503 for everybody instead of flooding your inbox. | `GLOBAL_DAILY_LIMIT` (40), `MAX_OPEN_REQUESTS` (60) |
| **Validation** | Size limits, graph shape, tag/name rules. The author is always the verified GitHub login — never a name the client sends. User text can't `@mention` people or cross-link issues. | see `validate.mjs` |
| **Human approval** | Nothing is published without a maintainer adding `approved`. Flows containing code (`FunctionFlowNode`, worklets, WASM, custom HTML) get a `runs-code` label and a warning in the issue. | — |
| **Least privilege** | The token needs **only `Issues: write`**. The flow data travels inside the issue (gzip + base64 comments), so a leaked token can create issues but can't touch your code. | — |
| **Kill switch** | Ban an account instantly, no redeploy of the editor. | `BLOCKED_USERS` (logins or ids) |

What it does *not* stop: someone with many aged GitHub accounts can still trickle in submissions.
The global caps bound the damage, and you review everything anyway. Tighten `DAILY_LIMIT` /
`MIN_ACCOUNT_AGE_DAYS`, or add names to `BLOCKED_USERS`, if that ever happens. One known gap: two requests
from the same account hitting *different* serverless instances at the same instant could both pass the
quota check (a same-instance lock prevents it otherwise). The overshoot is at most a request or two.

## One-time setup

### 1. GitHub OAuth App (identifies the user)
GitHub → Settings → Developer settings → **OAuth Apps** → New:
- Homepage URL: `https://synflow.org`
- **Authorization callback URL: `<PUBLIC_URL>/auth/callback`** (the URL of this proxy, see below)

Keep the **Client ID** and generate a **Client secret**. No scopes are requested.

### 2. Fine-grained token (creates the issues)
GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate:
- Repository access: **Only select repositories → `k1ln/synflow`**
- Permissions: **Issues → Read and write**. Nothing else.

(Better still: create a separate bot account/GitHub App for this so issues aren't authored by you.)

### 3. Deploy

Environment variables (secrets marked 🔒):

| Variable | |
|---|---|
| `GITHUB_TOKEN` 🔒 | the fine-grained token |
| `OAUTH_CLIENT_ID` | OAuth App client id |
| `OAUTH_CLIENT_SECRET` 🔒 | OAuth App client secret |
| `SESSION_SECRET` 🔒 | `openssl rand -base64 48` |
| `PUBLIC_URL` | this service's public base URL, no trailing slash (e.g. `https://publish.synflow.org`) |
| `ALLOWED_ORIGINS` | optional, comma list. Default: `https://synflow.org`, `https://www.synflow.org`, `http://localhost:5173`, `http://127.0.0.1:5173` |
| `GITHUB_OWNER` / `GITHUB_REPO` / `PAGES_URL` | optional, default `k1ln` / `synflow` / `https://k1ln.github.io/synflow` |
| the knobs above | optional |

**Scaleway Functions** (you already use it for VibePlugin): Node 22, handler `scaleway.handle`, upload this
folder, privacy *public*. **Cloudflare**: `wrangler secret put …` then `wrangler deploy` (see `wrangler.toml`).
**Plain Node / VPS**: `node node-server.mjs` behind your reverse proxy (needs Node ≥ 20).

The service refuses to run and names what's missing if configuration is incomplete.

### 4. Point the editor at it
Build/deploy the editor with the service's URL:

```sh
VITE_SYNFLOW_PUBLISH_URL=https://publish.synflow.org npm run build
```

Without it the Publish dialog says publishing isn't configured.

### 5. Repository settings
- **Pages**: Settings → Pages → Source: **GitHub Actions** (the site isn't live until you do this).
- **Label**: `gh label create approved --color 0e8a16 --description "Publish this flow to the gallery"`
  (the proxy creates `publish-request`, `by-<id>` and `runs-code` itself).
- If `main` is branch-protected, let `github-actions[bot]` push to it — the approval workflow commits the flow directly.

## Reviewing a submission

Open the issue: it lists the author, description, what the flow is made of and which nodes carry code.
To actually look at the flow, decode it and load it into the editor:

```sh
node scripts/review-submission.mjs 42      # needs the GitHub CLI; writes my-flow.json and prints a summary
```

Then **Import Flow** in the editor. Happy? Add **`approved`** to the issue (the script prints the one-liner).
The workflow re-validates, commits `site/gallery/data/<slug>.json`, redeploys Pages and closes the issue.
Not happy? Close the issue. Slugs never overwrite an existing gallery entry.

## Develop & test

```sh
npm test                       # tests/publishProxy.test.ts, tests/publishFromIssue.test.ts
GITHUB_TOKEN=… OAUTH_CLIENT_ID=… OAUTH_CLIENT_SECRET=… SESSION_SECRET=$(openssl rand -hex 32) \
  PUBLIC_URL=http://localhost:8788 node publish-proxy/node-server.mjs
```

The tests run the full sign-in → publish → approve path against a fake GitHub, including quota,
cooldown, parallel bursts, forged/expired tokens, tampered flow data and oversized payloads.
