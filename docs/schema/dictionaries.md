# Dictionaries

Dictionaries define allowed values that can be referenced across your tracking plan.

## Example

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/dict.schema.json
# dictionaries/taxonomy/areas.yaml
opentp: 2026-01

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
| `opentp` | string | Yes | Format version |
| `dict` | object | Yes | Dictionary definition |

### dict

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `string`, `number`, `integer`, or `boolean` |
| `values` | array | Yes | Allowed values |

## Usage

### In Taxonomy

Reference a dictionary in your taxonomy definition:

```yaml
# opentp.yaml
spec:
  events:
    taxonomy:
      area:
        type: string
        dict: taxonomy/areas  # -> dictionaries/taxonomy/areas.yaml
        required: true
```

### In Payload

Reference a dictionary in payload fields:

```yaml
# opentp.yaml
spec:
  events:
    payload:
      schema:
        application_id:
          type: string
          dict: data/application_id
```

### In Event Files

Reference a dictionary in event-specific fields:

```yaml
# events/auth/login.yaml
payload:
  schema:
    auth_method:
      type: string
      dict: data/auth_methods
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

Reference `taxonomy/areas` resolves to `dictionaries/taxonomy/areas.yaml`.

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
opentp: 2026-01

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
opentp: 2026-01

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
# Dictionary reference
auth_method:
  dict: data/auth_methods

# Inline enum
status:
  enum: [active, inactive]
```

## Constraints

`enum`, `dict`, and `value` are mutually exclusive — a field can only use one of these.
