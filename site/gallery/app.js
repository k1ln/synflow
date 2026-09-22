(() => {
  'use strict';
  // Editor to open flows in. On localhost, point at the local dev server instead.
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const EDITOR = new URLSearchParams(location.search).get('editor') || (isLocal ? 'http://localhost:5173/' : 'https://synflow.org/');

  const $ = (id) => document.getElementById(id);
  const list = $('list'), detail = $('detail'), search = $('search'), chipsEl = $('chips'), empty = $('empty');
  let all = [], tag = '', current = '';

  const el = (tagName, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tagName), props);
    for (const k of kids) n.append(k);
    return n;
  };
  const dataUrl = (slug) => new URL(`data/${encodeURIComponent(slug)}.json`, location.href).href;
  const editorUrl = (slug) => `${EDITOR}?import=${encodeURIComponent(dataUrl(slug))}`;

  function renderChips() {
    const tags = [...new Set(all.flatMap((f) => f.tags))].sort();
    chipsEl.replaceChildren(...['', ...tags].map((t) => {
      const b = el('button', { className: 'chip' + (t === tag ? ' on' : ''), textContent: t || 'all' });
      b.onclick = () => { tag = t; renderChips(); renderList(); };
      return b;
    }));
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const rows = all.filter((f) => (!tag || f.tags.includes(tag))
      && (!q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q))));
    empty.hidden = rows.length > 0;
    empty.textContent = q || tag ? 'No flows match.' : 'No flows published yet.';
    list.replaceChildren(...rows.map((f) => {
      const b = el('button', { className: 'row' + (f.slug === current ? ' active' : '') });
      b.dataset.slug = f.slug;
      b.append(
        el('img', { src: `shots/${f.slug}.svg`, alt: '', loading: 'lazy' }),
        el('span', { className: 'row-name', textContent: f.name }),
        el('p', { className: 'row-desc', textContent: f.description || `${f.nodes} nodes` }),
        el('span', { className: 'row-meta' }, ...f.tags.map((t) => el('span', { className: 'tag', textContent: t }))),
      );
      b.onclick = () => select(f.slug);
      return b;
    }));
  }

  function select(slug) {
    const f = all.find((x) => x.slug === slug);
    if (!f) return;
    current = slug;
    history.replaceState(null, '', `#${slug}`);
    for (const r of list.children) r.classList.toggle('active', r.dataset.slug === slug);

    const fact = (label, value) => el('span', { className: 'fact' }, `${label} `, el('b', { textContent: value }));
    const types = f.nodeTypes.map((t) => `${t.type}${t.count > 1 ? ' ×' + t.count : ''}`).join(' · ');
    const needs = [f.needsMic && 'microphone', f.needsMidi && 'a MIDI device (optional)'].filter(Boolean);

    const open = el('a', { className: 'btn primary', href: editorUrl(f.slug), target: '_blank', rel: 'noopener', textContent: 'OPEN IN SYNFLOW' });
    const dl = el('a', { className: 'btn', href: dataUrl(f.slug), download: `${f.slug}.json`, textContent: 'DOWNLOAD JSON' });
    const copy = el('button', { className: 'btn', textContent: 'COPY LINK' });
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(editorUrl(f.slug)); copy.textContent = 'COPIED ✓'; }
      catch { copy.textContent = 'COPY FAILED'; }
      setTimeout(() => { copy.textContent = 'COPY LINK'; }, 1600);
    };

    detail.replaceChildren(el('div', { className: 'detail' },
      el('h2', { textContent: f.name }),
      el('p', { className: 'desc', textContent: f.description || 'No description yet.' }),
      el('div', { className: 'actions' }, open, dl, copy),
      el('div', { className: 'graph' }, el('img', { src: `shots/${f.slug}.svg`, alt: `Node graph of ${f.name}` })),
      el('div', { className: 'facts' },
        fact('nodes', f.nodes), fact('connections', f.edges),
        ...(f.author ? [fact('by', f.author)] : []),
        ...(f.dependencies.length ? [fact('bundles', f.dependencies.join(', '))] : [])),
      el('p', { className: 'note', textContent: `Built from: ${types}.` }),
      ...(needs.length ? [el('p', { className: 'note', textContent: `Uses ${needs.join(' and ')}.` })] : []),
      el('p', { className: 'note', textContent: 'Opens as a copy in your browser\'s local storage under the "gallery" folder. Audio starts after you click in the editor.' }),
    ));
    detail.scrollTop = 0;
  }

  search.addEventListener('input', renderList);

  (async () => {
    try {
      const r = await fetch('data/index.json', { cache: 'no-cache' });
      all = await r.json();
      if (!Array.isArray(all)) all = [];
    } catch {
      empty.hidden = false; empty.textContent = 'Could not load the catalogue (data/index.json).';
      return;
    }
    renderChips(); renderList();
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) select(hash);
    else if (all[0] && matchMedia('(min-width: 801px)').matches) select(all[0].slug);
  })();
  addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && h !== current) select(h); });
})();
