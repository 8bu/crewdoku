# Crewdoku logo — brief guidelines

Covers digital and print. The mark is the **symbol** (a 3×3 schedule grid) and
the two-tone **Crew·doku** wordmark. Assets live in this folder; all are vector.

## The marks

| Asset | File | Use |
|---|---|---|
| Symbol (primary) | `symbol-accent.svg` | App icon, standalone mark, favicon source |
| Symbol (mono) | `symbol-mono-light.svg` · `symbol-mono-dark.svg` | Single-colour contexts |
| Favicon | `favicon.svg` (+ `.ico`) | Browser tab; denser empty-cell grey for 16 px legibility |
| App tile | `app-icon.svg` → `apple-touch-icon.png` | Home-screen / rounded-tile placements |
| Lockup (light) | `lockup-light.svg` | Symbol + wordmark on light/neutral grounds |
| Lockup (dark) | `lockup-dark.svg` | Symbol + wordmark on ink/dark/photographic grounds |
| Wordmark only | `wordmark-light.svg` · `wordmark-dark.svg` | When the symbol appears separately |

The symbol reads as a small schedule board: filled cells are assignments placed
across the week. **Never fill the two empty cells** — that gesture is the idea.

## Colour

| Role | sRGB (digital) | CMYK (print build) | Notes |
|---|---|---|---|
| Indigo (primary/accent) | `#5a60e6` | C61 M58 Y0 K10 | Brand colour. For spot work, match a physical Pantone swatch in the 2725–2727 C family — **proof before committing**, do not trust the number alone. |
| Ink | `#15151a` | K100 (small) · rich black ~C50 M40 Y40 K100 (large ground) | Dark ground, light-mode "Crew". |
| Near-white | `#f7f7f8` | paper / knockout, no ink | Dark-mode "Crew". |
| Empty-cell grey | `#e1e1e4` (light) · `#c9c9d0` (favicon) | ~12 % cool grey (K12) | The unfilled cells only. |

Two-tone split is fixed: **Crew** = ink (light) / near-white (dark); **doku** =
indigo, always. Mono versions (all indigo, or all ink/white) are for one-colour
printing, engraving, or single-ink contexts.

## Clear space & minimum size

- **Clear space:** keep at least **one grid cell** (one symbol module) clear on
  every side of the mark. Nothing intrudes.
- **Minimum size — symbol:** 16 px on screen (use `favicon.svg`), ~5 mm in print.
- **Minimum size — lockup:** ~24 px tall on screen, ~10 mm in print. Below that,
  drop the wordmark and use the symbol alone.

## Backgrounds

- Light lockup → light or quiet neutral grounds only.
- Dark lockup → ink, dark, or photographic grounds (ensure the area behind the
  mark is calm enough for contrast).
- Favicon is adaptive: transparent ground, `prefers-color-scheme` flips the
  empty cells so the mark holds on light *and* dark tab strips.

## File formats

- **Digital:** ship SVG. Favicon `favicon.svg` + `favicon.ico` (16/32/48);
  home-screen `apple-touch-icon.png` (180). The wordmark is outlined, so it
  needs no webfont.
- **Print:** vector always — SVG, PDF, or EPS. **Never rasterise for print.** If
  a raster is unavoidable, export ≥300 dpi PNG at final size. Use CMYK builds (or
  the chosen spot colour); do not send RGB hex to a press.

## Typography

- Wordmark is **Lexend SemiBold (600)**, delivered as outlined paths — the brand
  mark is font-independent; never rebuild it in a live font.
- App UI font is **Inter**. For brand-adjacent headlines, Lexend 600.

## Don'ts

- Don't recolour outside the palette, or break the Crew/doku two-tone split.
- Don't fill the empty cells, rotate, stretch, distort, or reproportion the mark.
- Don't add shadows, gradients, outlines, or effects.
- Don't place the light lockup on busy or low-contrast grounds.
- Don't retype the wordmark in a system or web font — use the outlined asset.
