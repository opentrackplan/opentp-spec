# Schema Reference

OpenTrackPlan uses YAML files for configuration. This section covers all file formats.

## File Types

| File | Purpose | Schema |
|------|---------|--------|
| [`opentp.yaml`](./opentp-yaml.md) | Main configuration | `opentp.schema.json` |
| [`events/*.yaml`](./events.md) | Event definitions | `event.schema.json` |
| [`dictionaries/*.yaml`](./dictionaries.md) | Reusable value lists | `dict.schema.json` |

`.yaml` and `.yml` are equivalent. Payload field definitions in all files share `field.schema.json`.

## JSON Schemas

All file formats have JSON schemas (JSON Schema draft-07) for IDE validation and autocompletion.

Add this comment at the top of your YAML files:

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/opentp.schema.json
```

### Schema URLs

| Schema | URL |
|--------|-----|
| Main config | `https://opentp.dev/schemas/latest/opentp.schema.json` |
| Events | `https://opentp.dev/schemas/latest/event.schema.json` |
| Dictionaries | `https://opentp.dev/schemas/latest/dict.schema.json` |
| Field (shared) | `https://opentp.dev/schemas/latest/field.schema.json` |
| Version (shared) | `https://opentp.dev/schemas/latest/version.schema.json` |

The schemas check the shape of each file. Rules that need several files or merged layers (closed vocabulary, policy, presence, dictionaries, overlap) are checked by validators; see [Validator-only rules](../semantics.md#validator-only-rules).

## Version

All OpenTrackPlan files start with:

```yaml
opentp: 2026-09
```

This declares the format version. A validator accepts exactly the version it implements; the reference CLI upgrades older plans with `opentp migrate`.

## Extensions

The core specification is designed to be portable across tools.

- Any key that starts with `x-` (for example `x-acme-team`) is allowed on the fixed-shape objects of every file (the root, `info`, `spec`, targets, fields, `items`, event and dictionary objects, and more; see [Extensions](../semantics.md#extensions)). Tools ignore the `x-*` keys they do not know.
- `x-opentp` is reserved: it was the tooling extension container until 2026-01 and is invalid in 2026-09.
- Field checks are a core keyword, `checks`, with portable named checks in `spec.checks` and tool-defined check ids (see [Checks](../semantics.md#checks)).
- Tool settings such as key generation live in tool files, not in `opentp.yaml` (the reference CLI uses `opentp.cli.yaml`).

## Semantics

Some behavior is defined by normative semantics in addition to JSON schemas:

- [Semantics](../semantics.md)
