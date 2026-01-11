# opentp.yaml

The main configuration file defines your tracking plan structure, taxonomy, transforms, and validation rules.

## Minimal Example

```yaml
opentp: 0.5.0

info:
  title: My Tracking Plan
  version: 1.0.0

spec:
  events:
    key:
      pattern: "{area}::{event}"
    paths:
      events:
        root: /events
        pattern: "{area}/{event}.yaml"
    taxonomy:
      area:
        title: Area
        type: string
        required: true
      event:
        title: Event
        type: string
        required: true
    payload:
      platforms:
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
| `opentp` | string | Yes | Format version (e.g., "0.5.0") |
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

### spec.events

```yaml
spec:
  events:
    key:
      pattern: "{area | slug}::{event | slug}"
    paths:
      events:
        root: /events
        pattern: "{area}/{event}.yaml"
      dictionaries:
        root: /dictionaries
        pattern: "{path}.yaml"
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

#### paths.events

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for events |
| `pattern` | string | File path pattern using taxonomy fields |

#### paths.dictionaries

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Base directory for dictionaries |
| `pattern` | string | File path pattern (default: `{path}.yaml`) |

### spec.events.taxonomy

Defines metadata fields for organizing events.

```yaml
taxonomy:
  area:
    title: Area
    type: string
    dict: taxonomy/areas
    required: true
    rules:
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
| `rules` | object | Validation rules |

### spec.events.payload

Defines data sent to analytics platforms.

```yaml
payload:
  platforms:
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

#### platforms

Define platform groups:

```yaml
platforms:
  all: [web, ios, android]      # Required: defines all platforms
  mobile: [ios, android]         # Optional alias
  desktop: [web]                 # Optional alias
```

#### schema

Default payload fields for all events:

```yaml
schema:
  event_name:
    type: string
    required: true
  application_id:
    type: string
    dict: data/application_id
```

### spec.transforms

Define reusable transform pipelines:

```yaml
transforms:
  slug:
    steps:
      - step: lower
      - step: trim
      - step: replace
        params:
          pattern: " "
          with: "_"
      - step: truncate
        params:
          maxLen: 160
```

Each transform step has a uniform format: `{ step: 'name', params?: {...} }`

### spec.validators

Define external validators (webhooks):

```yaml
validators:
  my-validator:
    url: https://api.example.com/validate
    timeout: 5s
```

### spec.generators

Configure output generators:

```yaml
generators:
  - type: json
    output: ./dist/events.json
  - type: yaml
    output: ./dist/events.yaml
```

### spec.external

Load custom extensions:

```yaml
external:
  rules:
    - ./my-rules
  transforms:
    - ./my-transforms
  generators:
    - ./my-generators
```
