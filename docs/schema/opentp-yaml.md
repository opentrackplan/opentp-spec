# opentp.yaml

The main configuration file defines your tracking plan structure (paths), targets, taxonomy, payload schema, and optional tooling extensions.

## Minimal Example

```yaml
opentp: 2026-01

info:
  title: My Tracking Plan
  version: 1.0.0

spec:
  paths:
    events:
      root: /events
      template: "{area}/{event}.yaml"

  events:
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

## Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opentp` | string | Yes | Format version (e.g., `2026-01`) |
| `info` | object | Yes | Project metadata |
| `spec` | object | Yes | Tracking plan specification |

## spec.paths

```yaml
spec:
  paths:
    events:
      root: /events
      template: "{area}/{event}.yaml"
    dictionaries:
      root: /dictionaries
```

### paths.events

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for events |
| `template` | string | File path template using taxonomy fields |

Fields used in `spec.paths.events.template` are extracted from the event file path and added to `event.taxonomy`.
If a field is present in the path template, it does not need to be duplicated inside the event YAML.

#### paths.events.template syntax

`template` is a placeholder-based path template. Placeholders are written as `{fieldId}` where `fieldId` matches:

- `/^[A-Za-z_][A-Za-z0-9_]*$/`

Rules:

- `fieldId` should be a taxonomy field key defined under `spec.events.taxonomy` (for example `area`, `event`).
- Matching is performed against the event file path **relative to** `paths.events.root` (no leading slash).
- Placeholders match a single path segment (they do not span `/`).
- This is **not** a regex: no wildcards, no transforms, and no special escaping rules are defined.
- When a path matches, the extracted values are added to `event.taxonomy` (tooling may treat mismatches as errors if the event file also specifies the same keys).

Example:

- `root: /events`
- `template: "{area}/{event}.yaml"`
- Event file: `events/auth/login_click.yaml` → extracts `area=auth`, `event=login_click`

### paths.dictionaries

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for dictionaries |
| _(no other fields)_ |  | Dictionary paths are resolved as `<root>/<dict>.yaml` |

## spec.targets

Targets are identifiers for where events are sent (for example `ios-ga`, `ios-ampl`, `web-ga`).

`spec.targets.<targetId>.schema` defines a base/shared schema for that target.
Tooling may merge it into every event payload for that target.

Target IDs should match the IDs listed under `spec.events.payload.targets.all`.

```yaml
spec:
  targets:
    ios-ga:
      title: iOS (GA4)
      schema:
        os_name:
          type: string
          x-opentp:
            role: shared
        os_version:
          type: string
        app_version:
          type: string
```

## spec.events

### events.key (constraints only)

Defines portable constraints for `event.key` (which is an opaque string identifier and must be unique within a tracking plan).

Because `event.key` is always a string, `type: string` is implicit here.

This section does **not** define key generation.
If you want key generation and auto-fix, use `spec.events.x-opentp.keygen` (tooling extension).

```yaml
spec:
  events:
    key:
      minLength: 3
      maxLength: 160
      pattern: "^[a-z0-9_]+::[a-z0-9_]+$"
```

### spec.events.x-opentp (extensions)

`x-opentp` is the reserved extension container used by OpenTrackPlan reference tooling.
Extensions are optional and should not be required for interoperability.

#### x-opentp.keygen

Tooling-defined event key generation configuration:

```yaml
spec:
  events:
    x-opentp:
      keygen:
        template: "{area | slug}::{event | slug}"
        transforms:
          slug:
            - lower
            - trim
            - replace:
                from: " "
                to: "_"
            - truncate: 160
```

Keygen template syntax (tooling-defined):

- Placeholders are written as `{taxonomyKey}`.
- A placeholder can optionally apply one or more transforms: `{taxonomyKey | transformId | transformId}`.
- Whitespace around `|` is ignored.
- Placeholder values come from the resolved taxonomy map (including path-extracted fields and composite fragments).
- `transformId` must be defined under `spec.events.x-opentp.keygen.transforms` and is applied as a pipeline to the placeholder string value.

Placeholder grammar (informal):

- `{name}` or `{name | transformId (| transformId)*}`
- `name` and `transformId` should match `/^[A-Za-z_][A-Za-z0-9_]*$/`

### spec.events.taxonomy

Defines metadata fields for organizing events.

```yaml
taxonomy:
  area:
    title: Area
    type: string
    dict: taxonomy/areas
    required: true
    maxLength: 50
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

Each taxonomy field can use a small JSON-Schema-like constraint set, depending on `type`:

- string: `minLength`, `maxLength`, `pattern`, `format` (hint)
- number/integer: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`

For custom (non-portable) checks, tooling can use `x-opentp.checks`:

```yaml
action:
  title: Action
  type: string
  x-opentp:
    checks:
      myteam.custom-check: { some: params }
```

#### Composite taxonomy fields (template + fragments)

For a composite field, define a `template` and a `fragments` map to extract and validate individual parts.
Fragment values are exposed as additional taxonomy keys (for example `taxonomy.verb`, `taxonomy.object`).

Composite template syntax:

- Placeholders are written as `{fragmentId}` and must reference keys in `fragments`.
- Tooling extracts fragments by matching the composite field value against the `template`, treating placeholders as captures and all other text as literal.
- If the value does not match the template, tooling should treat it as a validation error.
- Each fragment id should appear exactly once in the template.
- Fragment ids become taxonomy keys and should not collide with other taxonomy field ids.

```yaml
taxonomy:
  action:
    title: Action
    type: string
    required: true
    template: "{verb} - {object}"
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
    application_id:
      type: string
      dict: data/application_id
      required: true
    event_name:
      type: string
      required: true
    event_category:
      type: string
      required: true
    user_id:
      type: string
      required: false
```

Notes:
- `payload.targets` defines selector groups. `all` is required and reserved.
- `payload.targets.all` is the canonical list of target IDs for the tracking plan. Other selector groups should only include IDs from `all`.
- In event files, payload keys can be selectors (keys from `payload.targets`) or direct target IDs (values from `payload.targets.all`), but each target ID must be covered at most once per event (no overlaps).
- Tooling may merge `spec.targets.<targetId>.schema` into each event payload for that target.

#### valueRequired (pinned values per event)

Some fields are **event characteristics** that must be pinned to a single constant per event (for example `application_id`).

Set `valueRequired: true` on the base field definition. Tooling must treat it as an error if an event does not define a fixed `value` for that field (after merge/precedence and `$ref` resolution).

`valueRequired` is independent of `required`:

- `required: true` + `valueRequired: true` — required constant
- `required: false` + `valueRequired: true` — optional constant (may be omitted in payload, but if present it must equal the fixed `value`)

Example:

```yaml
spec:
  events:
    payload:
      schema:
        application_id:
          type: string
          dict: data/application_id
          valueRequired: true
```

#### Schema composition (merge/precedence)

See [Semantics](../semantics.md#effective-payload-schema-merge-and-precedence) for the normative merge/precedence and conflict rules.

### spec.events.pii

Configure PII metadata conventions for payload fields.

In event payload field definitions, you can add:

- `pii.kind` (string, reserved) — what kind of PII the field contains (e.g. `email`, `user_id`)
- `pii.masker` (string, reserved) — masker implementation id
- Any additional `pii.*` keys for governance metadata (owner, tickets, notes, etc)

This section lets you:
- Require `pii.kind` and/or `pii.masker` when `pii` is present
- Restrict their values using dictionaries or portable constraints
- Define additional PII metadata fields and validate them (via tooling)

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
      pattern: "^[A-Z]+-[0-9]+$"
```

## Extensions (x-opentp)

This spec defines the following extension keys:

- `spec.events.x-opentp.keygen` — key generation template and transforms (tooling-defined)
- `x-opentp.checks` — custom validation checks (tooling-defined)
- `x-opentp.role` — field role hint (`constant`, `attribute`, `shared`)
