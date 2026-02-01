#!/usr/bin/env bun
/**
 * opentp-spec consistency checks:
 * - JSON schemas parse and local $ref targets exist
 * - YAML examples parse and structurally match schemas (subset validator)
 * - YAML code blocks in docs/README parse and (when representing full files) match schemas
 *
 * This intentionally implements only the subset of JSON Schema used by opentp-spec.
 *
 * Note on YAML parsing:
 * Bun.YAML.parse currently mis-parses unquoted scalars like "2026-01" as a number (2026).
 * The spec uses YYYY-MM strings for `opentp`, so we patch that scalar before parsing.
 */

import * as path from "node:path";

type Ctx = { schemaName: string };

export type ValidationFailure = { file: string; errors: string[] };

export type ValidationResult = {
  ok: boolean;
  failures: ValidationFailure[];
  markdownBlocksExtracted: number;
  markdownBlocksValidated: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
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

async function readJson(filePath: string): Promise<unknown> {
  const text = await Bun.file(filePath).text();
  return JSON.parse(text) as unknown;
}

function walkJson(value: unknown): unknown[] {
  const stack: unknown[] = [value];
  const out: unknown[] = [];

  while (stack.length > 0) {
    const cur = stack.pop();
    out.push(cur);

    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
    } else if (isPlainObject(cur)) {
      for (const v of Object.values(cur)) stack.push(v);
    }
  }

  return out;
}

function resolveRef(
  schemas: Record<string, unknown>,
  ctx: Ctx,
  rootSchema: unknown,
  ref: string,
): { ctx: Ctx; schema: unknown } {
  let base: unknown;
  let schemaName: string;
  let pointer: string;

  if (ref.startsWith("#")) {
    base = rootSchema;
    schemaName = ctx.schemaName;
    pointer = ref;
  } else {
    const [filePart, frag = ""] = ref.split("#", 2);
    if (filePart.includes("://")) {
      throw new Error(`Remote refs are not supported: ${ref}`);
    }

    schemaName = path.basename(filePart);
    const schema = schemas[schemaName];
    if (!schema) {
      throw new Error(`Missing schema file for $ref: ${ref}`);
    }
    base = schema;
    pointer = frag ? `#${frag}` : "#";
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
    if (!isPlainObject(cur) || !(part in cur)) {
      throw new Error(`Unresolvable ref ${ref} at ${JSON.stringify(part)}`);
    }
    cur = cur[part];
  }

  return { ctx: { schemaName }, schema: cur };
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "boolean") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const entries = keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",");
    return `{${entries}}`;
  }

  return JSON.stringify(value);
}

function validate(
  instance: unknown,
  schema: unknown,
  instancePath: string,
  ctx: Ctx,
  schemas: Record<string, unknown>,
): string[] {
  if (isPlainObject(schema) && typeof schema.$ref === "string") {
    const ref = schema.$ref;
    try {
      const rootSchema = schemas[ctx.schemaName];
      if (!rootSchema) return [`${instancePath}: $ref ${ref} resolve error: missing root schema`];
      const resolved = resolveRef(schemas, ctx, rootSchema, ref);
      return validate(instance, resolved.schema, instancePath, resolved.ctx, schemas);
    } catch (e) {
      return [`${instancePath}: $ref ${ref} resolve error: ${String(e)}`];
    }
  }

  if (!isPlainObject(schema)) return [];

  const errors: string[] = [];

  // Combinators
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      errors.push(...validate(instance, sub, instancePath, ctx, schemas));
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((sub) => validate(instance, sub, instancePath, ctx, schemas).length === 0);
    if (!ok) errors.push(`${instancePath}: anyOf failed`);
  }

  if (Array.isArray(schema.oneOf)) {
    let okCount = 0;
    for (const sub of schema.oneOf) {
      if (validate(instance, sub, instancePath, ctx, schemas).length === 0) okCount += 1;
    }
    if (okCount !== 1) {
      errors.push(`${instancePath}: oneOf expected exactly 1 match, got ${okCount}`);
    }
  }

  if (schema.not !== undefined) {
    if (validate(instance, schema.not, instancePath, ctx, schemas).length === 0) {
      errors.push(`${instancePath}: not schema matched but must not`);
    }
  }

  // Basic constraints
  if ("const" in schema && instance !== schema.const) {
    errors.push(
      `${instancePath}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`,
    );
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(instance)) {
    errors.push(
      `${instancePath}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(instance)}`,
    );
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

  if (typeof schema.pattern === "string" && typeof instance === "string") {
    try {
      const re = new RegExp(schema.pattern);
      if (!re.test(instance)) {
        errors.push(`${instancePath}: string does not match pattern ${JSON.stringify(schema.pattern)}`);
      }
    } catch (e) {
      errors.push(`${instancePath}: invalid regex pattern ${JSON.stringify(schema.pattern)}: ${String(e)}`);
    }
  }

  if (typeof instance === "string") {
    if (typeof schema.minLength === "number") {
      if (instance.length < schema.minLength) {
        errors.push(`${instancePath}: expected string length >= ${schema.minLength}`);
      }
    }
    if (typeof schema.maxLength === "number") {
      if (instance.length > schema.maxLength) {
        errors.push(`${instancePath}: expected string length <= ${schema.maxLength}`);
      }
    }
  }

  // Objects
  if (isPlainObject(instance)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key !== "string") continue;
        if (!Object.prototype.hasOwnProperty.call(instance, key)) {
          errors.push(`${instancePath}: missing required property ${JSON.stringify(key)}`);
        }
      }
    }

    const props = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [k, subSchema] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(instance, k)) {
        errors.push(...validate(instance[k], subSchema, `${instancePath}.${k}`, ctx, schemas));
      }
    }

    const additional = schema.additionalProperties ?? true;
    if (additional === false) {
      const allowed = new Set(Object.keys(props));
      for (const k of Object.keys(instance)) {
        if (!allowed.has(k)) {
          errors.push(`${instancePath}: additional property not allowed: ${JSON.stringify(k)}`);
        }
      }
    } else if (isPlainObject(additional)) {
      for (const k of Object.keys(instance)) {
        if (k in props) continue;
        errors.push(...validate(instance[k], additional, `${instancePath}.${k}`, ctx, schemas));
      }
    }

    if (typeof schema.minProperties === "number") {
      if (Object.keys(instance).length < schema.minProperties) {
        errors.push(`${instancePath}: expected at least ${schema.minProperties} properties`);
      }
    }
    if (typeof schema.maxProperties === "number") {
      if (Object.keys(instance).length > schema.maxProperties) {
        errors.push(`${instancePath}: expected at most ${schema.maxProperties} properties`);
      }
    }
  }

  // Arrays
  if (Array.isArray(instance)) {
    if (typeof schema.minItems === "number") {
      if (instance.length < schema.minItems) {
        errors.push(`${instancePath}: expected at least ${schema.minItems} items`);
      }
    }
    if (typeof schema.maxItems === "number") {
      if (instance.length > schema.maxItems) {
        errors.push(`${instancePath}: expected at most ${schema.maxItems} items`);
      }
    }

    if (schema.uniqueItems) {
      try {
        const seen = new Set<string>();
        for (const item of instance) {
          const key = stableStringify(item);
          if (seen.has(key)) {
            errors.push(`${instancePath}: duplicate item ${JSON.stringify(item)}`);
            break;
          }
          seen.add(key);
        }
      } catch {
        // ignore (best-effort)
      }
    }

    if (schema.items !== undefined) {
      for (let i = 0; i < instance.length; i += 1) {
        errors.push(...validate(instance[i], schema.items, `${instancePath}[${i}]`, ctx, schemas));
      }
    }
  }

  // Number/integer bounds
  if (isNumber(instance)) {
    if (typeof schema.minimum === "number") {
      if (instance < schema.minimum) {
        errors.push(`${instancePath}: expected >= ${schema.minimum}`);
      }
    }

    if (typeof schema.maximum === "number") {
      if (instance > schema.maximum) {
        errors.push(`${instancePath}: expected <= ${schema.maximum}`);
      }
    }

    if (typeof schema.exclusiveMinimum === "number") {
      if (instance <= schema.exclusiveMinimum) {
        errors.push(`${instancePath}: expected > ${schema.exclusiveMinimum}`);
      }
    }

    if (typeof schema.exclusiveMaximum === "number") {
      if (instance >= schema.exclusiveMaximum) {
        errors.push(`${instancePath}: expected < ${schema.exclusiveMaximum}`);
      }
    }

    if (typeof schema.multipleOf === "number") {
      const m = schema.multipleOf;
      if (!(Number.isFinite(m) && m > 0)) {
        errors.push(`${instancePath}: invalid multipleOf ${JSON.stringify(m)}`);
      } else {
        const q = instance / m;
        const rounded = Math.round(q);
        // Best-effort float safety for cases like 0.3 / 0.1
        if (!Number.isFinite(q) || Math.abs(q - rounded) > 1e-12) {
          errors.push(`${instancePath}: expected multipleOf ${m}`);
        }
      }
    }
  }

  return errors;
}

function pickSchema(doc: unknown, filename: string): string | null {
  if (filename === "opentp.yaml" || filename === "opentp.yml") return "opentp.schema.json";
  if (!isPlainObject(doc)) return null;
  if ("opentp" in doc && "info" in doc && "spec" in doc) return "opentp.schema.json";
  if ("opentp" in doc && "event" in doc) return "event.schema.json";
  if ("opentp" in doc && "dict" in doc) return "dict.schema.json";
  return null;
}

function patchYamlForBun(text: string): string {
  const lines = text.split(/\r?\n/);
  const patched = lines.map((line) =>
    line.replace(
      /^(\s*opentp:\s*)(\d{4}-\d{2})(\s*(#.*)?)$/,
      (_m, prefix: string, version: string, suffix: string) => `${prefix}"${version}"${suffix ?? ""}`,
    ),
  );
  return patched.join("\n");
}

export function parseYaml(text: string): unknown {
  return Bun.YAML.parse(patchYamlForBun(text));
}

async function listFiles(pattern: string, cwd: string): Promise<string[]> {
  const out: string[] = [];
  for await (const file of new Bun.Glob(pattern).scan({ cwd, onlyFiles: true })) {
    out.push(file);
  }
  out.sort();
  return out;
}

export async function validateRepo(repoRoot: string): Promise<ValidationResult> {
  const schemasDir = path.join(repoRoot, "schemas");

  // Load schemas
  const schemas: Record<string, unknown> = {};
  const schemaFiles = await listFiles("*.json", schemasDir);
  for (const name of schemaFiles) {
    const filePath = path.join(schemasDir, name);
    try {
      schemas[name] = await readJson(filePath);
    } catch (e) {
      throw new Error(`FAIL: cannot parse JSON schema: ${filePath} (${String(e)})`);
    }
  }

  // Check local $ref files exist
  // Note: This must match real ".json" in $ref values (not a literal "\\.json").
  const refFileRe = /\.json($|#)/;
  let refJsonHintCount = 0;
  let refCheckedCount = 0;

  for (const [schemaName, schema] of Object.entries(schemas)) {
    for (const node of walkJson(schema)) {
      if (!isPlainObject(node)) continue;
      const ref = node.$ref;
      if (typeof ref === "string") {
        if (ref.includes(".json")) refJsonHintCount += 1;
      }
      if (!(typeof ref === "string" && refFileRe.test(ref))) continue;

      const refFile = ref.split("#", 1)[0] ?? "";
      if (refFile.includes("://") || refFile === "") continue;

      refCheckedCount += 1;
      const targetPath = path.join(schemasDir, refFile);
      if (!(await Bun.file(targetPath).exists())) {
        throw new Error(`FAIL: missing $ref target: ${schemaName} -> ${ref}`);
      }
    }
  }

  if (refJsonHintCount > 0 && refCheckedCount === 0) {
    throw new Error(
      "FAIL: schemas contain '$ref' values pointing to .json files, but no file $ref targets were checked. " +
        "This likely indicates a broken $ref regex or ref-check logic.",
    );
  }

  const failures: ValidationFailure[] = [];

  // Validate examples
  const examplesDir = path.join(repoRoot, "examples");
  const exampleFiles = await listFiles("**/*.yaml", examplesDir);
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

  // Validate YAML code blocks in docs/README that look like full files
  const mdFiles = [path.join(repoRoot, "README.md"), ...(await listFiles("**/*.md", path.join(repoRoot, "docs"))).map((p) => path.join(repoRoot, "docs", p))];
  const fenceRe = /```ya?ml\r?\n([\s\S]*?)\r?\n```/g;
  let markdownBlocksExtracted = 0;
  let markdownBlocksValidated = 0;

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
      const block = matches[i]?.[1] ?? "";
      let doc: unknown;
      try {
        doc = parseYaml(block);
      } catch (e) {
        failures.push({ file: mdPath, errors: [`YAML code block #${i + 1} parse error: ${String(e)}`] });
        continue;
      }

      const schemaName = pickSchema(doc, "");
      if (!schemaName) continue;
      markdownBlocksValidated += 1;

      const errs = validate(doc, schemas[schemaName], "root", { schemaName }, schemas);
      if (errs.length > 0) {
        failures.push({
          file: mdPath,
          errors: [`YAML code block #${i + 1} does not match ${schemaName}`, ...errs],
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    markdownBlocksExtracted,
    markdownBlocksValidated,
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
    `INFO: extracted ${result.markdownBlocksExtracted} YAML code blocks from markdown; validated ${result.markdownBlocksValidated} as full files.`,
  );
  console.log("OK: schemas parse; examples and docs YAML blocks match schemas (subset validator).");
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(await main());
  } catch (e) {
    console.error(String(e));
    process.exit(1);
  }
}
