"use strict";

const fs = require("fs");
const path = require("path");

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "recipe-schema.json"), "utf8")
);

const LINK_BASE = `${schema.editor}?r=`;
const CODE_PREFIX = "recipe:v1:";
const RECIPE_KEYS = schema.keys;
const RECIPE_DEFAULTS = schema.defaults;
const POSTFX_DEFAULTS = schema.pfx_defaults;

// Live /app select values (not in recipe-schema.json). Glitch is post-FX, not renderMode.
const ENUMS = {
  renderMode: [
    "characters",
    "dither",
    "block-chars",
    "dots",
    "lines",
    "diagonal",
    "cross",
    "diamond",
    "mixed",
    "pixel",
    "lego",
    "mosaic",
    "braille",
    "3d",
    "disco"
  ],
  ditherAlgo: [
    "bayer2",
    "bayer4",
    "bayer8",
    "bayer16",
    "halftone",
    "radial",
    "linesH",
    "linesV",
    "linesD",
    "whiteNoise",
    "blueNoise",
    "floyd",
    "atkinson",
    "stucki",
    "sierraLite"
  ],
  ditherPalette: [
    "mono",
    "grey4",
    "grey8",
    "gameboy",
    "cga0",
    "cga1",
    "pico8",
    "c64",
    "nes16",
    "rgb3",
    "cyberpunk",
    "pastel",
    "riso",
    "sepia",
    "original",
    "custom"
  ],
  animPreset: [
    "wave",
    "cascade-lr",
    "cascade-rl",
    "cascade-tb",
    "reveal",
    "pulse"
  ],
  bgMode: ["blur", "solid", "original", "none"]
};

const ENUM_NOTES = {
  renderMode: "Live editor Style select. Glitch is pfx.glitch, not a renderMode.",
  ditherAlgo: "Live editor ditherAlgo select. Engine-only sierra/sierraTwo/burkes/jjn are omitted.",
  ditherPalette: "Live editor Palette select. custom uses ditherCustomPalette.",
  animPreset: "Live editor Animation Style select.",
  bgMode: "Live editor Backdrop Mode: blur, solid, original, none (transparent)."
};

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, clone(inner)])
    );
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function emptyPostEffects() {
  const postEffects = {};
  for (const name of Object.keys(POSTFX_DEFAULTS)) {
    postEffects[name] = clone(POSTFX_DEFAULTS[name]);
  }
  return postEffects;
}

function defaultSettings() {
  const settings = {};
  for (const key of RECIPE_KEYS) {
    settings[key] = clone(RECIPE_DEFAULTS[key]);
  }
  return settings;
}

function mergePostEffects(pfx) {
  const postEffects = emptyPostEffects();
  if (!pfx || typeof pfx !== "object") return postEffects;
  for (const name of Object.keys(pfx)) {
    if (!postEffects[name] || !pfx[name] || typeof pfx[name] !== "object") {
      continue;
    }
    Object.assign(postEffects[name], pfx[name]);
  }
  return postEffects;
}

function mergeRecipe(payload) {
  const settings = defaultSettings();
  if (!payload || typeof payload !== "object") {
    return { settings, postEffects: emptyPostEffects(), payload: { v: 1 } };
  }
  for (const key of RECIPE_KEYS) {
    if (payload[key] !== undefined) settings[key] = clone(payload[key]);
  }
  const postEffects = mergePostEffects(payload.pfx);
  return { settings, postEffects, payload };
}

function mergeBuildArgs(args) {
  const input = args && typeof args === "object" ? args : {};
  const settings = defaultSettings();
  for (const key of RECIPE_KEYS) {
    if (input[key] !== undefined) settings[key] = clone(input[key]);
  }
  const postEffects = emptyPostEffects();
  if (input.pfx && typeof input.pfx === "object") {
    for (const name of Object.keys(input.pfx)) {
      if (!postEffects[name] || !input.pfx[name] || typeof input.pfx[name] !== "object") {
        continue;
      }
      Object.assign(postEffects[name], input.pfx[name]);
    }
  }
  return { settings, postEffects };
}

function siteSummary(payload) {
  const parts = [];
  if (payload.renderMode) parts.push(payload.renderMode);
  if (payload.animated) parts.push("animated");
  if (payload.lightsEnabled && payload.lights && payload.lights.length) {
    const n = payload.lights.length;
    parts.push(`${n} light${n > 1 ? "s" : ""}`);
  }
  if (payload.pfx) {
    const enabled = Object.keys(payload.pfx).filter((name) => payload.pfx[name] && payload.pfx[name].enabled);
    if (enabled.length) parts.push(`${enabled.length} post-FX`);
  }
  return parts.length ? `Captured: ${parts.join(" · ")}` : "Captured the default look.";
}

function enabledPostFxNames(postEffects, pfx) {
  const names = [];
  if (postEffects) {
    for (const name of Object.keys(POSTFX_DEFAULTS)) {
      if (postEffects[name] && postEffects[name].enabled) names.push(name);
    }
    return names;
  }
  if (pfx) {
    for (const name of Object.keys(pfx)) {
      if (pfx[name] && pfx[name].enabled) names.push(name);
    }
  }
  return names;
}

function humanSummary(settings, postEffects) {
  const renderMode = settings.renderMode || "characters";
  const animated = settings.animated
    ? `animated (${settings.animPreset || "wave"})`
    : "still";
  const lights = settings.lightsEnabled && Array.isArray(settings.lights)
    ? settings.lights.length
    : 0;
  const fx = enabledPostFxNames(postEffects);
  const fxText = fx.length ? fx.join(", ") : "no post-FX";
  return `${renderMode} · ${animated} · ${lights} light${lights === 1 ? "" : "s"} · ${fxText}`;
}

function encodeBase64(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/=+$/, "");
}

function serializeState(settings, postEffects) {
  const payload = { v: 1 };
  for (const key of RECIPE_KEYS) {
    if (!deepEqual(settings[key], RECIPE_DEFAULTS[key])) {
      payload[key] = clone(settings[key]);
    }
  }
  const pfx = {};
  for (const name of Object.keys(POSTFX_DEFAULTS)) {
    const defaults = POSTFX_DEFAULTS[name];
    const current = postEffects && postEffects[name];
    if (!current) continue;
    for (const field of Object.keys(defaults)) {
      if (current[field] !== defaults[field]) {
        if (!pfx[name]) pfx[name] = {};
        pfx[name][field] = current[field];
      }
    }
  }
  if (Object.keys(pfx).length) payload.pfx = pfx;
  const b64 = encodeBase64(payload);
  return {
    code: CODE_PREFIX + b64,
    link: LINK_BASE + b64,
    summary: siteSummary(payload),
    payload
  };
}

function buildRecipe(args) {
  const { settings, postEffects } = mergeBuildArgs(args);
  return serializeState(settings, postEffects);
}

function extractRecipeInput(input) {
  if (!input || typeof input !== "string") {
    return { error: "Paste a recipe code or link." };
  }
  let raw = input.trim();
  const query = raw.match(/[?&]r=([^&#\s]+)/);
  if (query) raw = query[1];
  raw = raw.replace(/^recipe:v\d+:/, "").trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep the extracted token if it is not URI-encoded
  }
  raw = raw.replace(/ /g, "+");
  return { raw };
}

function parseRecipeCode(input) {
  const extracted = extractRecipeInput(input);
  if (extracted.error) return extracted;
  let token = extracted.raw;
  while (token.length % 4) token += "=";
  let decoded;
  try {
    decoded = Buffer.from(token, "base64").toString("utf8");
  } catch {
    return { error: "That doesn't look like a valid recipe code." };
  }
  if (!decoded) {
    return { error: "That doesn't look like a valid recipe code." };
  }
  let recipe;
  try {
    recipe = JSON.parse(decoded);
  } catch {
    return { error: "Recipe is malformed, make sure you copied the whole thing." };
  }
  if (!recipe || typeof recipe !== "object") {
    return { error: "Recipe data is empty." };
  }
  if (recipe.v == null) {
    return { error: "Recipe is missing a version tag." };
  }
  if (recipe.v > 1) {
    return {
      error: "This recipe needs a newer version of ASCII Magic, try refreshing the page."
    };
  }
  return { recipe };
}

function parseRecipe(input) {
  const parsed = parseRecipeCode(input);
  if (parsed.error) return parsed;
  const merged = mergeRecipe(parsed.recipe);
  const encoded = serializeState(merged.settings, merged.postEffects);
  return {
    payload: parsed.recipe,
    settings: merged.settings,
    postEffects: merged.postEffects,
    code: encoded.code,
    link: encoded.link,
    summary: humanSummary(merged.settings, merged.postEffects)
  };
}

function summarize(args) {
  if (args && typeof args.input === "string" && args.input.trim()) {
    const parsed = parseRecipe(args.input);
    if (parsed.error) return parsed;
    return {
      summary: parsed.summary,
      renderMode: parsed.settings.renderMode,
      animated: parsed.settings.animated,
      lights: parsed.settings.lightsEnabled ? parsed.settings.lights.length : 0,
      postFx: enabledPostFxNames(parsed.postEffects)
    };
  }

  const payload = args && (args.payload || args);
  if (!payload || typeof payload !== "object") {
    return { error: "Provide a recipe input string or payload object." };
  }

  if (payload.postEffects && typeof payload.postEffects === "object" && !payload.pfx) {
    const settings = { ...defaultSettings(), ...payload };
    delete settings.postEffects;
    const postEffects = mergePostEffects(
      Object.fromEntries(
        Object.entries(payload.postEffects).map(([name, value]) => [name, value])
      )
    );
    for (const name of Object.keys(payload.postEffects)) {
      if (postEffects[name]) Object.assign(postEffects[name], payload.postEffects[name]);
    }
    return {
      summary: humanSummary(settings, postEffects),
      renderMode: settings.renderMode,
      animated: settings.animated,
      lights: settings.lightsEnabled ? settings.lights.length : 0,
      postFx: enabledPostFxNames(postEffects)
    };
  }

  const merged = mergeRecipe(payload);
  return {
    summary: humanSummary(merged.settings, merged.postEffects),
    renderMode: merged.settings.renderMode,
    animated: merged.settings.animated,
    lights: merged.settings.lightsEnabled ? merged.settings.lights.length : 0,
    postFx: enabledPostFxNames(merged.postEffects)
  };
}

function defaults() {
  return {
    RECIPE_DEFAULTS: clone(RECIPE_DEFAULTS),
    POSTFX_DEFAULTS: clone(POSTFX_DEFAULTS),
    enums: clone(ENUMS),
    RECIPE_KEYS: RECIPE_KEYS.slice(),
    notes: ENUM_NOTES,
    encode_notes: schema.encode_notes
  };
}

function inferJsonSchemaType(value) {
  if (Array.isArray(value)) return { type: "array" };
  if (value === null) return {};
  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object":
      return { type: "object" };
    default:
      return {};
  }
}

function buildRecipeInputSchema() {
  const properties = {};
  for (const key of RECIPE_KEYS) {
    properties[key] = inferJsonSchemaType(RECIPE_DEFAULTS[key]);
  }
  const pfxProperties = {};
  for (const name of Object.keys(POSTFX_DEFAULTS)) {
    const fields = {};
    for (const [field, value] of Object.entries(POSTFX_DEFAULTS[name])) {
      fields[field] = inferJsonSchemaType(value);
    }
    pfxProperties[name] = {
      type: "object",
      properties: fields,
      additionalProperties: false
    };
  }
  properties.pfx = {
    type: "object",
    description: "Post-FX deltas, same shape as POSTFX_DEFAULTS entries.",
    properties: pfxProperties,
    additionalProperties: false
  };
  return {
    type: "object",
    additionalProperties: false,
    properties
  };
}

module.exports = {
  LINK_BASE,
  CODE_PREFIX,
  RECIPE_KEYS,
  RECIPE_DEFAULTS,
  POSTFX_DEFAULTS,
  ENUMS,
  clone,
  deepEqual,
  defaults,
  buildRecipe,
  parseRecipe,
  parseRecipeCode,
  summarize,
  serializeState,
  mergeRecipe,
  mergeBuildArgs,
  humanSummary,
  siteSummary,
  encodeBase64,
  buildRecipeInputSchema
};
