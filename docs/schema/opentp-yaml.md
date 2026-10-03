# opentp.yaml

The main configuration file defines your tracking plan structure (paths), targets and their common fields, portable checks, taxonomy, the field catalog and PII conventions.

## Minimal Example

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

  targets:
    all:
      schema:
        event_name:
          type: string
          policy: fixed

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
        screen_name:
          type: string
```

Every event of this plan sends `event_name` and must set its value; events may also use `screen_name`.

## Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opentp` | string | Yes | Format version: `2026-09` |
| `info` | object | Yes | Project metadata: `title`, `version` (a string), `description`, `contact` (list of strings) |
| `spec` | object | Yes | Tracking plan specification |
| `x-*` | any | No | [Extensions](#extensions) |

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

Roots are relative to the directory of `opentp.yaml`; a leading `/` means that directory, not the filesystem root.

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
- A template that ends in `.yaml` or `.yml` matches files with either extension.
- When a path matches, the extracted values are added to `event.taxonomy` (tooling may treat mismatches as errors if the event file also specifies the same keys).

Example:

- `root: /events`
- `template: "{area}/{event}.yaml"`
- Event file: `events/auth/login_click.yaml` → extracts `area=auth`, `event=login_click`

### paths.dictionaries

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for dictionaries |
| _(no other fields)_ |  | A dictionary reference `<dict>` resolves to `<root>/<dict>.yaml` or `<root>/<dict>.yml` |

## spec.targets

Targets are identifiers for where events are sent (for example `web`, `ios`, `ios-ga`). They are listed in `spec.events.payload.targets.all`.

`spec.targets` holds the **common fields**: fields that are part of every event.

- `spec.targets.all.schema`: common to every target;
- `spec.targets.<targetId>.schema`: common to one target (for example the device model on iOS).

Keys of `spec.targets` must be `all` or ids from `spec.events.payload.targets.all`; selector groups such as `mobile` are not allowed here.

```yaml
spec:
  targets:
    all:
      title: Every target
      schema:
        application_id:
          type: string
          dict: data/application_id
          policy: fixed
        platform:
          type: string
          required: true
    ios:
      title: iOS app
      schema:
        device_model:
          type: string
        os_version:
          type: string
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Human-readable name |
| `description` | string | Description |
| `schema` | object | Common fields (`field.schema.json`) |
| `x-*` | any | [Extensions](#extensions) |

Notes:

- Layers merge in this order: catalog, `spec.targets.all`, `spec.targets.<targetId>`, event. A common field that an event does not list is part of the event as defined here; an event may narrow it (for example set a `value` from the dictionary), but never change its type or a fixed value.
- Common fields need a `type` after merging (from the catalog, `all` or the target).
- `required: true` on a common field means present in every hit of that target.

## spec.checks

Portable named checks: checks built only from portable keywords, so every tool can run them. Fields, taxonomy fields and pii fields apply them with `checks: { <checkId>: true }`, and `false` disables one that an earlier layer set.

```yaml
spec:
  checks:
    jira-key:
      title: Jira issue key
      pattern: "^[A-Z]+-[0-9]+$"
    short-label:
      maxLength: 40
```

| Field | Description |
|-------|-------------|
| `title`, `description` | Documentation |
| `minLength`, `maxLength`, `pattern`, `format` | Apply to string values |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` | Apply to number values |
| `x-*` | [Extensions](#extensions) |

A check needs at least one portable keyword. Check ids match `^[A-Za-z][A-Za-z0-9_.-]*$`. Ids that are not defined here are tool-defined (see [Checks](../semantics.md#checks)).

## spec.events

### events.key (constraints only)

Defines portable constraints for `event.key` (which is an opaque string identifier and must be unique within a tracking plan).

Because `event.key` is always a string, `type: string` is implicit here.

```yaml
spec:
  events:
    key:
      minLength: 3
      maxLength: 160
      pattern: "^[a-z0-9_]+::[a-z0-9_]+$"
```

Generating keys from taxonomy values is tool configuration, not part of the specification (the reference CLI reads it from `opentp.cli.yaml`).

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

Each taxonomy field requires `title` and `type` (`string`, `number`, `integer` or `boolean`) and can use a small JSON-Schema-like constraint set, depending on `type`:

- string: `minLength`, `maxLength`, `pattern`, `format`
- number/integer: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- any type: `required`, `enum` (at least one value) or `dict`

For other rules, use `checks` (portable checks from `spec.checks`, or tool-defined check ids):

```yaml
action:
  title: Action
  type: string
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

Defines the targets and the **field catalog**.

```yaml
payload:
  targets:
    all: [web, ios, android]
    mobile: [ios, android]
  schema:
    dimension_1: &dim
      type: string
    dimension_2: *dim
    screen_name:
      type: string
      title: Screen name
      description: Name of the screen or page where the event happened
      example: login
    auth_method:
      type: string
      enum: [email, google, github, apple]
    user_id:
      type: string
```

Notes:

- `payload.targets` defines selector groups. `all` is required and reserved: the canonical, non-empty list of target ids (unique, non-empty strings). Other selector groups list only ids from `all`.
- In event files, payload keys can be selectors (keys from `payload.targets`) or direct target IDs (values from `payload.targets.all`), but each target ID must be covered at most once per event (no overlaps).
- `payload.schema` is the **catalog**: every field events may use. Being in the catalog does not put a field into an event; an event lists the catalog fields it uses. It is optional (default `{}`).
- A catalog field needs `type`; an array field also needs `items`.
- Event fields inherit everything from the catalog (and the common fields), so events write only what is specific to them (`{}`, a `value`, a narrower `enum`, `required: true`).
- An event field that is neither in the catalog nor a common field of each target its payload covers is an error (closed vocabulary).
- `name` is a code-facing field name (for example a generated parameter name). It does not rename the canonical payload key.
- `example` is a representative value for documentation, mock data, and generators. It must satisfy the field (type, constraints, `enum` or `dict`).
- **Slots** such as `dimension_1` are typed once in the catalog; each event gives a slot its meaning with `name`, `title` and `enum`. Use YAML anchors for many slots (`dimension_2: *dim`); merge keys (`<<`) are not supported, and validators report them as errors.

#### policy

`policy` on a catalog or common field says what every event must do with the field. It replaces `valueRequired` (2026-01).

| `policy` | Every event must | The field in hits |
|---|---|---|
| (none) | nothing | as `required` says |
| `specified` | list the field (`{}` is enough) | as `required` says |
| `restricted` | list it and restrict it with `value`, `enum` or `dict` | always present |
| `fixed` | list it and set its `value` | always present |

```yaml
spec:
  targets:
    all:
      schema:
        application_id:
          type: string
          dict: data/application_id
          policy: fixed
        event_category:
          type: string
          policy: restricted
        event_label:
          type: string
          policy: specified
```

- `policy` is not allowed in event files.
- A field with `policy: restricted` or `fixed` is always present, so `required: false` next to it is invalid (and `required` need not be written).
- On an array field, `restricted` can only be satisfied with `value`: array fields take no top-level `enum` or `dict`, and `items.enum` or `items.dict` only constrain the elements.
- Payload versions marked `meta.deprecated` are exempt; `lifecycle.status` exempts nothing.
- Legitimate exceptions use `event.ignore` with the field's payload path (for example `payload.event_category`) and a reason.

#### Schema composition (merge/precedence)

See [Semantics](../semantics.md#layers-and-merge) for the normative merge rules, presence and policy.

### spec.events.pii

Configure PII metadata conventions for payload fields.

In payload field definitions, you can add:

- `pii.kind` (string, reserved) — what kind of PII the field contains (e.g. `email`, `user_id`)
- `pii.masker` (string, reserved) — masker implementation id
- Any additional `pii.*` keys for governance metadata (owner, tickets, notes, etc)

This section lets you:
- Require `pii.kind` and/or `pii.masker` when `pii` is present
- Restrict their values using dictionaries, portable constraints or `checks`
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
      checks:
        jira-key: true
```

## Extensions

Any key that starts with `x-` is allowed on the fixed-shape objects of `opentp.yaml`: the root, `info`, `spec`, `spec.paths` and its entries, `spec.events`, `spec.events.key`, `spec.events.payload`, `spec.events.pii` and its entries, `spec.targets.<id>`, `spec.checks.<id>`, taxonomy fields and fragments, fields and array `items`. Tools ignore the keys they do not know.

```yaml
spec:
  targets:
    ios:
      title: iOS app
      x-acme-team: mobile-platform
```

`x-opentp` is reserved and invalid (it held tool settings until 2026-01). Keys of maps that you name (targets, checks, taxonomy fields, catalog fields) are never treated as extensions. Full list: [Extensions](../semantics.md#extensions).
