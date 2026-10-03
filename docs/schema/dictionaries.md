# Dictionaries

Dictionaries define allowed values that can be referenced across your tracking plan.

## Example

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/dict.schema.json
# dictionaries/taxonomy/areas.yaml
opentp: 2026-09

dict:
  type: string
  values:
    - auth
    - dashboard
    - onboarding
    - settings
    - profile
```

## Reference

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opentp` | string | Yes | Format version: `2026-09` |
| `dict` | object | Yes | Dictionary definition |
| `x-*` | any | No | Extensions |

### dict

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `string`, `number`, `integer`, or `boolean` |
| `values` | array | Yes | Allowed values: at least one, unique, of the given type |
| `x-*` | any | No | Extensions |

## Usage

### In Taxonomy

Reference a dictionary in your taxonomy definition:

```yaml
# opentp.yaml
spec:
  events:
    taxonomy:
      area:
        title: Area
        type: string
        dict: taxonomy/areas  # -> dictionaries/taxonomy/areas.yaml
        required: true
```

### In Payload

Reference a dictionary in a catalog field or a common field:

```yaml
# opentp.yaml
spec:
  events:
    payload:
      schema:
        auth_method:
          type: string
          dict: data/auth_methods
```

### In Event Files

Events inherit the dictionary of a catalog or common field. An event may pin one value of it, or narrow it with an `enum` or another dictionary whose values are a subset:

```yaml
# events/auth/login.yaml
event:
  payload:
    schema:
      auth_method:
        enum: [email, google]
        required: true
```

## Dictionary Path Resolution

Dictionary paths are relative to the dictionaries root:

```yaml
# opentp.yaml
spec:
  paths:
    events:
      root: /events
      template: "{area}/{event}.yaml"
    dictionaries:
      root: /dictionaries
```

Reference `taxonomy/areas` resolves to `dictionaries/taxonomy/areas.yaml` or `dictionaries/taxonomy/areas.yml`. Both files existing is an error. The dictionaries root is relative to the directory of `opentp.yaml`.

## Organization

Recommended structure:

```
dictionaries/
├── taxonomy/           # Taxonomy value dictionaries
│   ├── areas.yaml
│   └── teams.yaml
├── data/               # Payload value dictionaries
│   ├── application_id.yaml
│   └── auth_methods.yaml
└── governance/         # PII/governance metadata dictionaries (optional)
    ├── pii-kinds.yaml
    └── pii-owners.yaml
```

## Examples

### String dictionary

```yaml
# dictionaries/data/auth_methods.yaml
opentp: 2026-09

dict:
  type: string
  values:
    - email
    - google
    - github
    - apple
```

### Number dictionary

```yaml
# dictionaries/data/priority_levels.yaml
opentp: 2026-09

dict:
  type: number
  values:
    - 1
    - 2
    - 3
```

## Dictionary vs Enum

Use **dictionaries** when:
- Values are reused across multiple fields
- Values may change and need central management
- You want to validate consistency across the plan

Use **enum** (inline) when:
- Values are specific to one field
- Values are unlikely to change
- Simpler is better

```yaml
# opentp.yaml: catalog fields (spec.events.payload.schema)

# Dictionary reference
auth_method:
  type: string
  dict: data/auth_methods

# Inline enum
status:
  type: string
  enum: [active, inactive]
```

## Constraints

`enum`, `dict`, and `value` are mutually exclusive — a field definition can only use one of these. An `enum` needs at least one value.
