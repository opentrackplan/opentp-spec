import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { checkSchemas, parseYaml, type Schemas, type ValidationResult, validateNode, validateRepo } from "./validate";

const repoRoot = path.resolve(import.meta.dir, "..");
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** Copies everything validateRepo reads into a temporary directory. */
function copyRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "opentp-spec-test-"));
  tempDirs.push(dir);
  for (const entry of ["schemas", "examples", "docs", "README.md"]) {
    cpSync(path.join(repoRoot, entry), path.join(dir, entry), { recursive: true });
  }
  return dir;
}

/** Replaces text in a copied file; throws when the text is missing, so no test passes vacuously. */
function edit(root: string, file: string, from: string, to: string): void {
  const filePath = path.join(root, file);
  const text = readFileSync(filePath, "utf8");
  if (!text.includes(from)) throw new Error(`${file} does not contain ${JSON.stringify(from)}`);
  writeFileSync(filePath, text.replace(from, to));
}

function errorsOf(result: ValidationResult): string {
  return result.failures.flatMap((f) => [`== ${f.file}`, ...f.errors]).join("\n");
}

async function validateEdited(file: string, from: string, to: string): Promise<ValidationResult> {
  const root = copyRepo();
  edit(root, file, from, to);
  return validateRepo(root);
}

const SIMPLE_PLAN = "examples/simple/opentp.yaml";
const SIMPLE_EVENT = "examples/simple/events/auth/login_click.yaml";
const EVENT_NAME_VALUE = "      event_name:\n        value: login_click\n";
const CATALOG_EVENT_NAME = "        event_name:\n          type: string\n";

describe("YAML parsing", () => {
  test("an unquoted opentp version is a string", () => {
    expect(parseYaml("opentp: 2026-09\n")).toEqual({ opentp: "2026-09" });
  });

  test("YAML 1.2 core scalars: yes/on and dates stay strings", () => {
    expect(parseYaml("a: yes\nb: on\nc: 2025-01-01\n")).toEqual({ a: "yes", b: "on", c: "2025-01-01" });
  });

  test("a duplicate key fails", () => {
    expect(() => parseYaml("a: 1\na: 2\n")).toThrow(/unique/);
  });

  test("<< stays a literal key", () => {
    expect(parseYaml("base: &b {type: string}\nfield:\n  <<: *b\n  title: T\n")).toEqual({
      base: { type: "string" },
      field: { "<<": { type: "string" }, title: "T" },
    });
  });
});

describe("repository", () => {
  test("schemas, examples and docs validate", async () => {
    const result = await validateRepo(repoRoot);
    if (!result.ok) throw new Error(`Validation failed:\n${errorsOf(result)}`);
    expect(result.markdownBlocksValidated).toBeGreaterThan(0);
  });
});

describe("negative cases (temporary copies)", () => {
  test("x-opentp is rejected", async () => {
    const result = await validateEdited(
      SIMPLE_EVENT,
      EVENT_NAME_VALUE,
      `${EVENT_NAME_VALUE}        x-opentp:\n          role: constant\n`,
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("event_name.x-opentp: not allowed (Removed in 2026-09");
  });

  test("x-opentp is rejected on spec.events", async () => {
    const result = await validateEdited(
      SIMPLE_PLAN,
      "    key:\n",
      '    x-opentp:\n      keygen:\n        template: "{area}::{event}"\n    key:\n',
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("root.spec.events.x-opentp: not allowed");
  });

  test("valueRequired is rejected", async () => {
    const result = await validateEdited(
      SIMPLE_PLAN,
      CATALOG_EVENT_NAME,
      `${CATALOG_EVENT_NAME}          valueRequired: true\n`,
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain('additional property not allowed: "valueRequired"');
  });

  test("enum: [] is rejected", async () => {
    const result = await validateEdited(
      SIMPLE_EVENT,
      "        required: true\n",
      "        required: true\n        enum: []\n",
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("auth_method.enum: expected at least 1 items");
  });

  test("policy in an event is rejected", async () => {
    const result = await validateEdited(SIMPLE_EVENT, EVENT_NAME_VALUE, `${EVENT_NAME_VALUE}        policy: fixed\n`);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("event_name.policy: not allowed (policy is set on catalog and common fields");
  });

  test("a catalog field without type is rejected", async () => {
    const result = await validateEdited(
      SIMPLE_PLAN,
      CATALOG_EVENT_NAME,
      "        event_name:\n          title: Event name\n",
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain('root.spec.events.payload.schema.event_name: missing required property "type"');
  });

  test("a catalog array field without items is rejected", async () => {
    const result = await validateEdited(SIMPLE_PLAN, CATALOG_EVENT_NAME, "        tags:\n          type: array\n");
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("an array field in the catalog needs items");
  });

  test("{ value, required: false } is rejected", async () => {
    const result = await validateEdited(SIMPLE_EVENT, EVENT_NAME_VALUE, `${EVENT_NAME_VALUE}        required: false\n`);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("required: false contradicts value");
  });

  test("{ policy: fixed, required: false } is rejected", async () => {
    const result = await validateEdited(
      SIMPLE_PLAN,
      CATALOG_EVENT_NAME,
      `${CATALOG_EVENT_NAME}          policy: fixed\n          required: false\n`,
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("required: false contradicts policy restricted or fixed");
  });

  test("opentp: 2026-01 is rejected", async () => {
    const result = await validateEdited(SIMPLE_PLAN, "opentp: 2026-09", "opentp: 2026-01");
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain('root.opentp: expected const "2026-09", got "2026-01"');
  });

  test("x-acme-team is accepted", async () => {
    const root = copyRepo();
    edit(root, SIMPLE_PLAN, "opentp: 2026-09\n", "opentp: 2026-09\nx-acme-team: analytics\n");
    edit(root, SIMPLE_PLAN, CATALOG_EVENT_NAME, `${CATALOG_EVENT_NAME}          x-acme-team: analytics\n`);
    edit(root, SIMPLE_EVENT, EVENT_NAME_VALUE, `${EVENT_NAME_VALUE}        x-acme-team: identity\n`);
    const result = await validateRepo(root);
    if (!result.ok) throw new Error(errorsOf(result));
    expect(result.ok).toBe(true);
  });

  test("a merge key (<<) in a field definition is rejected", async () => {
    const result = await validateEdited(
      "examples/full/opentp.yaml",
      "        dimension_3: *dim\n",
      "        dimension_3: *dim\n        dimension_4:\n          <<: *dim\n          title: Slot 4\n",
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain('additional property not allowed: "<<"');
  });

  test("a duplicate key in an example fails", async () => {
    const result = await validateEdited(
      SIMPLE_EVENT,
      "  key: auth::login_click\n",
      "  key: auth::login_click\n  key: auth::login\n",
    );
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("YAML parse error");
  });
});

describe("example files", () => {
  test(".yml files are validated", async () => {
    const root = copyRepo();
    writeFileSync(
      path.join(root, "examples/simple/events/auth/logout.yml"),
      "opentp: 2026-01\ndict:\n  type: string\n  values: [a]\n",
    );
    const result = await validateRepo(root);
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => path.basename(f.file))).toEqual(["logout.yml"]);
  });

  test("opentp.cli.yaml is skipped", async () => {
    const root = copyRepo();
    writeFileSync(
      path.join(root, "examples/simple/opentp.cli.yaml"),
      'opentp: 2026-09\nkeygen:\n  template: "{area}::{event}"\n',
    );
    const result = await validateRepo(root);
    if (!result.ok) throw new Error(errorsOf(result));
    expect(result.ok).toBe(true);
  });
});

describe("markdown blocks", () => {
  const emptyDict = "```yaml\nopentp: 2026-09\ndict:\n  type: string\n  values: []\n```\n";

  async function validateWithDoc(markdown: string): Promise<ValidationResult> {
    const root = copyRepo();
    writeFileSync(path.join(root, "docs/extra.md"), `# Extra\n\n${markdown}`);
    return validateRepo(root);
  }

  test("an invalid full file without a marker fails", async () => {
    const result = await validateWithDoc(emptyDict);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("does not match dict.schema.json");
  });

  test("a marked block that fails with the expected error passes", async () => {
    const result = await validateWithDoc(`<!-- invalid: expected at least 1 items -->\n${emptyDict}`);
    if (!result.ok) throw new Error(errorsOf(result));
    expect(result.markdownBlocksMarkedInvalid).toBeGreaterThan(0);
  });

  test("a marked block that fails with another error is reported", async () => {
    const result = await validateWithDoc(`<!-- invalid: duplicate item -->\n${emptyDict}`);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain('is marked invalid with "duplicate item", but fails with other errors');
  });

  test("a marked block that is valid is reported", async () => {
    const valid = "```yaml\nopentp: 2026-09\ndict:\n  type: string\n  values: [a]\n```\n";
    const result = await validateWithDoc(`<!-- invalid: expected at least 1 items -->\n${valid}`);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("is marked invalid but matches dict.schema.json");
  });

  test("a marked fragment is skipped, an earlier marker does not apply to a later block", async () => {
    const fragment = "```yaml\nevent_name:\n  value: a\n  required: false\n```\n";
    const result = await validateWithDoc(`<!-- invalid: contradicts value -->\n${fragment}\nText.\n\n${emptyDict}`);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("does not match dict.schema.json");
  });
});

describe("schema checks at load", () => {
  test("an unknown keyword in a schema throws", async () => {
    const root = copyRepo();
    edit(
      root,
      "schemas/field.schema.json",
      '"title": "OpenTrackPlan Field",',
      '"title": "OpenTrackPlan Field",\n  "propertyNames": { "pattern": "^[a-z]" },',
    );
    await expect(validateRepo(root)).rejects.toThrow('unsupported keyword "propertyNames"');
  });

  test("an unresolvable $ref pointer throws", async () => {
    const root = copyRepo();
    edit(
      root,
      "schemas/opentp.schema.json",
      '"$ref": "#/definitions/piiConfig"',
      '"$ref": "#/definitions/piiConfigMissing"',
    );
    await expect(validateRepo(root)).rejects.toThrow("Unresolvable ref #/definitions/piiConfigMissing");
  });

  test("a keyword next to $ref throws", async () => {
    const root = copyRepo();
    edit(
      root,
      "schemas/field.schema.json",
      '"$ref": "#/definitions/arrayItems"',
      '"$ref": "#/definitions/arrayItems",\n      "type": "object"',
    );
    await expect(validateRepo(root)).rejects.toThrow('"type" next to $ref is ignored');
  });

  test("a type array throws", () => {
    const schemas: Schemas = {
      "version.schema.json": {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://opentp.dev/schemas/2026-09/version.schema.json",
        const: "2026-09",
      },
      "t.json": {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://opentp.dev/schemas/2026-09/t.json",
        type: ["string", "null"],
      },
    };
    expect(() => checkSchemas(schemas)).toThrow("type must be a single string");
  });

  test("a $id on another version throws", async () => {
    const root = copyRepo();
    edit(root, "schemas/dict.schema.json", "/schemas/2026-09/dict.schema.json", "/schemas/2026-01/dict.schema.json");
    await expect(validateRepo(root)).rejects.toThrow("dict.schema.json: $id must be");
  });

  /** The version schema plus `t.json` (the given schema with the draft-07 `$schema` and its `$id`). */
  function schemaSet(t: Record<string, unknown>): Schemas {
    return {
      "version.schema.json": {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://opentp.dev/schemas/2026-09/version.schema.json",
        const: "2026-09",
      },
      "t.json": {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://opentp.dev/schemas/2026-09/t.json",
        ...t,
      },
    };
  }

  /** Edits a copied schema file as parsed JSON. */
  function editJson(root: string, file: string, change: (schema: Record<string, any>) => void): void {
    const filePath = path.join(root, file);
    const schema = JSON.parse(readFileSync(filePath, "utf8"));
    change(schema);
    writeFileSync(filePath, `${JSON.stringify(schema, null, 2)}\n`);
  }

  test("keyword values of the wrong type throw instead of being ignored", async () => {
    const root = copyRepo();
    editJson(root, "schemas/field.schema.json", (schema) => {
      schema.properties.enum.minItems = "1";
      schema.properties.minLength.minimum = false;
      schema.properties.multipleOf.exclusiveMinimum = true; // the draft-04 boolean form
    });
    const thrown = await validateRepo(root).then(
      () => "",
      (e: unknown) => String(e),
    );
    expect(thrown).toContain("field.schema.json#/properties/enum: minItems must be a non-negative integer");
    expect(thrown).toContain("field.schema.json#/properties/minLength: minimum must be a number");
    expect(thrown).toContain("field.schema.json#/properties/multipleOf: exclusiveMinimum must be a number");
  });

  test.each([
    ["minLength", -1, "minLength must be a non-negative integer"],
    ["maxLength", 1.5, "maxLength must be a non-negative integer"],
    ["minItems", "1", "minItems must be a non-negative integer"],
    ["maxItems", null, "maxItems must be a non-negative integer"],
    ["minProperties", true, "minProperties must be a non-negative integer"],
    ["maxProperties", -2, "maxProperties must be a non-negative integer"],
    ["minimum", "0", "minimum must be a number"],
    ["maximum", false, "maximum must be a number"],
    ["exclusiveMinimum", true, "exclusiveMinimum must be a number"],
    ["exclusiveMaximum", [1], "exclusiveMaximum must be a number"],
    ["multipleOf", 0, "multipleOf must be a number greater than 0"],
    ["multipleOf", -1, "multipleOf must be a number greater than 0"],
    ["uniqueItems", "true", "uniqueItems must be a boolean"],
    ["properties", [], "properties must be an object"],
    ["patternProperties", "x", "patternProperties must be an object"],
    ["definitions", null, "definitions must be an object"],
    ["required", ["a", "a"], "required must be an array of unique strings"],
    ["title", 1, "title must be a string"],
    ["description", {}, "description must be a string"],
    ["$comment", false, "$comment must be a string"],
    ["examples", "x", "examples must be an array"],
  ])("%s: %p throws", (keyword, value, message) => {
    expect(() => checkSchemas(schemaSet({ properties: { a: { [keyword]: value } } }))).toThrow(
      `t.json#/properties/a: ${message}`,
    );
  });

  test("keyword values of the right type pass", () => {
    const schemas = schemaSet({
      properties: {
        a: { minLength: 0, maxItems: 3, minimum: -1.5, exclusiveMaximum: 0, multipleOf: 0.01, uniqueItems: false },
        b: { examples: [], required: ["x", "y"], title: "B", $comment: "c", properties: {}, definitions: {} },
      },
    });
    expect(() => checkSchemas(schemas)).not.toThrow();
  });

  test("a $id or $schema below the root throws", () => {
    expect(() => checkSchemas(schemaSet({ properties: { a: { $id: "https://example.com/a.json" } } }))).toThrow(
      "t.json#/properties/a: $id is allowed only at the root of a schema file",
    );
    expect(() =>
      checkSchemas(schemaSet({ definitions: { a: { $schema: "http://json-schema.org/draft-07/schema#" } } })),
    ).toThrow("t.json#/definitions/a: $schema is allowed only at the root of a schema file");
  });

  test("a $ref whose file part contains / throws", async () => {
    const root = copyRepo();
    edit(root, "schemas/opentp.schema.json", '"$ref": "field.schema.json"', '"$ref": "../schemas/field.schema.json"');
    await expect(validateRepo(root)).rejects.toThrow(
      '$ref "../schemas/field.schema.json": the file part must be a file name in schemas/ (no "/")',
    );
    const schemas = schemaSet({ type: "string" });
    expect(() => validateNode("a", "sub/t.json", schemas)).toThrow('the file part must be a file name in schemas/ (no "/")');
  });
});

describe("toolchain", () => {
  test("package.json pins the Bun version that CI uses", () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/validate.yml"), "utf8");
    const ciVersion = /bun-version:\s*'([^']+)'/.exec(workflow)?.[1];
    expect(ciVersion).toBeDefined();
    expect(pkg.packageManager).toBe(`bun@${ciVersion}`);
    for (const file of ["README.md", "CONTRIBUTING.md"]) {
      expect(readFileSync(path.join(repoRoot, file), "utf8")).toContain(`Bun ${ciVersion} or later`);
    }
  });
});

describe("validator subset", () => {
  const schemas: Schemas = {
    "t.json": {
      type: "object",
      patternProperties: { "^x-": {} },
      additionalProperties: false,
      properties: {
        name: { type: "string", pattern: "^\\p{Lu}", minLength: 2, maxLength: 2 },
        never: false,
        any: true,
        day: { type: "string", format: "date" },
        ip: { type: "string", format: "ipv4" },
        ip6: { type: "string", format: "ipv6" },
      },
    },
  };
  const check = (instance: unknown) => validateNode(instance, "t.json", schemas);

  test("patternProperties with additionalProperties: false", () => {
    expect(check({ "x-team": 1 })).toEqual([]);
    expect(check({ other: 1 })).toEqual(['root: additional property not allowed: "other"']);
  });

  test("boolean subschemas", () => {
    expect(check({ any: { a: 1 } })).toEqual([]);
    expect(check({ never: 1 })).toEqual(["root.never: not allowed"]);
  });

  test("patterns use the u flag and lengths count code points", () => {
    expect(check({ name: "Éa" })).toEqual([]);
    expect(check({ name: "Ü𝄞" })).toEqual([]); // 2 code points, 3 UTF-16 code units
    expect(check({ name: "Éab" })).toEqual(["root.name: expected string length <= 2"]);
    expect(check({ name: "éa" })).toEqual(['root.name: string does not match pattern "^\\\\p{Lu}"']);
  });

  test("format date", () => {
    expect(check({ day: "2024-02-29" })).toEqual([]);
    expect(check({ day: "2025-02-29" })).toEqual(['root.day: expected format date, got "2025-02-29"']);
  });

  // docs/semantics.md "Formats": four decimal octets 0-255 without leading zeros ("0" itself is allowed)
  test.each(["192.0.2.1", "0.0.0.0", "255.255.255.255", "10.0.100.9", "1.20.199.250"])("format ipv4: %p is valid", (ip) => {
    expect(check({ ip })).toEqual([]);
  });

  test.each([
    "192.168.001.1",
    "1.2.3.04",
    "00.1.2.3",
    "01.2.3.4",
    "256.1.2.3",
    "1.2.3.300",
    "1.2.3",
    "1.2.3.4.5",
    "1.2.3.",
    "1..2.3",
    "1.2.3.-4",
    "+1.2.3.4",
    " 1.2.3.4",
    "1.2.3.4\n",
    "1.2.3.٤", // a non-ASCII digit
    "0x1.2.3.4",
  ])("format ipv4: %p is invalid", (ip) => {
    expect(check({ ip })).toEqual([`root.ip: expected format ipv4, got ${JSON.stringify(ip)}`]);
  });

  test("format ipv6: an embedded IPv4 part follows the ipv4 rule", () => {
    expect(check({ ip6: "::ffff:192.0.2.1" })).toEqual([]);
    expect(check({ ip6: "::ffff:192.0.2.01" })).toEqual(['root.ip6: expected format ipv6, got "::ffff:192.0.2.01"']);
  });
});
