// Title fonts — 30 popular families, self-hosted (woff2 in public/fonts/, no CDN
// at runtime). Loaded via the FontFace API so they're available to the title
// renderer on <canvas> (live preview) and OffscreenCanvas (export). See docs/VIDEO.md.

export interface FontDef { name: string; slug: string }

/** name = the CSS/canvas family we register; slug = the file in public/fonts/. */
export const TITLE_FONTS: FontDef[] = [
  { name: 'Inter', slug: 'inter' },
  { name: 'Roboto', slug: 'roboto' },
  { name: 'Open Sans', slug: 'open-sans' },
  { name: 'Lato', slug: 'lato' },
  { name: 'Montserrat', slug: 'montserrat' },
  { name: 'Poppins', slug: 'poppins' },
  { name: 'Oswald', slug: 'oswald' },
  { name: 'Raleway', slug: 'raleway' },
  { name: 'Noto Sans', slug: 'noto-sans' },
  { name: 'Roboto Condensed', slug: 'roboto-condensed' },
  { name: 'Work Sans', slug: 'work-sans' },
  { name: 'DM Sans', slug: 'dm-sans' },
  { name: 'Fira Sans', slug: 'fira-sans' },
  { name: 'Archivo', slug: 'archivo' },
  { name: 'Rubik', slug: 'rubik' },
  { name: 'Nunito', slug: 'nunito' },
  { name: 'Quicksand', slug: 'quicksand' },
  { name: 'Josefin Sans', slug: 'josefin-sans' },
  { name: 'Ubuntu', slug: 'ubuntu' },
  { name: 'PT Sans', slug: 'pt-sans' },
  { name: 'Merriweather', slug: 'merriweather' },
  { name: 'Playfair Display', slug: 'playfair-display' },
  { name: 'Lora', slug: 'lora' },
  { name: 'Bitter', slug: 'bitter' },
  { name: 'Bebas Neue', slug: 'bebas-neue' },
  { name: 'Anton', slug: 'anton' },
  { name: 'Teko', slug: 'teko' },
  { name: 'Dancing Script', slug: 'dancing-script' },
  { name: 'Pacifico', slug: 'pacifico' },
  { name: 'Caveat', slug: 'caveat' },
];

let loading: Promise<void> | null = null;

/** Register every title font from the bundled woff2 files (idempotent). Resolves
 *  once they're ready so canvas text uses the real glyphs (not a fallback). */
export function loadTitleFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
    const base = (import.meta as any).env?.BASE_URL || '/';
    await Promise.all(TITLE_FONTS.map(async (f) => {
      try {
        const face = new FontFace(f.name, `url(${base}fonts/${f.slug}.woff2)`);
        await face.load();
        (document as any).fonts.add(face);
      } catch { /* one bad font shouldn't block the rest */ }
    }));
  })();
  return loading;
}
