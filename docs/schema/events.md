# Event Files

Event files define individual analytics events with taxonomy metadata and payload specifications.

## Example

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/event.schema.json
opentp: 0.5.0

event:
  key: auth::login_button_click

  lifecycle:
    status: active

  taxonomy:
    area: auth
    event: login_button_click
    action: User clicks the login button

  payload:
    platforms:
      all:
        active: 1.0.0
        history:
          1.0.0:
            changes: []
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
| `ignoreChecks` | array | No | Skip specific validations |

### event.key

Unique identifier matching the pattern defined in `opentp.yaml`:

```yaml
key: auth::login_button_click
```

The key is typically generated from taxonomy values using transforms.

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

### event.taxonomy

Metadata fields defined in your `opentp.yaml`:

```yaml
taxonomy:
  area: auth
  event: login_button_click
  action: User clicks the login button
```

Values must match any configured dictionaries or rules.

### event.payload

#### Platform-specific payloads

```yaml
payload:
  platforms:
    all:
      active: 1.0.0
      history:
        1.0.0:
          schema:
            event_name:
              value: login_click

    ios:
      active: 1.0.0
      history:
        1.0.0:
          schema:
            event_name:
              value: login_click
            device_model:
              type: string
              required: true
```

Platform-specific fields use **full override** (not inheritance). Each platform must define its complete schema.

Each platform group can have:

| Field | Type | Description |
|-------|------|-------------|
| `active` | string | Current active version |
| `history` | object | Version history with schemas |

#### Version history

```yaml
history:
  1.0.0:
    changes: []
    schema:
      event_name:
        value: login_click

  1.1.0:
    changes:
      - Added auth_method field
    schema:
      event_name:
        value: login_click
      auth_method:
        type: string
        required: true
```

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

**Full field definition:**

```yaml
dimension_1:
  type: string
  title: Auth Method
  description: Method used to authenticate
  enum: [email, google, github]
  required: true
  rules:
    max-length: 50
```

### event.aliases

Track previous event keys for migrations:

```yaml
aliases:
  - key: old_login_click
    deprecated:
      reason: Renamed for consistency
      date: 2025-01-01
```

### event.ignoreChecks

Skip specific validations:

```yaml
ignoreChecks:
  - path: payload.schema.legacy_field
    reason: Temporary field for migration
```
