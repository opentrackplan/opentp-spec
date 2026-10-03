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

### Catalog, common fields and events

Payload fields are defined in three places:

- **Catalog** (`spec.events.payload.schema`): every field events may use, with its type, dictionary, constraints and `policy`. Being in the catalog does not put a field into an event.
- **Common fields** (`spec.targets.all.schema` and `spec.targets.<targetId>.schema`): fields that are part of every event on every target, or on one target.
- **Events** list the catalog fields they use, and may narrow common fields (for example pin `event_name` with `value`). Event fields inherit their type, so `{}` or `{required: true}` is a complete event field.

An event field that is neither in the catalog nor a common field is an error (closed vocabulary). `policy` on a catalog or common field says what every event must do with it. See [Semantics](./semantics.md) for the merge rules, presence and the event predicate.

## Format Version

Current specification version: **2026-09**

All OpenTrackPlan files declare their format version:

```yaml
opentp: 2026-09
```

Changes and migration notes for every version: [CHANGELOG.md](https://github.com/opentrackplan/opentp-spec/blob/main/CHANGELOG.md).

## Versioning

- A version is named `YYYY-MM`. The name is chosen when the version is planned, normally after the month in which its tag is cut; the changelog records the tag date (`2026-09` was cut on 2026-10-03).
- A published version is immutable: its content never changes in place, and changes accumulate into the next version. The in-place amendment of `2026-01` on 2026-06-20 is recorded in the changelog as a one-time exception.
- From `2026-09` on, every version is an annotated git tag of [opentp-spec](https://github.com/opentrackplan/opentp-spec) with a GitHub Release whose notes come from the changelog. Earlier tags stay lightweight.
- Every version has migration notes in the changelog, and the reference CLI ships `opentp migrate` to upgrade plans.
- Schemas are served at `https://opentp.dev/schemas/<version>/<file>`. `https://opentp.dev/schemas/latest/<file>` points at the newest version once the reference CLI supports it.

## File Types

| File | Purpose | Schema |
|------|---------|--------|
| `opentp.yaml` | Main configuration | [opentp.yaml](./schema/opentp-yaml.md) |
| `events/*.yaml` | Event definitions | [Event Files](./schema/events.md) |
| `dictionaries/*.yaml` | Reusable value lists | [Dictionaries](./schema/dictionaries.md) |

`.yaml` and `.yml` are equivalent everywhere.

## Semantics

Some behavior is defined by normative semantics in addition to JSON schemas:

- [Semantics](./semantics.md)

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

Replace `latest` with a version (for example `2026-09`) to pin it.

## Getting Started

1. Create `opentp.yaml` in your project root
2. Define your taxonomy, targets and field catalog
3. Create event files in the `events/` directory that list the fields they use
4. Use dictionaries for reusable value lists
5. Validate with the [opentp CLI](https://github.com/opentrackplan/opentp-cli)

## License

Apache 2.0
