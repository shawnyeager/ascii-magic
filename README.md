# ascii-magic

Agent Plugin (`ascii-magic` v0.1.0) that encodes and decodes official [ASCII Magic](https://www.ascii-magic.com) editor recipes and returns deep links.

The website has **no public render API**. Rendering is client-side Canvas only. This plugin does **not** wrap PyPI `ascii-magic` / LeandroBarone, and it does **not** produce PNG or MP4 itself.

It embeds the live `/app` bundle schema in `src/recipe-schema.json` (`keys`, `defaults`, `pfx_defaults`) and speaks the site’s `recipe:v1:` format.

```
AsciiMagicRecipe = { v: 1, ...RECIPE_KEYS deltas, pfx?: PostFxDeltas }
RecipeLink       = { code, link, summary, payload }
```

- Code: `recipe:v1:<unpadded-base64>`
- Link: `https://www.ascii-magic.com/app?r=<unpadded-base64>`

## Install / run the MCP server

Zero-dependency Node 18+ stdio MCP. No npm install.

```bash
node src/server.js
```

Or from `package.json`:

```bash
npm run mcp
```

Agent Plugins clients start it from root `mcp.json`:

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["./src/server.js"],
  "cwd": "${PLUGIN_ROOT}"
}
```

The process speaks JSON-RPC 2.0 with `Content-Length` framing (newline-delimited JSON is also accepted).

### Grok Bot / Marketplace

Grok Bot loads Agent Plugins from the **Marketplace or dashboard**, not from `~/.cursor/plugins/local`.

This package is **not published** to any marketplace until the owner asks. Treat it as a local / repo plugin.

## Tools

| Tool | What it does |
| --- | --- |
| `ascii_magic_defaults` | `RECIPE_DEFAULTS` + `POSTFX_DEFAULTS` + enums from the schema file |
| `ascii_magic_build_recipe` | Merge overrides with defaults, delta-encode, return `{ code, link, summary, payload }` |
| `ascii_magic_parse_recipe` | Accept `recipe:v1:…`, a URL with `?r=`, or bare base64; merge defaults + expand `postEffects` |
| `ascii_magic_summarize` | Short summary: renderMode, animated, lights count, enabled post-FX names |

`ascii_magic_parse_recipe` mirrors the site `parseRecipeCode`: strip prefix, pad base64, `JSON.parse`, require `v`, reject `v>1`.

## Encode / decode rules

Matches the site `serializeRecipe` / `parseRecipeCode`:

1. Start from schema `defaults` + `pfx_defaults`.
2. Apply caller overrides. Post-FX go under `pfx`.
3. Keep only non-default keys (`JSON.stringify` deep equality).
4. `{v:1,...}` → JSON → Node `Buffer` base64 with `=` padding stripped.
5. Link base is always `https://www.ascii-magic.com/app?r=`.

## Live-editor enums

Documented from the current `/app` selects. Do not invent extra site features.

**renderMode:** `characters`, `dither`, `block-chars`, `dots`, `lines`, `diagonal`, `cross`, `diamond`, `mixed`, `pixel`, `lego`, `mosaic`, `braille`, `3d`, `disco`

Glitch is a post-FX (`pfx.glitch`), not a Style option in the live select.

**ditherAlgo:** `bayer2`, `bayer4`, `bayer8`, `bayer16`, `halftone`, `radial`, `linesH`, `linesV`, `linesD`, `whiteNoise`, `blueNoise`, `floyd`, `atkinson`, `stucki`, `sierraLite`

**ditherPalette:** `mono`, `grey4`, `grey8`, `gameboy`, `cga0`, `cga1`, `pico8`, `c64`, `nes16`, `rgb3`, `cyberpunk`, `pastel`, `riso`, `sepia`, `original`, `custom`

**animPreset:** `wave`, `cascade-lr`, `cascade-rl`, `cascade-tb`, `reveal`, `pulse`

**bgMode:** `blur` (Blurred Image), `solid` (Solid Black), `original` (Original Image), `none` (None / Transparent)

## Prove locally

```bash
node --check src/server.js
npm test
```

`scripts/roundtrip.js` builds dither + Game Boy + `fontSize` 8 + scan lines, parses the code / link / bare base64, and asserts the merged fields.

## Layout

```
plugin.json
mcp.json
src/recipe-schema.json
src/recipe.js
src/server.js
skills/ascii-magic-recipe/SKILL.md
scripts/roundtrip.js
```

Public, no auth, no secrets.
