# Synflow site & flow gallery

Static site published to GitHub Pages (`https://k1ln.github.io/synflow/`) by
[.github/workflows/pages.yml](../.github/workflows/pages.yml). One-time setup: repo
**Settings → Pages → Source: GitHub Actions**.

- `index.html` — product / feature page
- `gallery/` — the public flow gallery (list, graph preview, "Open in Synflow")
- `gallery/data/<slug>.json` — one published flow each (source of truth)
- `gallery/data/index.json`, `gallery/shots/*.svg` — **generated**, do not edit

## Publish a flow

**From the editor (anyone):** the cloud-upload button in the top bar → sign in with GitHub → name,
describe, tag → *Publish to GitHub*. That opens an issue on this repo (label `publish-request`); a
maintainer reads it and adds the **`approved`** label, and
[gallery-publish.yml](../.github/workflows/gallery-publish.yml) commits the flow to `gallery/data/`,
redeploys this site and closes the issue. Spam protection (GitHub sign-in, account age, a daily quota per
account, global caps) and the one-time setup live in [publish-proxy/](../publish-proxy/README.md).

Reviewing: `node scripts/review-submission.mjs <issue#>` decodes the attached flow, lists every node that
carries code, and writes a file you can import into the editor — then add the `approved` label.

**From the command line (maintainers / pull requests):**

```sh
node scripts/build-flow-gallery.mjs publish my-flow.json \
  --name "My Flow" --desc "What it does" --tags synth,midi --author "You"
```

Sub-flows (FlowNode → `selectedNode`) are bundled into `dependencies`: the ones already inside the
file are kept, the rest are looked up by name in `flow-examples/` (add `--search <dir>` for more
folders). Rebuild only: `node scripts/build-flow-gallery.mjs`. Preview locally:
`python3 -m http.server -d site` (add `?editor=http://localhost:5173/` to open flows in your dev editor).

## How "Open in Synflow" works

The button links to `https://synflow.org/?import=<flow.json URL>`. The editor
([Flow.tsx](../src/Flow.tsx), `readGalleryImportUrl`) fetches it, saves the flow and its
dependencies under the `gallery/` folder in local storage and opens it. Only
`k1ln.github.io`, `synflow.org` and localhost URLs are accepted, because flows can contain
script nodes. The editor must be deployed with this change for the link to work.
