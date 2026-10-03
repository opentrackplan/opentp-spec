# Event Files

Event files define individual analytics events with taxonomy metadata and payload schemas.

## Example

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/event.schema.json
opentp: 2026-09

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
          auth_method:
            enum: [email, google, github]
            required: true
```

`event_name` and `auth_method` are defined in `opentp.yaml` (as common fields or in the catalog), so the event only pins `event_name` and narrows `auth_method`.

## Reference

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opentp` | string | Yes | Format version: `2026-09` |
| `event` | object | Yes | Event definition |
| `x-*` | any | No | Extensions |

### event

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique event identifier (opaque string) |
| `lifecycle` | object | No | Event status |
| `taxonomy` | object | Yes | Metadata fields |
| `payload` | object | Yes | Analytics data |
| `aliases` | array | No | Previous event keys |
| `ignore` | array | No | Skip specific validations |
| `x-*` | any | No | Extensions (for example `x-acme-team`) |

`x-*` keys are also allowed on `lifecycle`, `aliases[]`, `aliases[].deprecated`, `ignore[]`, payload versions, `meta` and `meta.deprecated`. `x-opentp` is invalid everywhere (see [Extensions](../semantics.md#extensions)).

### event.key

`event.key` is an opaque string identifier that must be unique within the tracking plan.

Portable constraints for keys can be configured in `opentp.yaml` via `spec.events.key` (constraints only). Key generation is not part of the specification (see [opentp.yaml](./opentp-yaml.md#eventskey-constraints-only)).

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
| `deprecatedAt` | string (date) | Date when the event was deprecated (RFC 3339 full-date, quoted: `"2025-01-31"`) |
| `deprecatedReason` | string | Reason for deprecation |
| `replacedBy` | string | Key of the replacement event |

`lifecycle.status` is documentation: it does not exempt the event from any rule. A deprecated event still describes hits that old builds send.

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

1) **Implicit form** (simplest): `payload.schema` (or `payload.current` for versions) applies to every target in `spec.events.payload.targets.all`:

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
- In a single event file, a target ID must be covered at most once (no overlaps between selectors/targets). A target matched by more than one key is an error (ambiguous payload definition).
- A target that no key covers is a target on which the event is not sent. This is valid.
- If you want one payload definition to apply to every target, use the implicit form (`payload.schema` / `payload.current`), which applies to `payload.targets.all`.

The normative selector → target algorithm is in [Semantics](../semantics.md#payload-resolution).

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
          enum: [email, google]
```

Aliases (tags) and `$ref`:

- Version keys are entries with object values (payload versions); aliases/tags are entries with string values pointing to other keys.
- `current` may be a version key or an alias/tag; it must resolve to a version key. It is what new code sends; every version remains a valid shape of the event.
- `$ref` derives schema from another version (same payload key or `otherPayloadKey::versionKey`). A derived version may change values freely, but not a field's `type`, and it cannot weaken `required`. See [Semantics](../semantics.md#derived-versions-ref) for the full resolution rules.
- A version marked `meta.deprecated` is exempt from `policy`: use it for history, such as an old build that did not send a field yet.
- Quote version keys and alias values that look like numbers (`"1.0"`).

#### Effective payload schema (merge/precedence)

See [Semantics](../semantics.md#layers-and-merge) for the normative merge rules (catalog, common fields, event), presence and policy.

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
      ios_extra: {}
  android-ga:
    schema:
      android_extra: {}
```

**Don’t: define overlapping payload keys**

<!-- invalid: covered more than once -->
```yaml
# Ambiguous: ios/android are covered by both keys
payload:
  all:
    schema: {}
  mobile:
    schema: {}
```

### Payload field definition

Payload fields use the shared `Field` schema (`field.schema.json`). Every field in an event must be a catalog field (`spec.events.payload.schema`) or a common field of each target the payload covers (`spec.targets`); anything else is an error (closed vocabulary).

Event fields **inherit** their definition from the catalog and the common fields, so `type` is optional and an event writes only what is specific to it. `{}` lists a field unchanged.

| Field | Description |
|-------|-------------|
| `name` | Code-facing field name (for example a generated parameter name). The YAML key remains the canonical payload field key; code-facing names are unique within an event version |
| `title` | Human-readable field title |
| `description` | Field description |
| `type` | `string`, `number`, `integer`, `boolean`, or `array`. Optional: inherited; if written, it must equal the inherited type |
| `required` | `true`: the field is present in every hit. An event cannot set `false` when a base layer says `true`, or when the field has a `value` or `policy: restricted`/`fixed` |
| `value` | Fixed value: the field is always present with this value (must be allowed by the base `enum`/`dict`, and cannot change a fixed base value) |
| `enum` | Allowed values: at least one, a subset of the base `enum`/`dict` (mutually exclusive with `dict` and `value`). Not on array fields: use `items.enum` |
| `dict` | Dictionary reference whose values are a subset of the base `enum`/`dict` (mutually exclusive with `enum` and `value`). Not on array fields: use `items.dict` |
| `example` | Example value for documentation, mock data, and generators. It must satisfy the field |
| `pii` | PII metadata (reserved keys: `kind`, `masker`; extra keys allowed) |
| `checks` | Checks by id: `{ <checkId>: <params> }` (see [Checks](../semantics.md#checks)) |
| `x-*` | Extensions |

Not allowed in event files: `policy` (it belongs to catalog and common fields), `valueRequired` and `x-opentp` (removed in 2026-09).

Constraints (JSON-Schema-like, portable; they add to the inherited ones):

- string: `minLength`, `maxLength`, `pattern`, `format`
- number/integer: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- array: `items` (scalar-only; `items.enum` or `items.dict` restrict the elements), `minItems`, `maxItems`, `uniqueItems`

Each group applies only to its type, and so do top-level `enum` and `dict` (not on arrays). An event field that inherits its type is checked against the inherited type, so `minLength` on an integer field, `items` on a string field or `enum` on an array field is an error that `ignore` cannot silence (see [Effective field rules](../semantics.md#effective-field-rules)).

Examples (each field is defined in the catalog or as a common field):

**List a catalog field unchanged**

```yaml
screen_name: {}
```

**Constant value**

```yaml
event_name:
  value: login_click
```

**Narrow an enum and make the field required**

```yaml
auth_method:
  enum: [email, google]
  required: true
  example: email
```

**String with constraints**

```yaml
email:
  example: user@example.com
  format: email
  maxLength: 320
```

**Payload slot with logical name**

Use `name` when the payload field key is a transport or vendor slot, but the field has a clearer logical/code-facing name:

```yaml
dimension_1:
  name: orgType
  title: Organization Type
  description: Logical organization type stored in analytics slot dimension_1.
  enum: [startup, enterprise, agency]
  example: enterprise
```

`dimension_1` remains the canonical payload field key. `name` does not rename the payload field or change validation paths.

**Array of scalar items**

```yaml
tags:
  example: [auth, login]
  uniqueItems: true
  items:
    enum: [auth, login, signup]
```

A catalog definition of the same array field needs `type: array` and `items` with `type`:

```yaml
tags:
  type: array
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

```yaml
user_id:
  pii:
    kind: user_id
    masker: star
    owner: analytics
    jira: ANALYTICS-123
```

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

Skip specific checks for this event. `reason` is optional but recommended.

```yaml
ignore:
  - path: payload::legacy_field
    reason: Temporary field for migration
  - path: payload.event_category
    reason: Page views have no category
```

Path forms (normative core; tools may support more):

- `key` or `event.key` — key checks (constraints and tool key checks such as a generated-key mismatch)
- `opentp` — the version check of this file
- `taxonomy.<field>` — checks on a taxonomy field or fragment (on a composite field, also its fragments)
- `payload::<field>` — field-level checks of a payload field on every target and version (the only form for a field name that contains `.`)
- `payload.<field>` — the same (later segments, such as `payload.<field>.value`, are ignored)
- `payload.<target>.schema.<field>` or `payload.<target>.<version>.schema.<field>` — the same: the field after the first `.schema.` is silenced on every target and version

Unknown fields, `policy` in an event, contradictions of `required: false`, type conflicts (including keywords that do not fit the inherited type), changes to a fixed value, YAML merge keys (`<<`), payload resolution errors and problems in `opentp.yaml` can never be ignored. An ignore path that matches nothing is not an error. Full rules: [Ignore](../semantics.md#ignore).
