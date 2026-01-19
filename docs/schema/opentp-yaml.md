# opentp.yaml

The main configuration file defines your tracking plan structure, taxonomy, transforms, and validation checks.

## Minimal Example

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

## Full Reference

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opentp` | string | Yes | Format version (e.g., "2025-12") |
| `info` | object | Yes | Project metadata |
| `spec` | object | Yes | Tracking plan specification |

### info

```yaml
info:
  title: My Tracking Plan
  version: 1.0.0
  description: Analytics events for My App
  contact:
    - Analytics Team <analytics@example.com>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Project name |
| `version` | string | Yes | Project version |
| `description` | string | No | Project description |
| `contact` | array | No | Contact information |

### spec.paths

```yaml
spec:
  paths:
    events:
      root: /events
      pattern: "{area}/{event}.yaml"
    dictionaries:
      root: /dictionaries
```

#### paths.events

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for events |
| `pattern` | string | File path pattern using taxonomy fields |

Fields used in `spec.paths.events.pattern` are extracted from the event file path and added to `event.taxonomy`.
If a field is present in the path pattern, it does not need to be duplicated inside the event YAML.

#### paths.dictionaries

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for dictionaries |
| _(no other fields)_ |  | Dictionary paths are resolved as `<root>/<dict>.yaml` |

### spec.events

```yaml
spec:
  events:
    key:
      pattern: "{area}::{event}"
```

#### key.pattern

Defines how event keys are generated from taxonomy values.

- Use `{field}` to insert a taxonomy field
- Use `{field | transform}` to apply a transform
- Use `::` or any separator between parts

Examples:

```yaml
# Simple
pattern: "{area}::{event}"
# Result: auth::login_click

# With transform
pattern: "{area | slug}::{event | slug}"
# Result: auth::login_click (lowercase, underscores)
```

### spec.events.taxonomy

Defines metadata fields for organizing events.

```yaml
taxonomy:
  area:
    title: Area
    type: string
    dict: taxonomy/areas
    required: true
    checks:
      max-length: 50
  event:
    title: Event
    type: string
    required: true
  action:
    title: Action
    type: string
    description: Human-readable description of when event fires
    required: true
```

Each taxonomy field can have:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Display name |
| `type` | string | `string`, `number`, or `boolean` |
| `description` | string | Field description |
| `required` | boolean | Whether field is required |
| `dict` | string | Reference to a dictionary |
| `enum` | array | Inline allowed values |
| `pattern` | string | Pattern for composite fields (used with `fragments`) |
| `fragments` | object | Fragment definitions for composite fields |
| `checks` | object | Validation checks |

Notes:
- `enum` values must match the field `type` (`string`, `number`, or `boolean`).
- `enum` and `dict` are mutually exclusive.

`checks` is a free-form map of `checkId -> params`. Check IDs do not require any special prefix.
To avoid collisions across teams, use a consistent namespace (for example `mycompany.*` or `myteam-*`).
Tooling may warn or error on unknown check IDs depending on configuration.

#### Composite taxonomy fields (pattern + fragments)

For a composite field, define a `pattern` and a `fragments` map to extract and validate individual parts.
Fragment values are exposed as additional taxonomy keys (for example `taxonomy.verb`, `taxonomy.object`).

```yaml
taxonomy:
  action:
    title: Action
    type: string
    required: true
    pattern: "{verb} - {object}"
    fragments:
      verb:
        title: Verb
        type: string
        required: true
      object:
        title: Object
        type: string
        required: true
```

### spec.events.payload

Defines data sent to analytics targets.

```yaml
payload:
  targets:
    all: [web, ios, android]
    mobile: [ios, android]
  schema:
    event_name:
      type: string
      required: true
    event_category:
      type: string
      required: false
```

#### targets

Define target groups:

```yaml
targets:
  all: [web, ios, android]      # Required: defines all targets
  mobile: [ios, android]         # Optional alias
  desktop: [web]                 # Optional alias
```

#### schema

Shared payload field definitions:

```yaml
schema:
  event_name:
    type: string
    required: true
  application_id:
    type: string
    dict: data/application_id
```

Event files concretize these fields under `event.payload.*.schema` and can override specific properties (for example set a fixed `value`).
See `docs/schema/events.md` for the recommended merge rules.

### spec.events.pii

Configure PII metadata validation and masking conventions for payload fields.

In event payload field definitions, you can add:

- `pii.kind` (string, reserved) — what kind of PII the field contains (e.g. `email`, `user_id`)
- `pii.masker` (string, reserved) — masker implementation id
- Any additional `pii.*` keys for governance metadata (owner, tickets, notes, etc)

This section lets you:
- Require `pii.kind` and/or `pii.masker` when `pii` is present
- Restrict their values using dictionaries or checks
- Define additional PII metadata fields and validate them (via tooling)

Maskers are tool-defined. The specification defines a built-in masker id `star` that replaces the value with asterisks.
Additional maskers can be provided by tooling.

```yaml
pii:
  kind:
    required: true
    dict: governance/pii-kinds
  masker:
    required: false
  schema:
    owner:
      type: string
      dict: governance/pii-owners
      required: true
    jira:
      type: string
      required: true
      checks:
        pattern: "^[A-Z]+-[0-9]+$"
```

Notes:
- For `pii.kind` and `pii.masker`, `enum` and `dict` are mutually exclusive.
- For `pii.schema` fields, `enum` values must match `type`, and `enum` and `dict` are mutually exclusive.

### spec.transforms

Define reusable transform pipelines:

```yaml
transforms:
  slug:
    - lower
    - trim
    - replace:
        from: " "
        to: "_"
    - truncate: 160
```

Each transform step is either:
- a string step name (`lower`)
- a single-key object with parameters (`replace: { from: " ", to: "_" }`, `truncate: 160`)
