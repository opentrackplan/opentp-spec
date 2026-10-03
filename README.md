# OpenTrackPlan Specification

OpenTrackPlan is an open standard for describing tracking plans — a structured way to define, validate, and document analytics events.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Overview

Analytics implementations often break down in communication:

- Analysts describe events in Google Docs, Notion, or Confluence
- Developers implement events "as they understood"
- QA checks implementation "by eye"
- Data diverges from expectations

**OpenTrackPlan** provides a schema-first approach — events are described in YAML files with validation.

## Quick Start

Create `opentp.yaml` in your project:

```yaml
opentp: 2026-09

info:
  title: My Tracking Plan
  version: 1.0.0

spec:
  paths:
    events:
      root: /events
      template: "{area}/{event}.yaml"

  # Common fields: part of every event on every target
  targets:
    all:
      schema:
        event_name:
          type: string
          policy: fixed

  events:
    key:
      pattern: "^[a-z0-9_]+::[a-z0-9_]+$"
    taxonomy:
      area:
        title: Area
        type: string
        required: true
      event:
        title: Event
        type: string
        required: true
      action:
        title: Action
        type: string
        required: true
    payload:
      targets:
        all: [web, ios, android]
      # Field catalog: every field events may use
      schema:
        auth_method:
          type: string
          enum: [email, google, github]
        user_id:
          type: string
        dimension_1:
          type: string
```

Create an event in `events/auth/login.yaml`:

```yaml
opentp: 2026-09

event:
  key: auth::login

  taxonomy:
    action: User clicks the login button

  payload:
    schema:
      event_name:
        value: login
      auth_method:
        required: true
        example: email
      user_id:
        pii:
          kind: user_id
          masker: star
      dimension_1:
        name: orgType
        title: Organization Type
        example: enterprise
```

How this fits together:

- `spec.targets.all.schema` holds **common fields**: every event has them. `spec.targets.<targetId>.schema` holds the common fields of one target.
- `spec.events.payload.schema` is the **field catalog**: the fields events may use. An event lists the catalog fields it uses; a field that is neither in the catalog nor a common field is an error.
- Event fields inherit their type and constraints, so the event writes only what is specific to it: a fixed `value`, `required: true`, a narrower `enum`, or `{}` to list a field unchanged.
- If a taxonomy field is present in `spec.paths.events.template` (for example `{area}/{event}.yaml`), its value is extracted from the event file path and does not need to be duplicated in `event.taxonomy`.
- Use `name` when the payload key is a transport or vendor slot, but the field has a clearer logical/code-facing name: `dimension_1` keeps the canonical payload key while declaring `name: orgType`.
- Use `example` for a representative value used by documentation, mock data, and generators. It must satisfy the field.

### What every event must define (`policy`)

Some fields are **event characteristics** that every event must define, for example `event_name` or `application_id`. Set `policy` on the catalog or common field:

- `specified` — every event lists the field (`{}` is enough);
- `restricted` — every event restricts it with `value`, `enum` or `dict` (on an array field only `value` does, since arrays take no top-level `enum` or `dict`);
- `fixed` — every event sets its `value`.

A field with `policy: restricted` or `fixed`, and any field with a `value`, is present in every hit. `policy` replaces `valueRequired` (2026-01); the normative rules are in [Semantics](docs/semantics.md#policy).

## Documentation

- [Specification Overview](docs/index.md)
- [Semantics](docs/semantics.md) — normative rules: layers and merge, presence, policy, the event predicate, checks, extensions, ignore
- [Schema Reference](docs/schema/index.md)
  - [opentp.yaml](docs/schema/opentp-yaml.md)
  - [Event Files](docs/schema/events.md)
  - [Dictionaries](docs/schema/dictionaries.md)
- [Changelog and migration notes](CHANGELOG.md)

## JSON Schemas

All file formats have JSON schemas for IDE validation:

| Schema | URL |
|--------|-----|
| Main config | `https://opentp.dev/schemas/latest/opentp.schema.json` |
| Events | `https://opentp.dev/schemas/latest/event.schema.json` |
| Dictionaries | `https://opentp.dev/schemas/latest/dict.schema.json` |
| Field (shared) | `https://opentp.dev/schemas/latest/field.schema.json` |
| Version (shared) | `https://opentp.dev/schemas/latest/version.schema.json` |

Add to your YAML files:

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/opentp.schema.json
```

## Tools

- [opentp CLI](https://github.com/opentrackplan/opentp-cli) — Validate and generate from tracking plans; `opentp migrate` upgrades plans from 2026-01

## Examples

- `examples/simple/` — minimal example: a catalog with two fields and one event that lists them
- `examples/full/` — common fields with `policy`, slots, versions with aliases and `$ref`, map form, dictionaries, PII and a portable check
- `examples/extensions/` — vendor extensions (`x-acme-team`), tool-defined check ids, `spec.checks` and target common fields

## Repo checks

The checks require Bun 1.4.2 or later (`package.json` `packageManager`; older Bun versions cannot read `bun.lock`).

```bash
bun install --frozen-lockfile
bun scripts/validate.ts             # schemas, examples and docs YAML blocks
bun test scripts/validate.test.ts   # validator tests
```

## Specification Version

Current version: **2026-09** (see [CHANGELOG.md](CHANGELOG.md) for changes and migration notes)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

## Links

- Website: [opentp.dev](https://opentp.dev)
- GitHub: [github.com/opentrackplan](https://github.com/opentrackplan)
