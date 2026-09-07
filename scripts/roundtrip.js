#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");
const recipe = require("../src/recipe");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`ok  ${message}`);
}

const built = recipe.buildRecipe({
  renderMode: "dither",
  ditherPalette: "gameboy",
  fontSize: 8,
  pfx: {
    scanLines: { enabled: true }
  }
});

assert.strictEqual(built.payload.v, 1);
assert.strictEqual(built.payload.renderMode, "dither");
assert.strictEqual(built.payload.ditherPalette, "gameboy");
assert.strictEqual(built.payload.fontSize, 8);
assert.deepStrictEqual(built.payload.pfx, { scanLines: { enabled: true } });
assert.ok(!Object.prototype.hasOwnProperty.call(built.payload, "ditherAlgo"));
assert.ok(built.code.startsWith("recipe:v1:"));
assert.ok(built.link.startsWith("https://www.ascii-magic.com/app?r="));
const token = built.code.slice("recipe:v1:".length);
assert.ok(!token.includes("="));
assert.strictEqual(built.link, "https://www.ascii-magic.com/app?r=" + token);
assert.match(built.summary, /dither/);
pass("build dither+gameboy+fontSize 8+scanLines");

const fromCode = recipe.parseRecipe(built.code);
assert.ifError(fromCode.error);
assert.strictEqual(fromCode.settings.renderMode, "dither");
assert.strictEqual(fromCode.settings.ditherPalette, "gameboy");
assert.strictEqual(fromCode.settings.fontSize, 8);
assert.strictEqual(fromCode.settings.ditherAlgo, "floyd");
assert.strictEqual(fromCode.postEffects.scanLines.enabled, true);
assert.strictEqual(fromCode.postEffects.scanLines.intensity, 40);
assert.strictEqual(fromCode.postEffects.scanLines.spacing, 3);
assert.strictEqual(fromCode.postEffects.vignette.enabled, false);
pass("parse code → merged fields");

const fromLink = recipe.parseRecipe(built.link);
assert.ifError(fromLink.error);
assert.strictEqual(fromLink.settings.fontSize, 8);
assert.strictEqual(fromLink.postEffects.scanLines.enabled, true);
pass("parse editor URL");

const fromBare = recipe.parseRecipe(token);
assert.ifError(fromBare.error);
assert.strictEqual(fromBare.settings.ditherPalette, "gameboy");
pass("parse bare base64");

const rebuilt = recipe.buildRecipe({
  renderMode: fromCode.settings.renderMode,
  ditherPalette: fromCode.settings.ditherPalette,
  fontSize: fromCode.settings.fontSize,
  pfx: { scanLines: { enabled: fromCode.postEffects.scanLines.enabled } }
});
assert.strictEqual(rebuilt.code, built.code);
assert.deepStrictEqual(rebuilt.payload, built.payload);
pass("round-trip encode matches");

const rejected = recipe.parseRecipeCode(
  "recipe:v2:" + Buffer.from(JSON.stringify({ v: 2 }), "utf8").toString("base64").replace(/=+$/, "")
);
assert.ok(rejected.error);
assert.match(rejected.error, /newer version/i);
pass("reject v>1");

const missing = recipe.parseRecipeCode(
  Buffer.from(JSON.stringify({ renderMode: "dither" }), "utf8").toString("base64")
);
assert.ok(missing.error);
assert.match(missing.error, /version tag/i);
pass("reject missing v");

const defaults = recipe.defaults();
assert.strictEqual(defaults.RECIPE_DEFAULTS.renderMode, "characters");
assert.strictEqual(defaults.POSTFX_DEFAULTS.scanLines.enabled, false);
assert.ok(defaults.enums.renderMode.includes("dither"));
assert.ok(defaults.enums.ditherPalette.includes("gameboy"));
assert.ok(defaults.enums.ditherAlgo.includes("floyd"));
assert.ok(defaults.enums.animPreset.includes("wave"));
assert.ok(defaults.enums.bgMode.includes("none"));
assert.ok(!defaults.enums.renderMode.includes("glitch"));
pass("defaults + enums from schema");

const summary = recipe.summarize({ input: built.code });
assert.ifError(summary.error);
assert.strictEqual(summary.renderMode, "dither");
assert.strictEqual(summary.animated, false);
assert.strictEqual(summary.lights, 0);
assert.deepStrictEqual(summary.postFx, ["scanLines"]);
assert.match(summary.summary, /dither/);
assert.match(summary.summary, /scanLines/);
pass("summarize renderMode / animated / lights / post-FX");

const defaultLink = recipe.buildRecipe({});
assert.deepStrictEqual(defaultLink.payload, { v: 1 });
assert.strictEqual(defaultLink.code, "recipe:v1:" + recipe.encodeBase64({ v: 1 }));
pass("empty recipe is {v:1}");

function mcpRequest(child, message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function readMcpMessages(child, count, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const messages = [];
    const timer = setTimeout(() => {
      reject(new Error(`MCP timed out after ${timeoutMs}ms; got ${messages.length}/${count}`));
    }, timeoutMs);

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = buffer.subarray(0, headerEnd).toString("utf8");
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) break;
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + length) break;
        const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
        buffer = buffer.subarray(bodyStart + length);
        messages.push(JSON.parse(body));
        if (messages.length >= count) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          resolve(messages);
          return;
        }
      }
    }

    child.stdout.on("data", onData);
  });
}

async function smokeMcp() {
  const child = spawn(process.execPath, [path.join(__dirname, "../src/server.js")], {
    stdio: ["pipe", "pipe", "inherit"]
  });

  try {
    const pending = readMcpMessages(child, 3, 5000);
    mcpRequest(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "roundtrip", version: "0.1.0" }
      }
    });
    mcpRequest(child, { jsonrpc: "2.0", method: "notifications/initialized" });
    mcpRequest(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    mcpRequest(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "ascii_magic_build_recipe",
        arguments: {
          renderMode: "dither",
          ditherPalette: "gameboy",
          fontSize: 8,
          pfx: { scanLines: { enabled: true } }
        }
      }
    });
    const [init, listed, called] = await pending;
    assert.strictEqual(init.result.serverInfo.name, "ascii-magic");
    const names = listed.result.tools.map((tool) => tool.name).sort();
    assert.deepStrictEqual(names, [
      "ascii_magic_build_recipe",
      "ascii_magic_defaults",
      "ascii_magic_parse_recipe",
      "ascii_magic_summarize"
    ]);
    const payload = JSON.parse(called.result.content[0].text);
    assert.strictEqual(payload.payload.ditherPalette, "gameboy");
    assert.strictEqual(payload.payload.pfx.scanLines.enabled, true);
    pass("MCP initialize / tools/list / tools/call");
  } finally {
    child.stdin.end();
    child.kill();
  }
}

smokeMcp()
  .then(() => {
    if (process.exitCode) {
      fail("assertions failed");
      return;
    }
    console.log("\nAll round-trip checks passed.");
  })
  .catch((err) => {
    fail(err.stack || err.message);
    process.exit(1);
  });
