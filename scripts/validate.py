#!/usr/bin/env python3
"""
opentp-spec consistency checks:
- JSON schemas parse and local $ref targets exist
- YAML examples parse and structurally match schemas (subset validator)
- YAML code blocks in docs/README parse and (when representing full files) match schemas

This is intentionally dependency-light. It uses PyYAML for YAML parsing.
It does NOT implement the full JSON Schema specification — only the subset used by opentp-spec.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    print("ERROR: PyYAML is required. Install with: pip install pyyaml", file=sys.stderr)
    raise SystemExit(2)


@dataclass(frozen=True)
class Ctx:
    schema_name: str


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _walk_json(value: Any) -> List[Any]:
    stack = [value]
    out: List[Any] = []
    while stack:
        cur = stack.pop()
        out.append(cur)
        if isinstance(cur, dict):
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)
    return out


def _resolve_ref(
    schemas: Dict[str, Any], ctx: Ctx, root_schema: Any, ref: str
) -> Tuple[Ctx, Any]:
    if ref.startswith("#"):
        base = root_schema
        schema_name = ctx.schema_name
        pointer = ref
    else:
        file_part, _, frag = ref.partition("#")
        if "://" in file_part:
            raise ValueError(f"Remote refs are not supported: {ref}")
        schema_name = Path(file_part).name
        if schema_name not in schemas:
            raise KeyError(f"Missing schema file for $ref: {ref}")
        base = schemas[schema_name]
        pointer = f"#{frag}" if frag else "#"

    if pointer in ("#", "#/"):
        return Ctx(schema_name=schema_name), base

    if not pointer.startswith("#/"):
        raise ValueError(f"Unsupported ref pointer: {ref}")

    cur = base
    for raw_part in pointer[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not (isinstance(cur, dict) and part in cur):
            raise KeyError(f"Unresolvable ref {ref} at {part!r}")
        cur = cur[part]

    return Ctx(schema_name=schema_name), cur


def _validate(instance: Any, schema: Any, path: str, ctx: Ctx, schemas: Dict[str, Any]) -> List[str]:
    errors: List[str] = []

    if isinstance(schema, dict) and "$ref" in schema:
        ref = schema["$ref"]
        try:
            next_ctx, resolved = _resolve_ref(schemas, ctx, schemas[ctx.schema_name], ref)
        except Exception as e:
            return [f"{path}: $ref {ref} resolve error: {e}"]
        return _validate(instance, resolved, path, next_ctx, schemas)

    if not isinstance(schema, dict):
        return errors

    # Combinators
    if "allOf" in schema:
        for sub in schema["allOf"]:
            errors.extend(_validate(instance, sub, path, ctx, schemas))

    if "anyOf" in schema:
        if not any(not _validate(instance, sub, path, ctx, schemas) for sub in schema["anyOf"]):
            errors.append(f"{path}: anyOf failed")

    if "oneOf" in schema:
        ok_count = 0
        for sub in schema["oneOf"]:
            if not _validate(instance, sub, path, ctx, schemas):
                ok_count += 1
        if ok_count != 1:
            errors.append(f"{path}: oneOf expected exactly 1 match, got {ok_count}")

    if "not" in schema:
        if not _validate(instance, schema["not"], path, ctx, schemas):
            errors.append(f"{path}: not schema matched but must not")

    # Basic constraints
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: expected const {schema['const']!r}, got {instance!r}")

    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: expected one of {schema['enum']!r}, got {instance!r}")

    if "type" in schema:
        expected = schema["type"]
        ok_type = True
        if expected == "object":
            ok_type = isinstance(instance, dict)
        elif expected == "array":
            ok_type = isinstance(instance, list)
        elif expected == "string":
            ok_type = isinstance(instance, str)
        elif expected == "number":
            ok_type = _is_number(instance)
        elif expected == "integer":
            ok_type = _is_integer(instance)
        elif expected == "boolean":
            ok_type = isinstance(instance, bool)
        elif expected == "null":
            ok_type = instance is None

        if not ok_type:
            errors.append(f"{path}: expected type {expected}, got {_type_name(instance)}")
            return errors

    if "pattern" in schema and isinstance(instance, str):
        try:
            if not re.search(schema["pattern"], instance):
                errors.append(f"{path}: string does not match pattern {schema['pattern']!r}")
        except re.error as e:
            errors.append(f"{path}: invalid regex pattern {schema['pattern']!r}: {e}")

    # Objects
    if isinstance(instance, dict):
        required = schema.get("required")
        if isinstance(required, list):
            for k in required:
                if k not in instance:
                    errors.append(f"{path}: missing required property {k!r}")

        props = schema.get("properties") or {}
        for k, sub_schema in props.items():
            if k in instance:
                errors.extend(_validate(instance[k], sub_schema, f"{path}.{k}", ctx, schemas))

        additional = schema.get("additionalProperties", True)
        if additional is False:
            allowed = set(props.keys())
            for k in instance.keys():
                if k not in allowed:
                    errors.append(f"{path}: additional property not allowed: {k!r}")
        elif isinstance(additional, dict):
            for k in instance.keys():
                if k in props:
                    continue
                errors.extend(_validate(instance[k], additional, f"{path}.{k}", ctx, schemas))

        if "minProperties" in schema and len(instance) < schema["minProperties"]:
            errors.append(f"{path}: expected at least {schema['minProperties']} properties")
        if "maxProperties" in schema and len(instance) > schema["maxProperties"]:
            errors.append(f"{path}: expected at most {schema['maxProperties']} properties")

    # Arrays
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(f"{path}: expected at least {schema['minItems']} items")

        if schema.get("uniqueItems"):
            try:
                seen: set[str] = set()
                for item in instance:
                    key = json.dumps(item, sort_keys=True)
                    if key in seen:
                        errors.append(f"{path}: duplicate item {item!r}")
                        break
                    seen.add(key)
            except TypeError:
                pass

        items_schema = schema.get("items")
        if items_schema is not None:
            for idx, item in enumerate(instance):
                errors.extend(_validate(item, items_schema, f"{path}[{idx}]", ctx, schemas))

    # Integer bounds
    if _is_integer(instance) and "minimum" in schema and instance < schema["minimum"]:
        errors.append(f"{path}: expected >= {schema['minimum']}")

    return errors


def _pick_schema(doc: Any, filename: str) -> Optional[str]:
    if filename in ("opentp.yaml", "opentp.yml"):
        return "opentp.schema.json"
    if not isinstance(doc, dict):
        return None
    if "opentp" in doc and "info" in doc and "spec" in doc:
        return "opentp.schema.json"
    if "opentp" in doc and "event" in doc:
        return "event.schema.json"
    if "opentp" in doc and "dict" in doc:
        return "dict.schema.json"
    return None


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]  # opentp-spec/
    schemas_dir = repo_root / "schemas"

    # Load schemas
    schemas: Dict[str, Any] = {}
    for p in sorted(schemas_dir.glob("*.json")):
        try:
            schemas[p.name] = _load_json(p)
        except Exception as e:
            print(f"FAIL: cannot parse JSON schema: {p} ({e})")
            return 1

    # Check local $ref files exist
    # Note: This must match real ".json" in $ref values (not a literal "\.json").
    ref_file_re = re.compile(r"\.json($|#)")
    ref_json_hint_count = 0
    ref_checked_count = 0
    for schema_name, schema in schemas.items():
        for node in _walk_json(schema):
            if not isinstance(node, dict):
                continue
            ref = node.get("$ref")
            if isinstance(ref, str):
                if ".json" in ref:
                    ref_json_hint_count += 1
            if not (isinstance(ref, str) and ref_file_re.search(ref)):
                continue
            ref_file = ref.split("#", 1)[0]
            if "://" in ref_file or ref_file == "":
                continue
            ref_checked_count += 1
            if not (schemas_dir / ref_file).exists():
                print(f"FAIL: missing $ref target: {schema_name} -> {ref}")
                return 1
    if ref_json_hint_count > 0 and ref_checked_count == 0:
        print(
            "FAIL: schemas contain '$ref' values pointing to .json files, but no file $ref targets were checked. "
            "This likely indicates a broken $ref regex or ref-check logic."
        )
        return 1

    failures: List[Tuple[Path, List[str]]] = []

    # Validate examples
    for p in sorted((repo_root / "examples").rglob("*.yaml")):
        try:
            doc = yaml.safe_load(p.read_text(encoding="utf-8"))
        except Exception as e:
            failures.append((p, [f"YAML parse error: {e}"]))
            continue

        schema_name = _pick_schema(doc, p.name)
        if not schema_name:
            failures.append((p, ["Cannot decide schema for this YAML file"]))
            continue

        errs = _validate(doc, schemas[schema_name], "root", Ctx(schema_name=schema_name), schemas)
        if errs:
            failures.append((p, errs))

    # Validate YAML code blocks in docs/README that look like full files
    md_files = [repo_root / "README.md"] + sorted((repo_root / "docs").rglob("*.md"))
    fence_re = re.compile(r"```ya?ml\r?\n(.*?)\r?\n```", re.DOTALL)
    markdown_blocks_extracted = 0
    markdown_blocks_validated = 0
    for md in md_files:
        text = md.read_text(encoding="utf-8")
        has_yaml_fence_markers = ("```yaml" in text) or ("```yml" in text)
        matches = list(fence_re.finditer(text))
        if has_yaml_fence_markers and len(matches) == 0:
            print(
                f"FAIL: Found YAML fence markers in {md} but could not extract any YAML code blocks. "
                "This likely indicates a broken markdown fence regex."
            )
            return 1

        markdown_blocks_extracted += len(matches)
        for i, m in enumerate(matches, start=1):
            block = m.group(1)
            try:
                doc = yaml.safe_load(block)
            except Exception as e:
                failures.append((md, [f"YAML code block #{i} parse error: {e}"]))
                continue

            schema_name = _pick_schema(doc, filename="")
            if not schema_name:
                continue
            markdown_blocks_validated += 1

            errs = _validate(doc, schemas[schema_name], "root", Ctx(schema_name=schema_name), schemas)
            if errs:
                failures.append((md, [f"YAML code block #{i} does not match {schema_name}"] + errs))

    if failures:
        print(f"FAILURES: {len(failures)}")
        for p, errs in failures:
            print(f"\\n== {p}")
            for e in errs[:50]:
                print(f" - {e}")
            if len(errs) > 50:
                print(f" ... {len(errs) - 50} more")
        return 1

    print(f"INFO: extracted {markdown_blocks_extracted} YAML code blocks from markdown; validated {markdown_blocks_validated} as full files.")
    print("OK: schemas parse; examples and docs YAML blocks match schemas (subset validator).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
