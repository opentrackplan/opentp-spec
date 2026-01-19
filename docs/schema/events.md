# Event Files

Event files define individual analytics events with taxonomy metadata and payload specifications.

## Example

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/event.schema.json
opentp: 2025-12

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
| `key` | string | Yes | Unique event identifier |
| `lifecycle` | object | No | Event status |
| `taxonomy` | object | Yes | Metadata fields |
| `payload` | object | Yes | Analytics data |
| `aliases` | array | No | Previous event keys |
| `ignore` | array | No | Skip specific validations |

### event.key

Unique identifier matching the pattern defined in `opentp.yaml`:

```yaml
key: auth::login_button_click
```

The key is typically generated from taxonomy values using `spec.events.key.pattern` in `opentp.yaml`.

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

Example (deprecated):

```yaml
lifecycle:
  status: deprecated
  deprecatedAt: "2025-01-01"
  deprecatedReason: "Replaced by new auth flow"
  replacedBy: auth::login_button_click_v2
```

### event.taxonomy

Metadata fields defined in your `opentp.yaml`:

```yaml
taxonomy:
  action: User clicks the login button
```

If a taxonomy field is present in `spec.paths.events.pattern` (for example `{area}/{event}.yaml`),
its value is extracted from the event file path and does not need to be duplicated in `event.taxonomy`.

Values must match any configured dictionaries or checks.

### event.payload

`payload` supports two forms:

1) **Implicit `all` target** (simplest):

```yaml
payload:
  schema:
    event_name:
      value: login_click
```

2) **Map of targets**:

```yaml
payload:
  all:
    schema:
      event_name:
        value: login_click

  ios:
    schema:
      event_name:
        value: login_click
      device_model:
        type: string
        required: true
```

Keys under `payload` are target selectors. Tooling should interpret them using `spec.events.payload.targets` from `opentp.yaml`:
- You can reference a concrete target like `web`/`ios`/`android`
- Or a target group/alias like `mobile` (which expands to multiple concrete targets)

#### Target payload

```yaml
all:
  schema:
    event_name:
      value: login_click
```

Selectors can overlap. If more than one selector applies to the same concrete target (for example `all` and `ios`), tooling should resolve them deterministically:

- Expand selectors to concrete targets using `spec.events.payload.targets`.
- For a given target, merge payload definitions from broad to narrow (selectors with larger target sets first).
- Selectors that overlap without a subset relationship are ambiguous and should be rejected.

To reduce duplication within a target’s version history, you can use `$ref` inside a payload version and let tooling resolve it.

#### Effective schema (opentp.yaml + event file)

`opentp.yaml` defines shared payload field definitions in `spec.events.payload.schema`.
Event files then **concretize** those fields (for a specific event/target/version) by providing `payload.*.schema`.

Tooling should build an **effective** field definition per payload field like this:

1) Start with the shared field definition from `opentp.yaml` (if the field exists there).
2) Apply the event payload field definition as an override (only for keys that are present).

Notes:
- If a field is `required: true` in `opentp.yaml`, tooling should validate that every payload schema includes that field (unless ignored).
- `enum`, `dict`, and `value` are mutually exclusive after the merge.
- If the override includes any of `value`, `enum`, or `dict`, tooling should first remove `value`, `enum`, and `dict` from the base definition, then apply the override.
- `value` should match the effective `type` (if `type` is present).

#### Versioned target payload

```yaml
all:
  current: "1.0.0"
  pre: "1.1.0-snap0" # optional tag (user-defined)

  "1.0.0":
    meta:
      changes: Initial version
    schema:
      event_name:
        value: login_click

  "1.1.0-snap0":
    $ref: "1.0.0"
    meta:
      changes:
        - Added auth_method
      deprecated:
        reason: Superseded by 1.2.0
        date: "2025-01-01"
    schema:
      auth_method:
        type: string
        required: true
```

In a versioned target:

| Key | Type | Description |
|-----|------|-------------|
| `current` | string | Default version/tag for tooling |
| `*` (string value) | string | Tag/alias pointing to a version key |
| `*` (object value) | object | Payload version object (`meta`, `schema`, `$ref`) |

Resolution rules (recommended):
- `current` can point to either a version key (object value) or an alias/tag key (string value).
- Alias/tag keys should resolve to a version key; cycles (aliases or `$ref`) are invalid.

#### `$ref` inheritance

If a payload version has `$ref`, tooling should treat it as schema inheritance:
- Start from the referenced version’s effective schema
- Apply the current version’s `schema` as an override (add new fields or override existing fields)
- `meta` is not inherited

#### Schema fields

Fields can be defined as:

**Fixed value:**

```yaml
event_name:
  value: login_click
```

**Typed field:**

```yaml
auth_method:
  type: string
  required: true
```

**With enum:**

```yaml
auth_method:
  type: string
  enum: [email, google, github]
  required: true
```

**With dictionary:**

```yaml
application_id:
  type: string
  dict: data/application_id
  required: true
```

### PII metadata

Fields can optionally include a `pii` object with masking and governance metadata.

Two keys are reserved and understood by tooling:
- `pii.kind` — what kind of PII this is (e.g. `email`, `ip`, `user_id`)
- `pii.masker` — masker implementation id

Additional `pii.*` keys are allowed for governance (owner, tickets, notes, etc) and can be validated by tooling using `spec.events.pii.schema` from `opentp.yaml`.

The specification defines a built-in masker id `star` that replaces the value with asterisks.
Other masker ids are tool-defined.

**Full field definition:**

```yaml
email:
  type: string
  title: Email
  description: User email (masked before sending)
  required: true
  pii:
    kind: email
    masker: star
    owner: data-governance
    jira: ANALYTICS-123
  checks:
    max-length: 320
```

`checks` is a free-form map of `checkId -> params`. Tooling may support only a subset and can warn or error on unknown check IDs.
Tooling should apply `pii.masker` before exporting/sending values. Tooling may also choose to mask before any processing/validation that could log values.

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
- `event.key` (or `key`) — skip event key mismatch validation
- `taxonomy.<field>` — skip validation for a taxonomy field
- `payload::<field>` — skip validation for a payload field across all targets/versions
- `payload.<target>.schema.<field>` — skip validation for a field on a specific target
- `payload.<target>.<version>.schema.<field>` — skip validation for a field on a specific target+version
