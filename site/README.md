# Synflow site & flow gallery

Static site published to GitHub Pages (`https://k1ln.github.io/synflow/`) by
[.github/workflows/pages.yml](../.github/workflows/pages.yml). One-time setup: repo
**Settings → Pages → Source: GitHub Actions**.

- `index.html` — product / feature page
- `gallery/` — the public flow gallery (list, graph preview, "Open in Synflow")
- `gallery/data/<slug>.json` — one published flow each (source of truth)
- `gallery/data/index.json`, `gallery/shots/*.svg` — **generated**, do not edit

## Publish a flow

```sh
node scripts/build-flow-gallery.mjs publish my-flow.json \
  --name "My Flow" --desc "What it does" --tags synth,midi --author "You"
```

Sub-flows (FlowNode → `selectedNode`) are looked up by name in `flow-examples/` (add
`--search <dir>` for more folders) and bundled into `dependencies`. Rebuild only:
`node scripts/build-flow-gallery.mjs`. Preview locally: `python3 -m http.server -d site`
(add `?editor=http://localhost:5173/` to open flows in your dev editor).

## How "Open in Synflow" works

The button links to `https://synflow.org/?import=<flow.json URL>`. The editor
([Flow.tsx](../src/Flow.tsx), `readGalleryImportUrl`) fetches it, saves the flow and its
dependencies under the `gallery/` folder in local storage and opens it. Only
`k1ln.github.io`, `synflow.org` and localhost URLs are accepted, because flows can contain
script nodes. The editor must be deployed with this change for the link to work.
