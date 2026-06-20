# Semantics

This document defines cross-cutting, normative behavior for OpenTrackPlan implementations.
It complements the JSON schemas by specifying resolution rules and merge/precedence semantics.

## Payload Resolution Overview

Event payloads can be defined either:

- in **implicit form** (`payload.schema` / `payload.current`), which applies to every target in `spec.events.payload.targets.all`, or
- in **map form** (`payload.<selectorOrTargetId>`), where keys are selectors from `spec.events.payload.targets` or direct target IDs from `spec.events.payload.targets.all`.

In a single event, a target ID must be covered at most once (no overlaps).
For the canonical selectors → targets algorithm, see [Event Files](./schema/events.md).

## Effective Payload Schema (Merge and Precedence)

Tooling typically computes an **effective schema** per event, per target, and (when versioned) per selected version.

### Layers

When building an effective payload schema for a specific `targetId`, merge these layers in order:

1) **Global base schema**: `spec.events.payload.schema`
2) **Target base schema** (optional): `spec.targets.<targetId>.schema`
3) **Event schema**: the resolved `event.payload...schema` for that `targetId` (and for the chosen version when versioned)

### Merge Rules

- The merge is keyed by **field name**.
- For a field that exists in multiple layers, the field definitions are **shallow-merged**.
  Later layers override earlier keys (so an event can set `value` without repeating `type`).
- After merging, the resulting field definition must still be a valid `Field` (as defined by `field.schema.json`).

### Conflict Rules (Normative)

Tooling should treat these as validation errors:

- Changing a field’s `type` across layers (for example base `type: string` but event `type: number`).
- Weakening a required field (for example base `required: true` but event `required: false`).
- Weakening a pinned-value requirement (for example base `valueRequired: true` but event `valueRequired: false`).
- Producing an invalid merged field definition (for example ending up with both `enum` and `value` due to conflicting layers).
- `valueRequired` is independent of `required`. `required: false` + `valueRequired: true` is valid and means the field may be omitted in payload, but if present it must equal the fixed `value`.
- If a field has `valueRequired: true` in the **effective schema**, tooling must require a fixed `value` (after merge/precedence and `$ref` resolution) when either:
  - the field is required (`required: true` in the effective schema), or
  - the event explicitly defines the field in its payload schema for that target/version.

### Example (Partial)

Global base (in `opentp.yaml`):

```yaml
spec:
  events:
    payload:
      schema:
        event_name:
          type: string
          required: true
```

Event (in an event file):

```yaml
event:
  payload:
    schema:
      event_name:
        value: login_click
```

Effective result for `event_name`:

- `type: string` (from base)
- `required: true` (from base)
- `value: login_click` (from event)

## Versioned Payloads: `current`, aliases, and `$ref`

This section defines how to resolve versioned payload schemas inside a single event file.

### Version keys vs aliases (tags)

In a versioned payload definition:

- A **version key** is a key whose value is an object (a payload version: `{ schema, meta?, $ref? }`).
- An **alias/tag key** is a key whose value is a string pointing to another key (for example `stable: "1.1.0"`).

Resolution rules (normative):

- `current` may point to either a version key or an alias/tag key.
- When resolving `current`, tooling must follow aliases/tags until a version key is reached.
- If an alias/tag points to a missing key, or if aliases/tags form a cycle, tooling should treat it as a validation error.

### `$ref` resolution

`$ref` derives a payload version from another payload version, then applies the referencing version’s `schema` as an override.

Supported forms:

- `"$ref: \"<versionKey>\""` — references another version key in the same payload definition.
- `"$ref: \"<payloadKey>::<versionKey>\""` — references a version key under another `payload.<payloadKey>` definition in the same event file (map form only).

Rules (normative):

- `$ref` may point to either a version key or an alias/tag key; aliases must be resolved first.
- `$ref` chains are allowed, but cycles must be treated as validation errors.
- Only the referenced version’s **schema** is inherited. `meta` is not merged/inherited through `$ref`.
- The effective schema for a version with `$ref` is computed as: `merge(refSchema, schema)` (referencing version wins), using the field-level merge rules in this document.
