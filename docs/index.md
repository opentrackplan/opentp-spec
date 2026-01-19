# OpenTrackPlan Specification

OpenTrackPlan is an open standard for describing tracking plans — a structured way to define, validate, and document analytics events.

## Problem

Analytics implementations often break down in communication:

- Analysts describe events in Google Docs, Notion, or Confluence
- Developers implement events "as they understood"
- QA checks implementation "by eye"
- Data diverges from expectations

## Solution

OpenTrackPlan provides a schema-first approach:

1. **Define** events in YAML files with structured schemas
2. **Validate** events against the specification
3. **Generate** code, documentation, or exports
4. **Collaborate** using version control

## Core Concepts

### Tracking Plan Structure

```
my-tracking-plan/
├── opentp.yaml              # Main configuration
├── events/
│   ├── auth/
│   │   ├── login.yaml
│   │   └── signup.yaml
│   └── dashboard/
│       └── view.yaml
└── dictionaries/
    ├── taxonomy/
    │   └── areas.yaml
    └── data/
        └── application_id.yaml
```

### Taxonomy vs Payload

**Taxonomy** — event metadata for humans:
- Folder organization and search
- Human-readable descriptions
- Team ownership

**Payload** — data for analytics targets:
- What gets sent to Amplitude, GA, Mixpanel
- Platform-specific schemas
- Versioned history

These are independent concepts — there's no automatic mapping between them.

## Format Version

Current specification version: **2025-12**

All OpenTrackPlan files declare their format version:

```yaml
opentp: 2025-12
```

## File Types

| File | Purpose | Schema |
|------|---------|--------|
| `opentp.yaml` | Main configuration | [opentp.yaml](./schema/opentp-yaml.md) |
| `events/*.yaml` | Event definitions | [Event Files](./schema/events.md) |
| `dictionaries/*.yaml` | Reusable value lists | [Dictionaries](./schema/dictionaries.md) |

## JSON Schemas

All file formats have JSON schemas for validation and IDE autocompletion.

Add this to your YAML files:

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/opentp.schema.json
```

Schema URLs:

| Schema | URL |
|--------|-----|
| Main config | `https://opentp.dev/schemas/latest/opentp.schema.json` |
| Events | `https://opentp.dev/schemas/latest/event.schema.json` |
| Dictionaries | `https://opentp.dev/schemas/latest/dict.schema.json` |
| Field (shared) | `https://opentp.dev/schemas/latest/field.schema.json` |
| Version (shared) | `https://opentp.dev/schemas/latest/version.schema.json` |

## Getting Started

1. Create `opentp.yaml` in your project root
2. Define your taxonomy and payload structure
3. Create event files in the `events/` directory
4. Use dictionaries for reusable value lists
5. Validate with the [opentp CLI](https://github.com/opentrackplan/opentp-cli)

## License

Apache 2.0
