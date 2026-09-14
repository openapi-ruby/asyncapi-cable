import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  clientParamsType,
  dedupeUnions,
  generateOne,
  contentSchemaTargets,
  contentSchemaDocument,
  nameNestedSchemas,
  renderPayloadParser,
  isRemoteInput,
  matchModelName,
  renderChannelClass,
  renderComposable,
  stripConditionals,
  tidyModelSource,
} from "../src/index.mjs";

const FIXTURE = join(import.meta.dirname, "fixtures", "cable_fixture.yaml");
const SERVER_FIXTURE = join(import.meta.dirname, "fixtures", "server_param_fixture.yaml");
const RESERVED_FIXTURE = join(import.meta.dirname, "fixtures", "reserved_name_fixture.yaml");

/** Run the generator into a throwaway dir and hand the reader to `fn`. */
async function withGenerated(opts, fn) {
  const outDir = mkdtempSync(join(tmpdir(), "asyncapi-cable-"));
  try {
    await generateOne({ input: FIXTURE, outDir, ...opts });
    await fn((rel) => readFileSync(join(outDir, rel), "utf8"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

test("isRemoteInput distinguishes http(s) URLs from local paths", () => {
  assert.equal(isRemoteInput("https://example.com/cable.yaml"), true);
  assert.equal(isRemoteInput("http://example.com/cable.yaml"), true);
  assert.equal(isRemoteInput("asyncapi/cable_internal.yaml"), false);
  assert.equal(isRemoteInput("/abs/path/cable.yaml"), false);
});

test("URL input is fetched and generated end to end", async () => {
  const yaml = await readFile(FIXTURE, "utf8");
  const url = "https://backend.example/cable-docs/schemas/cable_mobile";
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (u) => {
    seen.push(String(u));
    return new Response(yaml, {
      status: 200,
      headers: { "content-type": "application/x-yaml" },
    });
  };
  const outDir = mkdtempSync(join(tmpdir(), "asyncapi-cable-"));
  try {
    await generateOne({ input: url, outDir });
    assert.deepEqual(seen, [url]);
    const channel = readFileSync(join(outDir, "channels/WidgetStatusChannel.ts"), "utf8");
    assert.ok(channel.includes('static identifier = "Widgets::WidgetStatusChannel";'));
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("a failed URL fetch throws with status text", async () => {
  const url = "https://backend.example/cable-docs/schemas/missing";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("nope", { status: 404, statusText: "Not Found" });
  const outDir = mkdtempSync(join(tmpdir(), "asyncapi-cable-"));
  try {
    await assert.rejects(generateOne({ input: url, outDir }), /Failed to fetch .*404 Not Found/);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("stripConditionals removes if/then so status stays a plain string", () => {
  const doc = {
    components: {
      schemas: {
        Msg: {
          type: "object",
          allOf: [
            {
              if: { required: ["exception"] },
              then: { properties: { status: { const: "failed" } } },
            },
          ],
        },
      },
    },
  };
  assert.equal(stripConditionals(doc).components.schemas.Msg.allOf, undefined);
});

test("dedupeUnions collapses repeated union members", () => {
  assert.equal(
    dedupeUnions("  record_id?: string | null | number | null | null;"),
    "  record_id?: string | null | number;"
  );
});

test("tidyModelSource rewrites additionalProperties + type-only exports", () => {
  const tidied = tidyModelSource(
    "interface X {\n  additionalProperties?: Record<string, any>;\n}\nexport { X };"
  );
  assert.ok(tidied.includes("[key: string]: unknown;"));
  assert.ok(tidied.includes("export type { X };"));
});

test("tidyModelSource imports a sibling model for its type only", () => {
  // Every model is type-only now that enums are unions — a value import of one
  // is an error under `verbatimModuleSyntax`.
  const tidied = tidyModelSource(
    "import {Y} from './Y';\ninterface X {\n  y: Y;\n}\nexport { X };"
  );
  assert.ok(tidied.includes("import type {Y} from './Y';"));
});

test("matchModelName finds the model Modelina renamed", () => {
  // A message named after a TypeScript keyword is emitted as `ReservedImport`,
  // so matching the document's own name verbatim imports a module nobody wrote.
  assert.equal(matchModelName("Import", ["ReservedImport"]), "ReservedImport");
  assert.equal(matchModelName("Widget", ["Widget", "ReservedWidget"]), "Widget");
  assert.equal(matchModelName("Widget", ["Gadget"]), undefined);
});

test("clientParamsType excludes server-derived params", () => {
  assert.equal(
    clientParamsType({ parameters: { widget_id: { description: "x" } } }),
    "{ widget_id: string }"
  );
  assert.equal(
    clientParamsType({ parameters: { user_id: { "x-client-supplied": false } } }),
    "Record<string, never>"
  );
});

test("clientParamsType treats a channel with no parameters as empty", () => {
  assert.equal(clientParamsType({}), "Record<string, never>");
  assert.equal(clientParamsType({ parameters: {} }), "Record<string, never>");
  assert.equal(clientParamsType(undefined), "Record<string, never>");
});

test("clientParamsType joins multiple client params", () => {
  assert.equal(
    clientParamsType({ parameters: { board_id: {}, tab_id: { description: "x" } } }),
    "{ board_id: string; tab_id: string }"
  );
});

test("clientParamsType keeps only client params when mixed with server-derived", () => {
  assert.equal(
    clientParamsType({
      parameters: {
        user_id: { "x-client-supplied": false },
        board_id: { description: "client picks the board" },
      },
    }),
    "{ board_id: string }"
  );
});

test("renderChannelClass emits Record<string, never> for a server-derived channel", () => {
  const { source, paramsName } = renderChannelClass({
    channelName: "UserPing",
    identifier: "UserPingChannel",
    paramsType: "Record<string, never>",
    messageNames: ["UserPingMessage"],
  });
  assert.equal(paramsName, "UserPingParams");
  assert.ok(source.includes("export type UserPingParams = Record<string, never>;"));
  assert.ok(source.includes("export class UserPingChannel extends Channel<UserPingParams, UserPingData>"));
});

test("renderComposable (vue) omits the params arg when a channel has none", () => {
  const { source } = renderComposable({
    channelName: "UserPing",
    className: "UserPingChannel",
    dataType: "UserPingData",
    paramsName: "UserPingParams",
    hasParams: false,
    preset: "vue",
  });
  assert.ok(!source.includes("params:"));
  assert.ok(source.includes("subscribeChannel(new UserPingChannel(), handlers)"));
});

test("renderComposable (react) omits the params arg when a channel has none", () => {
  const { source } = renderComposable({
    channelName: "UserPing",
    className: "UserPingChannel",
    dataType: "UserPingData",
    paramsName: "UserPingParams",
    hasParams: false,
    preset: "react",
  });
  assert.ok(!source.includes("params:"));
  assert.ok(source.includes("useChannelSubscription(() => new UserPingChannel(), handlers)"));
});

test("renderChannelClass emits a portable @anycable/core class", () => {
  const { source } = renderChannelClass({
    channelName: "WidgetStatus",
    identifier: "Widgets::WidgetStatusChannel",
    paramsType: "{ widget_id: string }",
    messageNames: ["WidgetStatusMessage", "WidgetActionMessage"],
  });
  assert.ok(source.includes('import { Channel } from "@anycable/core";'));
  assert.ok(
    source.includes(
      "export class WidgetStatusChannel extends Channel<WidgetStatusParams, WidgetStatusData>"
    )
  );
  assert.ok(source.includes('static identifier = "Widgets::WidgetStatusChannel";'));
  assert.ok(!source.includes("@/"));
});

test("renderComposable (vue) delegates to subscribeChannel", () => {
  const { source } = renderComposable({
    channelName: "WidgetStatus",
    className: "WidgetStatusChannel",
    dataType: "WidgetStatusData",
    paramsName: "WidgetStatusParams",
    hasParams: true,
    preset: "vue",
  });
  assert.ok(source.includes('from "../runtime";'));
  assert.ok(source.includes("subscribeChannel(new WidgetStatusChannel(params), handlers)"));
});

test("vue preset: snake_case types, portable class, seam only in runtime", async () => {
  await withGenerated({}, (read) => {
    const message = read("models/WidgetStatusMessage.ts");
    assert.ok(message.includes("widget_id: string;"));
    assert.ok(message.includes("status: string;"));
    assert.ok(!message.includes("'failed'"));

    const action = read("models/WidgetActionEnum.ts");
    // A union, not a TypeScript `enum`: an enum member is nominal and would not
    // be assignable to the literal union an OpenAPI client writes for the same
    // component.
    assert.ok(action.includes('type WidgetActionEnum = "build" | "tear_down";'));
    assert.ok(!/\benum\s+WidgetActionEnum/.test(action));
    assert.ok(message.includes("import type {WidgetActionEnum}"));

    const channel = read("channels/WidgetStatusChannel.ts");
    assert.ok(channel.includes('import { Channel } from "@anycable/core";'));
    assert.ok(channel.includes('static identifier = "Widgets::WidgetStatusChannel";'));

    const runtime = read("runtime.ts");
    assert.ok(runtime.includes('import { getCable } from "../internalCableClient";'));

    const composable = read("composables/useWidgetStatusChannel.ts");
    assert.ok(!composable.includes("getCable"));
  });
});

test("configured cable mutator drives runtime.ts", async () => {
  await withGenerated(
    { cable: { path: "@/some/customCable", name: "acquireCable" } },
    (read) => {
      const runtime = read("runtime.ts");
      assert.ok(runtime.includes('import { acquireCable } from "@/some/customCable";'));
      assert.ok(runtime.includes("acquireCable().subscribe(channel)"));
    }
  );
});

test("react preset: React hook runtime + shared portable class", async () => {
  await withGenerated({ preset: "react" }, (read) => {
    const runtime = read("runtime.ts");
    assert.ok(runtime.includes('import { useEffect, useRef } from "react";'));
    assert.ok(runtime.includes("export function useChannelSubscription<C extends Channel>("));
    assert.ok(runtime.includes('import type { Channel } from "@anycable/core";'));
    assert.ok(!runtime.includes("onScopeDispose"));

    const hook = read("composables/useWidgetStatusChannel.ts");
    assert.ok(hook.includes('import { useChannelSubscription, type ChannelHandlers } from "../runtime";'));
    assert.ok(hook.includes("useChannelSubscription(() => new WidgetStatusChannel(params), handlers);"));

    // The channel class is identical to the vue preset.
    assert.ok(
      read("channels/WidgetStatusChannel.ts").includes('import { Channel } from "@anycable/core";')
    );
  });
});

test("server-derived channel generates a param-free composable end to end", async () => {
  await withGenerated({ input: SERVER_FIXTURE }, (read) => {
    const channel = read("channels/UserPingChannel.ts");
    assert.ok(channel.includes("export type UserPingParams = Record<string, never>;"));
    assert.ok(channel.includes('static identifier = "UserPingChannel";'));

    const composable = read("composables/useUserPingChannel.ts");
    assert.ok(!composable.includes("params:"));
    assert.ok(composable.includes("subscribeChannel(new UserPingChannel(), handlers)"));
  });
});

test("renderComposable imports the params type it references", () => {
  // Generation succeeds either way; only a type-check on the emitted client
  // catches a name that was used but never imported.
  const { source: withParams } = renderComposable({
    channelName: "Widget",
    className: "WidgetChannel",
    dataType: "WidgetData",
    paramsName: "WidgetParams",
    hasParams: true,
    preset: "vue",
  });

  assert.match(
    withParams,
    /import \{ WidgetChannel, type WidgetData, type WidgetParams \} from "\.\.\/channels\/WidgetChannel";/
  );
});

test("renderComposable omits the params type when the channel takes none", () => {
  const { source: withoutParams } = renderComposable({
    channelName: "Widget",
    className: "WidgetChannel",
    dataType: "WidgetData",
    paramsName: "WidgetParams",
    hasParams: false,
    preset: "vue",
  });

  assert.match(
    withoutParams,
    /import \{ WidgetChannel, type WidgetData \} from "\.\.\/channels\/WidgetChannel";/
  );
  assert.doesNotMatch(withoutParams, /WidgetParams/);
});

test("the react preset imports the params type too", () => {
  const { source: react } = renderComposable({
    channelName: "Widget",
    className: "WidgetChannel",
    dataType: "WidgetData",
    paramsName: "WidgetParams",
    hasParams: true,
    preset: "react",
  });

  assert.match(react, /type WidgetData, type WidgetParams/);
});

test("contentSchemaTargets reads the component name the parser preserved", () => {
  const content = { type: "object", "x-parser-schema-id": "Rendered" };
  const targets = contentSchemaTargets({
    components: {
      schemas: {
        Msg: {
          properties: { payload: { contentSchema: content }, other: { type: "string" } },
          required: ["payload"],
        },
      },
    },
  });

  assert.deepEqual(targets, [
    { message: "Msg", property: "payload", component: "Rendered", required: true, schema: content },
  ]);
});

test("contentSchemaTargets falls back to $ref on an unparsed document", () => {
  const targets = contentSchemaTargets({
    components: {
      schemas: {
        Msg: { properties: { payload: { contentSchema: { $ref: "#/components/schemas/Rendered" } } } },
      },
    },
  });

  assert.equal(targets[0].component, "Rendered");
  assert.equal(targets[0].required, false);
});

test("contentSchemaTargets skips an inlined anonymous schema", () => {
  // Nothing to name the model after, so generating one would invent a name.
  const targets = contentSchemaTargets({
    components: {
      schemas: {
        Msg: {
          properties: {
            payload: { contentSchema: { type: "object", "x-parser-schema-id": "<anonymous-schema-3>" } },
          },
        },
      },
    },
  });

  assert.deepEqual(targets, []);
});

test("contentSchemaTargets ignores a plain string payload", () => {
  const targets = contentSchemaTargets({
    components: { schemas: { Msg: { properties: { payload: { type: "string" } } } } },
  });

  assert.deepEqual(targets, []);
});

test("contentSchemaDocument names the root and keeps the inlined subtree", () => {
  const schema = contentSchemaDocument(
    { type: "object", properties: { a: { type: "string" } } },
    "Rendered"
  );

  assert.equal(schema.$id, "Rendered");
  assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.deepEqual(schema.properties, { a: { type: "string" } });
});

test("contentSchemaDocument returns undefined without a schema", () => {
  assert.equal(contentSchemaDocument(undefined, "Rendered"), undefined);
});

test("nameNestedSchemas turns parser ids into $id so nested models keep their names", () => {
  // Modelina's JSON Schema path would otherwise name this after the property
  // holding it — `kind` -> `Kind`.
  const named = nameNestedSchemas({
    type: "object",
    properties: { kind: { type: "string", "x-parser-schema-id": "WidgetKindEnum" } },
  });

  assert.equal(named.properties.kind.$id, "WidgetKindEnum");
});

test("nameNestedSchemas leaves anonymous schemas and existing ids alone", () => {
  const named = nameNestedSchemas({
    properties: {
      anon: { "x-parser-schema-id": "<anonymous-schema-1>" },
      already: { $id: "Kept", "x-parser-schema-id": "Other" },
    },
  });

  assert.equal(named.properties.anon.$id, undefined);
  assert.equal(named.properties.already.$id, "Kept");
});

test("renderPayloadParser guards an optional payload and casts a required one", () => {
  const optional = renderPayloadParser({
    message: "Msg",
    property: "payload",
    component: "Rendered",
    required: false,
  });
  assert.match(optional, /export function parseMsgPayload\(message: Msg\): Rendered \| undefined/);
  assert.match(optional, /if \(message\.payload === undefined\) return undefined;/);

  const required = renderPayloadParser({
    message: "Msg",
    property: "payload",
    component: "Rendered",
    required: true,
  });
  assert.match(required, /export function parseMsgPayload\(message: Msg\): Rendered\b/);
  assert.doesNotMatch(required, /=== undefined/);
});

test("a message named after a TypeScript keyword reaches its renamed model", async () => {
  await withGenerated({ input: RESERVED_FIXTURE }, (read) => {
    const channel = read("channels/ImportChannel.ts");
    assert.ok(
      channel.includes('import type { ReservedImport } from "../models/ReservedImport";')
    );
    assert.ok(channel.includes("ReservedImport | Wrapper | ReservedInterface"));
  });
});

test("a payload parser keeps its message name and imports the renamed model", async () => {
  await withGenerated({ input: RESERVED_FIXTURE }, (read) => {
    // The function is the export a consumer imports: naming it after the model
    // would move `parseImportPayload` to `parseReservedImportPayload`.
    const parser = read("payloads/parseImportPayload.ts");
    assert.ok(parser.includes("export function parseImportPayload(message: ReservedImport)"));
    assert.ok(parser.includes("import type {ReservedImport} from '../models/ReservedImport';"));
  });
});

test("a contentSchema leaves a component the message pass already emitted alone", async () => {
  await withGenerated({ input: RESERVED_FIXTURE }, (read) => {
    // `Interface` is emitted as `ReservedInterface`, so matching the document's
    // own name against the emitted ones would miss it and overwrite the model
    // with a second reading of the same component.
    assert.ok(!read("index.ts").includes("models/Nested"));
    assert.ok(read("models/ReservedInterface.ts").includes("marker: string;"));
  });
});

test("renderPayloadParser names the function after the message, not the model", () => {
  const source = renderPayloadParser({
    message: "Import",
    property: "payload",
    component: "Rendered",
    required: true,
    messageModel: "ReservedImport",
  });

  assert.match(source, /export function parseImportPayload\(message: ReservedImport\)/);
  assert.match(source, /import type \{ReservedImport\} from '\.\.\/models\/ReservedImport';/);
});

test("generateOne emits models and a parser for a contentSchema payload", async () => {
  await withGenerated({}, async (read) => {
    // Modelina walks message payloads only, so without the second pass these
    // components reach no client at all.
    assert.match(read("models/WidgetRendered.ts"), /interface WidgetRendered/);
    assert.match(read("models/WidgetRendered.ts"), /renderedAt/);
    // Named from the parser id rather than from the property that holds it.
    assert.match(read("models/WidgetKindEnum.ts"), /chart/);

    const parser = read("payloads/parseWidgetStatusMessagePayload.ts");
    assert.match(parser, /JSON\.parse\(message\.payload as string\) as WidgetRendered/);
    assert.match(parser, /WidgetRendered \| undefined/);

    assert.match(
      read("index.ts"),
      /export \* from ".\/payloads\/parseWidgetStatusMessagePayload";/
    );
  });
});
