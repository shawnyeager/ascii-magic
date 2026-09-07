#!/usr/bin/env node
"use strict";

const recipe = require("./recipe");

const SERVER_INFO = {
  name: "ascii-magic",
  version: "0.1.0"
};

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "ascii_magic_defaults",
    description:
      "Return ASCII Magic RECIPE_DEFAULTS, POSTFX_DEFAULTS, and known enums (renderMode, ditherAlgo, ditherPalette, animPreset, bgMode) from the embedded live-bundle schema. Does not render images.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "ascii_magic_build_recipe",
    description:
      "Build a delta-encoded ASCII Magic recipe:v1 code and https://www.ascii-magic.com/app?r= deep link. Pass RECIPE_KEYS overrides plus optional pfx post-FX deltas. This plugin does not render PNG/MP4.",
    inputSchema: recipe.buildRecipeInputSchema()
  },
  {
    name: "ascii_magic_parse_recipe",
    description:
      "Parse a recipe:v1 code, an editor URL containing ?r=, or bare base64. Returns the delta payload plus settings and postEffects merged with defaults. Rejects missing v or v>1.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["input"],
      properties: {
        input: {
          type: "string",
          description: "Full recipe:v1:… code, https://www.ascii-magic.com/app?r= URL, or bare unpadded base64."
        }
      }
    }
  },
  {
    name: "ascii_magic_summarize",
    description:
      "Short human summary of a recipe: renderMode, animated, lights count, and enabled post-FX names.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        input: {
          type: "string",
          description: "recipe:v1:… code, editor URL with ?r=, or bare base64."
        },
        payload: {
          type: "object",
          description: "AsciiMagicRecipe delta ({v:1, ...}) or a settings object."
        }
      }
    }
  }
];

function writeMessage(message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolResult(value, isError) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }
    ],
    isError: Boolean(isError)
  };
}

function handleToolCall(name, args) {
  const input = args && typeof args === "object" ? args : {};
  switch (name) {
    case "ascii_magic_defaults":
      return toolResult(recipe.defaults());
    case "ascii_magic_build_recipe":
      return toolResult(recipe.buildRecipe(input));
    case "ascii_magic_parse_recipe": {
      const parsed = recipe.parseRecipe(input.input);
      if (parsed.error) return toolResult({ error: parsed.error }, true);
      return toolResult(parsed);
    }
    case "ascii_magic_summarize": {
      const summarized = recipe.summarize(input);
      if (summarized.error) return toolResult({ error: summarized.error }, true);
      return toolResult(summarized);
    }
    default:
      return toolResult({ error: `Unknown tool: ${name}` }, true);
  }
}

function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  const { id, method } = message;
  if (!method) return;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    });
    return;
  }

  if (method === "notifications/initialized" || method === "initialized") {
    return;
  }

  if (method === "ping") {
    sendResult(id, {});
    return;
  }

  if (method === "tools/list") {
    sendResult(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const name = message.params && message.params.name;
    const args = (message.params && message.params.arguments) || {};
    if (!name) {
      sendError(id, -32602, "Missing tool name");
      return;
    }
    try {
      sendResult(id, handleToolCall(name, args));
    } catch (err) {
      sendResult(id, toolResult({ error: err.message || String(err) }, true));
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

function createStdioReader(onMessage) {
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const header = buffer.subarray(0, headerEnd).toString("utf8");
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + length) return;
        const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
        buffer = buffer.subarray(bodyStart + length);
        onMessage(JSON.parse(body));
        continue;
      }

      const nl = buffer.indexOf("\n");
      if (nl === -1) return;
      const line = buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "").trim();
      buffer = buffer.subarray(nl + 1);
      if (!line || line.includes("Content-Length:")) continue;
      onMessage(JSON.parse(line));
    }
  });
}

createStdioReader((message) => {
  try {
    handleMessage(message);
  } catch (err) {
    process.stderr.write(`${err.stack || err.message}\n`);
    if (message && message.id !== undefined) {
      sendError(message.id, -32603, err.message || "Internal error");
    }
  }
});

process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
