// Type declarations for the plain-JS cable client generator, so TS consumers
// get a typed public API.

export type CablePreset = "vue" | "react";

/**
 * How an enum is emitted: a TypeScript `enum` (default) or a string literal
 * union. Union members are assignable to the literal union an OpenAPI client
 * generates for the same component; enum members, being nominal, are not.
 */
export type CableEnumType = "enum" | "union";

export interface CableMutator {
  path: string;
  name: string;
}

export interface CableTarget {
  /** Path to a local AsyncAPI 3.0 document, or an http(s) URL to fetch it from. */
  input: string;
  output: {
    target: string;
    cable?: CableMutator;
    preset?: CablePreset;
    enumType?: CableEnumType;
  };
}

export type CableConfig = Record<string, CableTarget>;

export interface AsyncapiDocumentJson {
  components?: { schemas?: Record<string, unknown> };
  [key: string]: unknown;
}

export interface ChannelParametersJson {
  parameters?: Record<
    string,
    { "x-client-supplied"?: boolean; [key: string]: unknown }
  >;
  [key: string]: unknown;
}

export function isRemoteInput(input: string): boolean;
export function stripConditionals<T extends AsyncapiDocumentJson>(json: T): T;
export function dedupeUnions(source: string): string;
export function tidyModelSource(
  source: string,
  options?: { typeOnlyImports?: boolean }
): string;
export function matchModelName(
  name: string,
  modelNames: string[]
): string | undefined;
export function clientParamsType(channelJson: ChannelParametersJson): string;

export interface ContentSchemaTarget {
  /** Component whose property carries the JSON string. */
  message: string;
  /** Property name on that component (typically `payload`). */
  property: string;
  /** Component describing the decoded value. */
  component: string;
  required: boolean;
  /** The inlined `contentSchema` subtree. */
  schema: Record<string, unknown>;
}

export function contentSchemaTargets(
  documentJson: AsyncapiDocumentJson
): ContentSchemaTarget[];
export function refName(pointer: string | undefined): string | undefined;
export function contentSchemaDocument(
  schema: Record<string, unknown> | undefined,
  componentName: string
): Record<string, unknown> | undefined;
export function nameNestedSchemas<T>(node: T): T;
export function renderPayloadParser(
  target: Omit<ContentSchemaTarget, "schema"> & {
    /** Model `message` was emitted as, when Modelina renamed it. */
    messageModel?: string;
    /** Model `component` was emitted as, when Modelina renamed it. */
    componentModel?: string;
  }
): string;

export function renderChannelClass(opts: {
  channelName: string;
  identifier: string;
  paramsType: string;
  messageNames: string[];
}): { className: string; dataType: string; paramsName: string; source: string };

export function renderComposable(opts: {
  channelName: string;
  className: string;
  dataType: string;
  paramsName: string;
  hasParams: boolean;
}): { composableName: string; source: string };

export function generateOne(opts: {
  input: string;
  outDir: string;
  cable?: CableMutator;
  preset?: CablePreset;
  enumType?: CableEnumType;
  cwd?: string;
}): Promise<void>;

export function generateAll(config: CableConfig, cwd?: string): Promise<void>;
