---
name: ascii-magic-recipe
description: Build, parse, and summarize ASCII Magic editor recipes and deep links (Game Boy dither, CRT stacks, scanlines, lights, animation). Use when the user wants an ASCII Magic look, recipe code, or https://www.ascii-magic.com/app?r= link. Does not render PNG/MP4.
---

# ASCII Magic recipes

ASCII Magic (https://www.ascii-magic.com/app) is a **client-side Canvas editor**. There is no public render API. This plugin only encodes and decodes official `recipe:v1:` settings and returns editor deep links.

When the user wants an ASCII Magic look, recipe, deep link, Game Boy dither, CRT stack, scanlines, lights, or animation:

1. Call `ascii_magic_defaults` if you need live defaults or enums.
2. Call `ascii_magic_build_recipe` with `RECIPE_KEYS` overrides and optional `pfx` post-FX deltas.
3. Open the returned `link` in a browser, or hand `link` / `code` to the user.
4. Call `ascii_magic_parse_recipe` to decode a `recipe:v1:…` code, `?r=` URL, or bare base64.
5. Call `ascii_magic_summarize` for a short human summary.

Never invent site features beyond `src/recipe-schema.json` (`keys`, `defaults`, `pfx_defaults`). Do not wrap PyPI `ascii-magic` / LeandroBarone. Do not claim this plugin rendered an image or video.

## Tools

| Tool | Use |
| --- | --- |
| `ascii_magic_defaults` | `RECIPE_DEFAULTS`, `POSTFX_DEFAULTS`, enums |
| `ascii_magic_build_recipe` | Overrides + optional `pfx` → `{ code, link, summary, payload }` |
| `ascii_magic_parse_recipe` | `input` string → merged settings + expanded `postEffects` |
| `ascii_magic_summarize` | `input` or `payload` → renderMode, animated, lights, enabled post-FX names |

## Recipe shape

```
AsciiMagicRecipe = { v: 1, ...RECIPE_KEYS deltas, pfx?: PostFxDeltas }
RecipeLink       = { code: "recipe:v1:…", link: string, summary: string, payload }
```

- Delta-encode like the site: omit keys that match defaults; put post-FX under `pfx`.
- Link: `https://www.ascii-magic.com/app?r=<unpadded-base64>`
- Code: `recipe:v1:<same-unpadded-base64>`

## Verified live-editor enums

Use these values only (from the live `/app` selects). See schema `enumNotes` for caveats.

- **renderMode:** `characters`, `dither`, `block-chars`, `dots`, `lines`, `diagonal`, `cross`, `diamond`, `mixed`, `pixel`, `lego`, `mosaic`, `braille`, `3d`, `disco`
- **ditherAlgo:** `floyd`, `atkinson`, `stucki`, `sierraLite`, `bayer2`, `bayer4`, `bayer8`, `bayer16`, `halftone`, `radial`, `linesH`, `linesV`, `linesD`, `whiteNoise`, `blueNoise`
- **ditherPalette:** `mono`, `grey4`, `grey8`, `gameboy`, `cga0`, `cga1`, `pico8`, `c64`, `nes16`, `rgb3`, `cyberpunk`, `pastel`, `riso`, `sepia`, `original`, `custom`
- **animPreset:** `wave`, `cascade-lr`, `cascade-rl`, `cascade-tb`, `reveal`, `pulse`
- **bgMode:** `blur`, `solid`, `original`, `none`

`glitch` is a **post-FX** (`pfx.glitch`), not a Style/`renderMode` option. Backdrop `none` is “None (Transparent)”.

## Example: Game Boy dither + scanlines

```
ascii_magic_build_recipe
  renderMode: dither
  ditherPalette: gameboy
  fontSize: 8
  pfx.scanLines.enabled: true
```

Then open `link` on ascii-magic.com so the user can drop in their own photo. The site renders it in-browser.
