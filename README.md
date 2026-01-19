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
opentp: 2025-12

info:
  title: My Tracking Plan
  version: 1.0.0

spec:
  paths:
    events:
      root: /events
      pattern: "{area}/{event}.yaml"
  events:
    key:
      pattern: "{area}::{event}"
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
      schema:
        event_name:
          type: string
          required: true
```

Create an event in `events/auth/login.yaml`:

```yaml
opentp: 2025-12

event:
  key: auth::login

  taxonomy:
    action: User clicks the login button

  payload:
    schema:
      event_name:
        value: login
      auth_method:
        type: string
        enum: [email, google, github]
      user_id:
        type: string
        pii:
          kind: user_id
          masker: star
          owner: analytics
          jira: ANALYTICS-123
```

Note: if a taxonomy field is present in `spec.paths.events.pattern` (for example `{area}/{event}.yaml`),
its value is extracted from the event file path and does not need to be duplicated in `event.taxonomy`.

## Documentation

- [Specification Overview](docs/index.md)
- [Schema Reference](docs/schema/index.md)
  - [opentp.yaml](docs/schema/opentp-yaml.md)
  - [Event Files](docs/schema/events.md)
  - [Dictionaries](docs/schema/dictionaries.md)

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

- [opentp CLI](https://github.com/opentrackplan/opentp-cli) — Validate and generate from tracking plans

## Examples

- `examples/full/` — full example (targets + versions + dictionaries)
- `examples/simple/` — minimal example (implicit `all`, unversioned payload)

## Repo checks

- Run `python3 scripts/validate.py` to check examples and documentation snippets against the JSON schemas.

## Specification Version

Current version: **2025-12**

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

## Links

- Website: [opentp.dev](https://opentp.dev)
- GitHub: [github.com/opentrackplan](https://github.com/opentrackplan)
