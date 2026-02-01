import { expect, test } from "bun:test";
import * as path from "node:path";
import { parseYaml, validateRepo } from "./validate";

test("parseYaml keeps YYYY-MM opentp as string", () => {
  expect(parseYaml("opentp: 2026-01\n")).toEqual({ opentp: "2026-01" });
});

test("validator passes on opentp-spec repo", async () => {
  const repoRoot = path.resolve(import.meta.dir, "..");
  const result = await validateRepo(repoRoot);

  if (!result.ok) {
    const preview = result.failures
      .slice(0, 5)
      .flatMap((f) => [`== ${f.file}`, ...f.errors.slice(0, 10).map((e) => `- ${e}`)])
      .join("\n");
    throw new Error(`Validation failed:\n${preview}`);
  }

  expect(result.ok).toBe(true);
});
