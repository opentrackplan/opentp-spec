# Event Files

Event files define individual analytics events with taxonomy metadata and payload schemas.

## Example

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/event.schema.json
opentp: 2026-01

event:
  key: auth::login_button_click

  lifecycle:
    status: active

  taxonomy:
    action: User clicks the login button

  payload:
    all:
      current: "1.0.0"
      "1.0.0":
        meta:
          changes: Initial version
        schema:
          event_name:
            value: login_button_click
            x-opentp:
              role: constant
          auth_method:
            type: string
            enum: [email, google, github]
            required: true
```

## Reference

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opentp` | string | Yes | Format version |
| `event` | object | Yes | Event definition |

### event

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique event identifier (opaque string) |
| `lifecycle` | object | No | Event status |
| `taxonomy` | object | Yes | Metadata fields |
| `payload` | object | Yes | Analytics data |
| `aliases` | array | No | Previous event keys |
| `ignore` | array | No | Skip specific validations |

### event.key

`event.key` is an opaque string identifier that must be unique within the tracking plan.

Portable constraints for keys can be configured in `opentp.yaml` via `spec.events.key` (constraints only).
Tooling may also support key generation via `spec.events.x-opentp.keygen` (extension).

### event.lifecycle

```yaml
lifecycle:
  status: active  # active | deprecated | draft
```

| Status | Description |
|--------|-------------|
| `active` | Event is in production |
| `deprecated` | Event is being phased out |
| `draft` | Event is being developed |

Lifecycle fields:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `active`, `deprecated`, or `draft` |
| `deprecatedAt` | string (date) | Date when the event was deprecated (ISO 8601) |
| `deprecatedReason` | string | Reason for deprecation |
| `replacedBy` | string | Key of the replacement event |

### event.taxonomy

Metadata fields defined in your `opentp.yaml` under `spec.events.taxonomy`:

```yaml
taxonomy:
  action: User clicks the login button
```

If a taxonomy field is present in `spec.paths.events.template` (for example `{area}/{event}.yaml`),
its value is extracted from the event file path and does not need to be duplicated in `event.taxonomy`.

### event.payload

`payload` supports two forms:

1) **Implicit `all` selector** (simplest):

```yaml
payload:
  schema:
    event_name:
      value: login_click
```

2) **Map form** (`payload.<key>`) where `key` is either:

- a selector id defined in `opentp.yaml` under `spec.events.payload.targets`, or
- a direct target id listed in `spec.events.payload.targets.all`.

```yaml
payload:
  mobile:
    schema:
      event_name:
        value: login_click
  web:
    schema:
      event_name:
        value: login_click
```

Resolution rules (no overlaps):

- Each `payload.<key>` expands to one or more target IDs.
- In a single event file, a target ID must be covered at most once (no overlaps between selectors/targets). If a target is matched multiple times, tooling should treat it as an error (ambiguous payload definition).
- If you want one payload definition to apply to every target, use the implicit form (`payload.schema` / `payload.current`), which applies to `payload.targets.all`.

#### Canonical resolution algorithm (selectors → targets)

Given an event file and its corresponding `opentp.yaml`:

1) Read `spec.events.payload.targets`. `all` is required and reserved.
2) Collect `allTargets = spec.events.payload.targets.all` (canonical list of target IDs).
3) If `event.payload` is in implicit form (`payload.schema` or `payload.current` at the top level), apply that payload definition to every target in `allTargets` and stop.
4) Otherwise, treat `event.payload` as map form and iterate its keys.
5) For each `payloadKey`:
   - If `payloadKey` exists in `spec.events.payload.targets`, expand it to that selector’s list of target IDs.
   - Else if `payloadKey` is present in `allTargets`, treat it as a direct target ID.
   - Else: error (unknown selector/target).
6) Ensure each target ID is assigned at most once across all payload keys. If any target appears more than once: error (ambiguous overlap).

For each selector/target payload definition you can choose:

- **Unversioned**: `{ schema, meta? }`
- **Versioned**: `{ current, <versions>, <aliases> }`

#### Unversioned payload

```yaml
payload:
  schema:
    event_name:
      value: login_click
```

#### Versioned payload

```yaml
payload:
  all:
    current: "1.1.0"
    "1.0.0":
      schema:
        event_name:
          value: login_click
    "1.1.0":
      $ref: "1.0.0"
      meta:
        changes:
          - Added auth_method
      schema:
        auth_method:
          type: string
          enum: [email, google]
```

Aliases (tags) and `$ref`:

- Version keys are entries with object values (payload versions); aliases/tags are entries with string values pointing to other keys.
- `current` may be a version key or an alias/tag; it must resolve to a version key.
- `$ref` derives schema from another version (same payload key or `otherPayloadKey::versionKey`). See [Semantics](../semantics.md#versioned-payloads-current-aliases-and-ref) for the full resolution rules.

#### Effective payload schema (merge/precedence)

See [Semantics](../semantics.md#effective-payload-schema-merge-and-precedence) for the normative merge/precedence and conflict rules.

#### Do / Don’t

**Do: use implicit form when the payload is the same for every target**

```yaml
payload:
  schema:
    event_name:
      value: login_click
```

**Do: use disjoint selectors (or direct target IDs) when targets differ**

```yaml
payload:
  ios-ga:
    schema:
      ios_extra:
        type: string
        required: false
  android-ga:
    schema:
      android_extra:
        type: string
        required: false
```

**Don’t: define overlapping payload keys**

```yaml
# Ambiguous: ios/android are covered by both keys
payload:
  all:
    schema: {}
  mobile:
    schema: {}
```

### Payload field definition

Payload fields use the shared `Field` schema (`field.schema.json`).

Common properties:

| Field | Description |
|-------|-------------|
| `type` | `string`, `number`, `integer`, `boolean`, or `array` |
| `required` | Whether the field must exist in payload schemas |
| `value` | Fixed value (constant) |
| `enum` | Allowed values (mutually exclusive with `dict` and `value`) |
| `dict` | Dictionary reference (mutually exclusive with `enum` and `value`) |
| `pii` | PII metadata (reserved keys: `kind`, `masker`; extra keys allowed) |
| `x-opentp` | Tooling extensions (custom checks and role hints) |

Constraints (JSON-Schema-like, portable):

- string: `minLength`, `maxLength`, `pattern`, `format` (hint)
- number/integer: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- array: `items` (scalar-only), `minItems`, `maxItems`, `uniqueItems`

Examples:

**Constant value**

```yaml
event_name:
  value: login_click
  x-opentp:
    role: constant
```

**String with constraints**

```yaml
email:
  type: string
  format: email
  maxLength: 320
```

**Array of scalar items**

```yaml
tags:
  type: array
  uniqueItems: true
  items:
    type: string
    minLength: 1
```

#### PII metadata

Fields can optionally include a `pii` object with masking and governance metadata.

Two keys are reserved and understood by tooling:
- `pii.kind` — what kind of PII this is (e.g. `email`, `ip`, `user_id`)
- `pii.masker` — masker implementation id

Additional `pii.*` keys are allowed for governance and can be validated by tooling using `spec.events.pii.schema` from `opentp.yaml`.

The specification defines a built-in masker id `star` that replaces the value with asterisks.
Other masker ids are tooling-defined.

### event.aliases

Track previous event keys for migrations:

```yaml
aliases:
  - key: old_login_click
    deprecated:
      reason: Renamed for consistency
      date: "2025-01-01"
```

### event.ignore

Skip specific validations:

```yaml
ignore:
  - path: payload::legacy_field
    reason: Temporary field for migration
```

Common path conventions (tooling-defined):

- `event.key` (or `key`) — skip key validation checks
- `taxonomy.<field>` — skip validation for a taxonomy field
- `payload::\<field>` — skip validation for a payload field across all selectors/targets
- `payload.<target>.schema.<field>` — skip validation for a field on a specific target
- `payload.<target>.<version>.schema.<field>` — skip validation for a field on a specific target+version
