#!/usr/bin/env bun
/**
 * opentp-spec consistency checks:
 * - JSON Schemas load, declare draft-07 and the current version in `$id`, use only the keywords this
 *   validator implements (with values of the type the draft-07 meta-schema requires), keep `$id` and
 *   `$schema` at the root, never put validation keywords next to `$ref`, and every `$ref` resolves to
 *   a file name in schemas/ (no "/")
 * - every example file (`.yaml`/`.yml`) parses and matches its schema
 * - YAML code blocks in README.md and docs/ parse; full-file blocks match their schema, and a block
 *   directly preceded by `<!-- invalid: <expected error> -->` must fail with that error (fragments
 *   with the marker are skipped)
 *
 * This intentionally implements only the subset of JSON Schema used by opentp-spec. A schema that
 * uses anything else fails at load instead of being ignored.
 *
 * YAML is parsed with the npm `yaml` package (the parser of the reference CLI) with its defaults:
 * YAML 1.2 core schema, duplicate keys are errors, merge keys (`<<`) are plain keys.
 */

import * as path from "node:path";
import { parse } from "yaml";

type Ctx = { schemaName: string };

export type Schemas = Record<string, unknown>;

export type ValidationFailure = { file: string; errors: string[] };

export type ValidationResult = {
  ok: boolean;
  failures: ValidationFailure[];
  markdownBlocksExtracted: number;
  markdownBlocksValidated: number;
  markdownBlocksMarkedInvalid: number;
};

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";
const SCHEMA_ID_PREFIX = "https://opentp.dev/schemas/";

/** Tool files at a plan root (the reference CLI's settings); they are not plan files. */
const TOOL_FILES = new Set(["opentp.cli.yaml", "opentp.cli.yml"]);

const ANNOTATION_KEYWORDS = ["$schema", "$id", "$comment", "title", "description", "examples", "definitions"];
const VALIDATION_KEYWORDS = [
  "$ref",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "const",
  "enum",
  "type",
  "pattern",
  "minLength",
  "maxLength",
  "format",
  "required",
  "properties",
  "patternProperties",
  "additionalProperties",
  "minProperties",
  "maxProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
];
const SUPPORTED_KEYWORDS = new Set([...ANNOTATION_KEYWORDS, ...VALIDATION_KEYWORDS]);
/** Keywords allowed next to `$ref` (draft-07 ignores every sibling of `$ref`). */
const REF_SIBLINGS = new Set(["$ref", "description", "title", "$comment"]);
/** Keywords allowed only at the root of a schema file (a nested `$id` would change how `$ref`s resolve). */
const ROOT_ONLY_KEYWORDS = ["$schema", "$id"];
/**
 * Value checks for keywords whose value is not a schema (draft-07 meta-schema). `validate()` skips a
 * keyword whose value has another type, so such a value must fail at load instead.
 */
const KEYWORD_VALUE_RULES: Record<string, { ok: (value: unknown) => boolean; expected: string }> = {
  $schema: { ok: (v) => typeof v === "string", expected: "a string" },
  $id: { ok: (v) => typeof v === "string", expected: "a string" },
  $comment: { ok: (v) => typeof v === "string", expected: "a string" },
  title: { ok: (v) => typeof v === "string", expected: "a string" },
  description: { ok: (v) => typeof v === "string", expected: "a string" },
  examples: { ok: Array.isArray, expected: "an array" },
  minLength: { ok: isNonNegativeInteger, expected: "a non-negative integer" },
  maxLength: { ok: isNonNegativeInteger, expected: "a non-negative integer" },
  minItems: { ok: isNonNegativeInteger, expected: "a non-negative integer" },
  maxItems: { ok: isNonNegativeInteger, expected: "a non-negative integer" },
  minProperties: { ok: isNonNegativeInteger, expected: "a non-negative integer" },
  maxProperties: { ok: isNonNegativeInteger, expected: "a non-negative integer" },
  minimum: { ok: isNumber, expected: "a number" },
  maximum: { ok: isNumber, expected: "a number" },
  exclusiveMinimum: { ok: isNumber, expected: "a number" },
  exclusiveMaximum: { ok: isNumber, expected: "a number" },
  multipleOf: { ok: (v) => isNumber(v) && v > 0, expected: "a number greater than 0" },
  uniqueItems: { ok: (v) => typeof v === "boolean", expected: "a boolean" },
  required: {
    ok: (v) => Array.isArray(v) && v.every((k) => typeof k === "string") && new Set(v).size === v.length,
    expected: "an array of unique strings",
  },
  enum: { ok: Array.isArray, expected: "an array" },
};
const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(obj, key);
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return typeof value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",");
    return `{${entries}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

const regexCache = new Map<string, RegExp>();

/** Compiles a JSON Schema regex: ECMA-262 with the `u` flag, not anchored. Throws on invalid syntax. */
function compileRegex(source: string): RegExp {
  let re = regexCache.get(source);
  if (!re) {
    re = new RegExp(source, "u");
    regexCache.set(source, re);
  }
  return re;
}

// ---------------------------------------------------------------------------
// Formats (docs/semantics.md, "Formats")
// ---------------------------------------------------------------------------

function isDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

function isDateTime(value: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!m || !isDate(m[1] ?? "")) return false;
  const [hour, minute, second] = [Number(m[2]), Number(m[3]), Number(m[4])];
  if (hour > 23 || minute > 59 || second > 60) return false;
  if (m[5] !== undefined && (Number(m[5]) > 23 || Number(m[6]) > 59)) return false;
  return true;
}

function isIpv4(value: string): boolean {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value);
}

function isIpv6(value: string): boolean {
  let text = value;
  const lastColon = text.lastIndexOf(":");
  if (lastColon === -1) return false;
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    // An embedded IPv4 address takes the place of the last two groups
    if (!isIpv4(tail)) return false;
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const hex = /^[0-9A-Fa-f]{1,4}$/;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const halves = text.split("::");
  if (halves.length > 2) return false;
  if (halves.length === 2) {
    const all = [...groups(halves[0] ?? ""), ...groups(halves[1] ?? "")];
    return all.length <= 7 && all.every((g) => hex.test(g));
  }
  const all = groups(text);
  return all.length === 8 && all.every((g) => hex.test(g));
}

const FORMATS: Record<string, (value: string) => boolean> = {
  date: isDate,
  "date-time": isDateTime,
  email: (value) => /^[^@]+@[^@]+$/.test(value),
  uuid: (value) => /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(value),
  uri: (value) => /^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(value),
  ipv4: isIpv4,
  ipv6: isIpv6,
};

// ---------------------------------------------------------------------------
// Schema loading and checks
// ---------------------------------------------------------------------------

function resolveRef(schemas: Schemas, ctx: Ctx, ref: string): { ctx: Ctx; schema: unknown } {
  let schemaName: string;
  let pointer: string;

  if (ref.startsWith("#")) {
    schemaName = ctx.schemaName;
    pointer = ref;
  } else {
    const [filePart = "", frag = ""] = ref.split("#", 2);
    if (filePart.includes("://")) {
      throw new Error(`Remote refs are not supported: ${ref}`);
    }
    // Other engines resolve the file part against `$id`; only a bare file name means the same file there
    if (filePart.includes("/")) {
      throw new Error(`$ref ${JSON.stringify(ref)}: the file part must be a file name in schemas/ (no "/")`);
    }
    schemaName = filePart;
    pointer = `#${frag}`;
  }

  const base = schemas[schemaName];
  if (base === undefined) {
    throw new Error(`Missing schema file for $ref: ${ref}`);
  }

  if (pointer === "#" || pointer === "#/") {
    return { ctx: { schemaName }, schema: base };
  }

  if (!pointer.startsWith("#/")) {
    throw new Error(`Unsupported ref pointer: ${ref}`);
  }

  let cur: unknown = base;
  for (const rawPart of pointer.slice(2).split("/")) {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isPlainObject(cur) || !hasOwn(cur, part)) {
      throw new Error(`Unresolvable ref ${ref} at ${JSON.stringify(part)}`);
    }
    cur = cur[part];
  }

  return { ctx: { schemaName }, schema: cur };
}

function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Collects every construct in a schema that `validate()` would not apply as written. */
function checkSchemaNode(
  node: unknown,
  where: string,
  ctx: Ctx,
  schemas: Schemas,
  problems: string[],
  isRoot = false,
): void {
  if (typeof node === "boolean") return;
  if (!isPlainObject(node)) {
    problems.push(`${where}: a schema must be an object or a boolean`);
    return;
  }

  for (const key of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      problems.push(`${where}: unsupported keyword ${JSON.stringify(key)}`);
    }
  }

  if (!isRoot) {
    for (const key of ROOT_ONLY_KEYWORDS) {
      if (key in node) problems.push(`${where}: ${key} is allowed only at the root of a schema file`);
    }
  }

  for (const [key, rule] of Object.entries(KEYWORD_VALUE_RULES)) {
    if (key in node && !rule.ok(node[key])) {
      problems.push(`${where}: ${key} must be ${rule.expected}`);
    }
  }

  if ("$ref" in node) {
    if (typeof node.$ref !== "string") {
      problems.push(`${where}: $ref must be a string`);
    } else {
      for (const key of Object.keys(node)) {
        if (!REF_SIBLINGS.has(key)) {
          problems.push(`${where}: ${JSON.stringify(key)} next to $ref is ignored (draft-07); wrap it in allOf`);
        }
      }
      try {
        resolveRef(schemas, ctx, node.$ref);
      } catch (e) {
        problems.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if ("type" in node && !(typeof node.type === "string" && TYPES.has(node.type))) {
    problems.push(`${where}: type must be a single string (one of ${[...TYPES].join(", ")})`);
  }

  if ("pattern" in node) {
    if (typeof node.pattern !== "string") {
      problems.push(`${where}: pattern must be a string`);
    } else {
      try {
        compileRegex(node.pattern);
      } catch (e) {
        problems.push(`${where}: invalid pattern ${JSON.stringify(node.pattern)}: ${String(e)}`);
      }
    }
  }

  if ("format" in node && !(typeof node.format === "string" && hasOwn(FORMATS, node.format))) {
    problems.push(`${where}: format ${JSON.stringify(node.format)} is not implemented`);
  }

  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (!(key in node)) continue;
    const subs = node[key];
    if (!Array.isArray(subs) || subs.length === 0) {
      problems.push(`${where}: ${key} must be a non-empty array of schemas`);
      continue;
    }
    for (let i = 0; i < subs.length; i += 1) {
      checkSchemaNode(subs[i], `${where}/${key}/${i}`, ctx, schemas, problems);
    }
  }

  for (const key of ["not", "items", "additionalProperties"]) {
    if (!(key in node)) continue;
    if (key === "items" && Array.isArray(node.items)) {
      problems.push(`${where}: tuple items (an array) are not supported`);
      continue;
    }
    checkSchemaNode(node[key], `${where}/${key}`, ctx, schemas, problems);
  }

  for (const key of ["properties", "patternProperties", "definitions"]) {
    if (!(key in node)) continue;
    const map = node[key];
    if (!isPlainObject(map)) {
      problems.push(`${where}: ${key} must be an object`);
      continue;
    }
    for (const [name, sub] of Object.entries(map)) {
      if (key === "patternProperties") {
        try {
          compileRegex(name);
        } catch (e) {
          problems.push(`${where}/patternProperties: invalid pattern ${JSON.stringify(name)}: ${String(e)}`);
        }
      }
      checkSchemaNode(sub, `${where}/${key}/${escapePointer(name)}`, ctx, schemas, problems);
    }
  }
}

/**
 * Checks every loaded schema: draft-07, `$id` on the version pinned by `version.schema.json`, only
 * implemented keywords, no `$ref` siblings, resolvable `$ref`s. Throws with the list of problems.
 */
export function checkSchemas(schemas: Schemas): void {
  const problems: string[] = [];

  const versionSchema = schemas["version.schema.json"];
  const version = isPlainObject(versionSchema) ? versionSchema.const : undefined;
  if (typeof version !== "string") {
    problems.push('version.schema.json: "const" must pin the spec version');
  }

  for (const [name, schema] of Object.entries(schemas)) {
    if (!isPlainObject(schema)) {
      problems.push(`${name}: the root must be an object`);
      continue;
    }
    if (schema.$schema !== DRAFT_07) {
      problems.push(`${name}: $schema must be ${JSON.stringify(DRAFT_07)}`);
    }
    if (typeof version === "string" && schema.$id !== `${SCHEMA_ID_PREFIX}${version}/${name}`) {
      problems.push(`${name}: $id must be ${JSON.stringify(`${SCHEMA_ID_PREFIX}${version}/${name}`)}`);
    }
    checkSchemaNode(schema, `${name}#`, { schemaName: name }, schemas, problems, true);
  }

  if (problems.length > 0) {
    throw new Error(
      `FAIL: schemas use constructs the validator does not apply:\n${problems.map((p) => ` - ${p}`).join("\n")}`,
    );
  }
}

/** Loads every `schemas/*.json` (keyed by basename) and checks it with `checkSchemas`. */
export async function loadSchemas(schemasDir: string): Promise<Schemas> {
  const schemas: Schemas = {};
  for (const name of await listFiles("*.json", schemasDir)) {
    const filePath = path.join(schemasDir, name);
    try {
      schemas[name] = JSON.parse(await Bun.file(filePath).text()) as unknown;
    } catch (e) {
      throw new Error(`FAIL: cannot parse JSON schema: ${filePath} (${String(e)})`);
    }
  }
  checkSchemas(schemas);
  return schemas;
}

// ---------------------------------------------------------------------------
// Validation (JSON Schema subset)
// ---------------------------------------------------------------------------

function describe(schema: Record<string, unknown>): string | null {
  return typeof schema.description === "string" ? schema.description : null;
}

function validate(instance: unknown, schema: unknown, instancePath: string, ctx: Ctx, schemas: Schemas): string[] {
  if (schema === true) return [];
  if (schema === false) return [`${instancePath}: not allowed`];
  if (!isPlainObject(schema)) return [];

  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schemas, ctx, schema.$ref);
    return validate(instance, resolved.schema, instancePath, resolved.ctx, schemas);
  }

  const errors: string[] = [];

  // Combinators
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      errors.push(...validate(instance, sub, instancePath, ctx, schemas));
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((sub) => validate(instance, sub, instancePath, ctx, schemas).length === 0);
    if (!ok) {
      const description = describe(schema);
      errors.push(`${instancePath}: anyOf failed${description ? ` (${description})` : ""}`);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    let okCount = 0;
    let closest: string[] | null = null;
    for (const sub of schema.oneOf) {
      const branchErrors = validate(instance, sub, instancePath, ctx, schemas);
      if (branchErrors.length === 0) okCount += 1;
      else if (closest === null || branchErrors.length < closest.length) closest = branchErrors;
    }
    if (okCount !== 1) {
      errors.push(`${instancePath}: oneOf expected exactly 1 match, got ${okCount}`);
      // With no match, the branch with the fewest errors is most likely the intended one
      if (okCount === 0 && closest !== null) errors.push(...closest);
    }
  }

  if (schema.not !== undefined) {
    if (validate(instance, schema.not, instancePath, ctx, schemas).length === 0) {
      // `{ "not": {} }` forbids a key outright; another `not` states a rule (its description says which)
      const description = describe(schema);
      const alwaysMatches = schema.not === true || (isPlainObject(schema.not) && Object.keys(schema.not).length === 0);
      if (alwaysMatches) {
        errors.push(`${instancePath}: not allowed${description ? ` (${description})` : ""}`);
      } else {
        errors.push(`${instancePath}: ${description ?? "not schema matched but must not"}`);
      }
    }
  }

  // Basic constraints
  if ("const" in schema && !deepEqual(instance, schema.const)) {
    errors.push(`${instancePath}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((member) => deepEqual(instance, member))) {
    errors.push(`${instancePath}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(instance)}`);
  }

  if (typeof schema.type === "string") {
    const expected = schema.type;
    let okType = true;

    if (expected === "object") okType = isPlainObject(instance);
    else if (expected === "array") okType = Array.isArray(instance);
    else if (expected === "string") okType = typeof instance === "string";
    else if (expected === "number") okType = isNumber(instance);
    else if (expected === "integer") okType = isInteger(instance);
    else if (expected === "boolean") okType = typeof instance === "boolean";
    else if (expected === "null") okType = instance === null;

    if (!okType) {
      errors.push(`${instancePath}: expected type ${expected}, got ${typeName(instance)}`);
      return errors;
    }
  }

  // Strings (lengths in Unicode code points)
  if (typeof instance === "string") {
    if (typeof schema.pattern === "string" && !compileRegex(schema.pattern).test(instance)) {
      errors.push(`${instancePath}: string does not match pattern ${JSON.stringify(schema.pattern)}`);
    }

    const length = Array.from(instance).length;
    if (typeof schema.minLength === "number" && length < schema.minLength) {
      errors.push(`${instancePath}: expected string length >= ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && length > schema.maxLength) {
      errors.push(`${instancePath}: expected string length <= ${schema.maxLength}`);
    }

    if (typeof schema.format === "string") {
      const check = FORMATS[schema.format];
      if (check && !check(instance)) {
        errors.push(`${instancePath}: expected format ${schema.format}, got ${JSON.stringify(instance)}`);
      }
    }
  }

  // Objects
  if (isPlainObject(instance)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !hasOwn(instance, key)) {
          errors.push(`${instancePath}: missing required property ${JSON.stringify(key)}`);
        }
      }
    }

    const props = isPlainObject(schema.properties) ? schema.properties : {};
    const patterns = isPlainObject(schema.patternProperties)
      ? Object.entries(schema.patternProperties).map(([source, sub]) => [compileRegex(source), sub] as const)
      : [];
    const additional = schema.additionalProperties;

    for (const [key, value] of Object.entries(instance)) {
      const childPath = `${instancePath}.${key}`;
      let matched = false;

      if (hasOwn(props, key)) {
        matched = true;
        errors.push(...validate(value, props[key], childPath, ctx, schemas));
      }
      for (const [re, sub] of patterns) {
        if (re.test(key)) {
          matched = true;
          errors.push(...validate(value, sub, childPath, ctx, schemas));
        }
      }

      if (!matched && additional !== undefined) {
        if (additional === false) {
          errors.push(`${instancePath}: additional property not allowed: ${JSON.stringify(key)}`);
        } else {
          errors.push(...validate(value, additional, childPath, ctx, schemas));
        }
      }
    }

    const count = Object.keys(instance).length;
    if (typeof schema.minProperties === "number" && count < schema.minProperties) {
      errors.push(`${instancePath}: expected at least ${schema.minProperties} properties`);
    }
    if (typeof schema.maxProperties === "number" && count > schema.maxProperties) {
      errors.push(`${instancePath}: expected at most ${schema.maxProperties} properties`);
    }
  }

  // Arrays
  if (Array.isArray(instance)) {
    if (typeof schema.minItems === "number" && instance.length < schema.minItems) {
      errors.push(`${instancePath}: expected at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && instance.length > schema.maxItems) {
      errors.push(`${instancePath}: expected at most ${schema.maxItems} items`);
    }

    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (const item of instance) {
        const key = stableStringify(item);
        if (seen.has(key)) {
          errors.push(`${instancePath}: duplicate item ${JSON.stringify(item)}`);
          break;
        }
        seen.add(key);
      }
    }

    if (schema.items !== undefined) {
      for (let i = 0; i < instance.length; i += 1) {
        errors.push(...validate(instance[i], schema.items, `${instancePath}[${i}]`, ctx, schemas));
      }
    }
  }

  // Numbers
  if (isNumber(instance)) {
    if (typeof schema.minimum === "number" && instance < schema.minimum) {
      errors.push(`${instancePath}: expected >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && instance > schema.maximum) {
      errors.push(`${instancePath}: expected <= ${schema.maximum}`);
    }
    if (typeof schema.exclusiveMinimum === "number" && instance <= schema.exclusiveMinimum) {
      errors.push(`${instancePath}: expected > ${schema.exclusiveMinimum}`);
    }
    if (typeof schema.exclusiveMaximum === "number" && instance >= schema.exclusiveMaximum) {
      errors.push(`${instancePath}: expected < ${schema.exclusiveMaximum}`);
    }

    if (typeof schema.multipleOf === "number") {
      const m = schema.multipleOf;
      if (!(Number.isFinite(m) && m > 0)) {
        errors.push(`${instancePath}: invalid multipleOf ${JSON.stringify(m)}`);
      } else {
        const q = instance / m;
        // Best-effort float safety for cases like 0.3 / 0.1
        if (!Number.isFinite(q) || Math.abs(q - Math.round(q)) > 1e-12) {
          errors.push(`${instancePath}: expected multipleOf ${m}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Validates one node against a schema reference such as `field.schema.json` or
 * `opentp.schema.json#/definitions/taxonomyField` (useful for checking doc fragments by hand).
 */
export function validateNode(instance: unknown, ref: string, schemas: Schemas, instancePath = "root"): string[] {
  const resolved = resolveRef(schemas, { schemaName: ref.split("#", 1)[0] ?? "" }, ref);
  return validate(instance, resolved.schema, instancePath, resolved.ctx, schemas);
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function pickSchema(doc: unknown, filename: string): string | null {
  if (filename === "opentp.yaml" || filename === "opentp.yml") return "opentp.schema.json";
  if (!isPlainObject(doc)) return null;
  if ("opentp" in doc && "info" in doc && "spec" in doc) return "opentp.schema.json";
  if ("opentp" in doc && "event" in doc) return "event.schema.json";
  if ("opentp" in doc && "dict" in doc) return "dict.schema.json";
  return null;
}

/** Parses YAML like the reference CLI: YAML 1.2 core schema, unique keys, no merge keys. Throws on errors. */
export function parseYaml(text: string): unknown {
  return parse(text);
}

async function listFiles(pattern: string, cwd: string): Promise<string[]> {
  const out: string[] = [];
  for await (const file of new Bun.Glob(pattern).scan({ cwd, onlyFiles: true })) {
    out.push(file);
  }
  out.sort();
  return out;
}

/** The text of an `<!-- invalid: ... -->` comment that directly precedes a fence (only whitespace between). */
function invalidMarker(textBeforeFence: string): string | null {
  const start = textBeforeFence.lastIndexOf("<!--");
  if (start === -1) return null;
  const m = /^<!--\s*invalid:\s*([\s\S]*?)\s*-->\s*$/.exec(textBeforeFence.slice(start));
  return m ? (m[1] ?? "") : null;
}

export async function validateRepo(repoRoot: string): Promise<ValidationResult> {
  const schemas = await loadSchemas(path.join(repoRoot, "schemas"));
  const failures: ValidationFailure[] = [];

  // Validate examples (tool files such as opentp.cli.yaml are not plan files)
  const examplesDir = path.join(repoRoot, "examples");
  const exampleFiles = (await listFiles("**/*.{yaml,yml}", examplesDir)).filter(
    (relative) => !TOOL_FILES.has(path.basename(relative)),
  );
  for (const relative of exampleFiles) {
    const filePath = path.join(examplesDir, relative);
    let doc: unknown;
    try {
      doc = parseYaml(await Bun.file(filePath).text());
    } catch (e) {
      failures.push({ file: filePath, errors: [`YAML parse error: ${String(e)}`] });
      continue;
    }

    const schemaName = pickSchema(doc, path.basename(filePath));
    if (!schemaName) {
      failures.push({ file: filePath, errors: ["Cannot decide schema for this YAML file"] });
      continue;
    }

    const errs = validate(doc, schemas[schemaName], "root", { schemaName }, schemas);
    if (errs.length > 0) failures.push({ file: filePath, errors: errs });
  }

  // Validate YAML code blocks in docs/README: full files must match (or fail as marked)
  const docsDir = path.join(repoRoot, "docs");
  const mdFiles = [
    path.join(repoRoot, "README.md"),
    ...(await listFiles("**/*.md", docsDir)).map((p) => path.join(docsDir, p)),
  ];
  const fenceRe = /```ya?ml\r?\n([\s\S]*?)\r?\n```/g;
  let markdownBlocksExtracted = 0;
  let markdownBlocksValidated = 0;
  let markdownBlocksMarkedInvalid = 0;

  for (const mdPath of mdFiles) {
    const text = await Bun.file(mdPath).text();
    const hasYamlFenceMarkers = text.includes("```yaml") || text.includes("```yml");
    const matches = Array.from(text.matchAll(fenceRe));

    if (hasYamlFenceMarkers && matches.length === 0) {
      throw new Error(
        `FAIL: Found YAML fence markers in ${mdPath} but could not extract any YAML code blocks. ` +
          "This likely indicates a broken markdown fence regex.",
      );
    }

    markdownBlocksExtracted += matches.length;

    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i];
      const block = match?.[1] ?? "";
      const label = `YAML code block #${i + 1}`;
      const expected = invalidMarker(text.slice(0, match?.index ?? 0));
      if (expected !== null) markdownBlocksMarkedInvalid += 1;

      let doc: unknown;
      try {
        doc = parseYaml(block);
      } catch (e) {
        if (expected !== null && String(e).includes(expected)) continue;
        failures.push({ file: mdPath, errors: [`${label} parse error: ${String(e)}`] });
        continue;
      }

      const schemaName = pickSchema(doc, "");
      if (!schemaName) continue; // a fragment: parsed only (checked by hand; see AGENTS.md)
      markdownBlocksValidated += 1;

      const errs = validate(doc, schemas[schemaName], "root", { schemaName }, schemas);
      if (expected === null) {
        if (errs.length > 0) {
          failures.push({ file: mdPath, errors: [`${label} does not match ${schemaName}`, ...errs] });
        }
      } else if (errs.length === 0) {
        failures.push({ file: mdPath, errors: [`${label} is marked invalid but matches ${schemaName}`] });
      } else if (!errs.some((e) => e.includes(expected))) {
        failures.push({
          file: mdPath,
          errors: [`${label} is marked invalid with ${JSON.stringify(expected)}, but fails with other errors`, ...errs],
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    markdownBlocksExtracted,
    markdownBlocksValidated,
    markdownBlocksMarkedInvalid,
  };
}

async function main(): Promise<number> {
  const repoRoot = path.resolve(import.meta.dir, ".."); // opentp-spec/

  const result = await validateRepo(repoRoot);
  if (!result.ok) {
    console.log(`FAILURES: ${result.failures.length}`);
    for (const failure of result.failures) {
      console.log(`\n== ${failure.file}`);
      const errs = failure.errors;
      for (const e of errs.slice(0, 50)) {
        console.log(` - ${e}`);
      }
      if (errs.length > 50) {
        console.log(` ... ${errs.length - 50} more`);
      }
    }
    return 1;
  }

  console.log(
    `INFO: extracted ${result.markdownBlocksExtracted} YAML code blocks from markdown; validated ${result.markdownBlocksValidated} as full files; ${result.markdownBlocksMarkedInvalid} marked invalid.`,
  );
  console.log("OK: schemas load; examples and docs YAML blocks match schemas (subset validator).");
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(await main());
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
