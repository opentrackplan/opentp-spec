# Semantics

This document is the normative definition of how OpenTrackPlan files are read and combined. The JSON Schemas define the shape of each file; this document defines what a schema cannot express: how files are read, how a payload resolves to targets and versions, how field definitions merge across layers, which fields an event has, when a field is present, which hits belong to an event, and how checks, extensions and `ignore` work.

Terms used below:

- A **validator** is any tool that checks plan files against these rules (for example the reference CLI, `opentp validate`).
- A **hit** is one tracked call as it arrives at a target: a set of field values.
- `(E, T, V)` is an event `E`, a target `T` that `E` covers, and a version `V` of `E`'s payload on `T` (an unversioned payload has exactly one version).
- **Base layers** are the field definitions in `opentp.yaml`: the catalog and the common fields. The **event layer** is the field definitions in an event file.

## Files and YAML

- **YAML.** Files are YAML 1.2 with the core schema. `2026-09` is a string; `yes`, `no`, `on` and `off` are strings; unquoted dates such as `2025-01-01` are strings. Values that look like numbers are numbers, so quote version keys, alias values and `info.version` when they look like numbers (`"1.0"`).
- Duplicate mapping keys are an error.
- Anchors and aliases are supported (`dimension_2: *dim`). Merge keys (`<<`) are not: in YAML 1.2 `<<` is an ordinary key, but a YAML 1.1 parser would merge it, so the same file would mean different things. Validators report every mapping key written as a plain `<<` as an error, in every plan file, and `ignore` cannot silence it. Write the keys out, or use an alias for the whole definition.
- **Version header.** Every file starts with `opentp: <version>`. A validator for this version accepts exactly `2026-09` in every file (the schemas pin it with `const`).
- **File names.** `.yaml` and `.yml` are equivalent:
  - a path template that ends in `.yaml` or `.yml` matches files with either extension;
  - a dictionary reference `<path>` resolves to `<path>.yaml` or `<path>.yml` under the dictionaries root; both existing is an error;
  - `opentp.yaml` and `opentp.yml` in the same directory is an error.
- **Paths.** `spec.paths.events.root` and `spec.paths.dictionaries.root` are relative to the directory of `opentp.yaml`; a leading `/` means that directory, not the filesystem root. `opentp.yaml`, `opentp.yml` and tool files at the plan root (for example the reference CLI's `opentp.cli.yaml` and `opentp.cli.yml`) are never read as event or dictionary files.
- **Regular expressions** (`pattern`) are ECMA-262 with Unicode (the `u` flag) and are not anchored, as in JSON Schema: write `^` and `$` to match the whole value.
- **Lengths.** `minLength` and `maxLength` count Unicode code points (`"é"` and `"𝄞"` both have length 1).
- **Formats.** A string satisfies `format` when it is:

  | `format` | Valid strings |
  |---|---|
  | `date` | an RFC 3339 full-date: `2025-01-31` |
  | `date-time` | an RFC 3339 date-time: `2025-01-31T12:00:00Z`, `2025-01-31T12:00:00.5+02:00` |
  | `uuid` | 8-4-4-4-12 hexadecimal digits: `123e4567-e89b-12d3-a456-426614174000` |
  | `email` | one `@` with non-empty local and domain parts: `user@example.com` |
  | `uri` | an absolute URI with a scheme: `https://example.com/a` |
  | `ipv4` | four decimal octets from 0 to 255 separated by dots, without leading zeros (`0` itself is allowed), as `IPv4address` in RFC 3986: `192.0.2.1`, `10.0.0.0`; not `192.168.001.1` |
  | `ipv6` | a textual IPv6 address (RFC 4291): `2001:db8::1`; an embedded IPv4 part follows the `ipv4` rule (`::ffff:192.0.2.1`) |

- **Tool settings** are not part of the specification: key generation, check implementations, tracker bindings, generator and server settings. Tools keep them in their own files (the reference CLI uses `opentp.cli.yaml`). `opentp.yaml` stays meaningful without them: tool settings may only add strictness or produce artifacts. They never change which hits belong to an event, the type of a field, or where a field travels.

## Payload resolution

An event's `payload` takes one of two forms:

- **Implicit form:** `payload.schema` (unversioned) or `payload.current` (versioned) at the top level. It applies to every target in `spec.events.payload.targets.all`.
- **Map form:** `payload.<key>`, where each value is an unversioned or versioned payload definition.

Resolving selectors to targets (normative):

1. Read `spec.events.payload.targets`. `all` is required and reserved: it is the list of every target id. The other keys are selector groups; each lists ids from `all`.
2. If the payload is in implicit form, it covers every id in `all`. Stop.
3. Otherwise, for each key of the payload map: a key of `spec.events.payload.targets` (including `all`) covers that selector's ids; else a key that is an id in `all` covers that target; else the key is an error (unknown selector or target).
4. Each target id is covered at most once per event. A target covered by two keys is an error (ambiguous payload).

**Uncovered targets.** A target that no payload key covers is a target on which the event is not sent. This is valid.

**Versions and aliases.** In a versioned payload definition (`current` plus other keys):

- a key whose value is an object is a **version** (`{ schema, meta?, $ref? }`);
- a key whose value is a string is an **alias** (tag) pointing to another key, for example `stable: "1.1.0"`;
- `current` names a version or an alias; it is what new code sends. Aliases are followed until a version is reached; an alias to a missing key and a cycle of aliases are errors.

Every version of `E` on `T` is a valid shape of the event: old builds still send old versions.

## Derived versions (`$ref`)

A version may derive from another version with `$ref`:

- `$ref: "<versionKey>"` names a version (or alias) of the same payload definition;
- `$ref: "<payloadKey>::<versionKey>"` names a version under another key of the same event (map form only).

Rules:

- Aliases are resolved first. Chains are allowed; a cycle is an error.
- Only `schema` is inherited, never `meta`. Every version needs `schema`, even with `$ref` (write `schema: {}`).
- The event layer of a derived version is `S = refMerge(refSchema, schema)`, field by field:
  - each keyword of the referencing version replaces the referenced one;
  - setting one of `value`, `enum` or `dict` removes the other two;
  - `checks` and `pii` are merged by key (check id, pii key); the referencing version's value for a key replaces the referenced one whole;
  - each `x-*` key is replaced whole;
  - when the referencing version sets `value`, `enum`, `dict` or `items` and no `example`, an inherited `example` that the result does not allow (by `value`, `enum`, `dict` or `items` membership; an unknown dictionary allows everything) is dropped. An example is checked only where it is written.
- A derived version may change values freely: the narrowing and presence rules below never apply between versions. Between versions only two changes are errors: a different `type`, and `required: true` changed to `false`. They are reported at the referencing version.
- An inherited field cannot be removed.

## Layers and merge

The effective schema of `(E, T, V)` is built from four layers, in this order:

1. **Catalog**: `spec.events.payload.schema`. The fields events may use. Being in the catalog does not put a field into an event.
2. **Common fields of every target**: `spec.targets.all.schema`.
3. **Common fields of `T`**: `spec.targets.<T>.schema`.
4. **Event layer** `S(E, T, V)`: the `schema` of version `V` (after `$ref`).

From these:

- The **common fields** of `T` are `merge(spec.targets.all.schema, spec.targets.<T>.schema)`, using the field merge below.
- The **field set** of `(E, T, V)` is every common field of `T` plus every field in `S(E, T, V)`. A catalog field that the event does not list is not part of the event. A common field that the event does not list is part of the event as the base layers define it.
- The **effective field** `f` is the field merge folded over `catalog[f]`, `spec.targets.all.schema[f]`, `spec.targets.<T>.schema[f]` and `S(E, T, V)[f]`, in that order, skipping the layers that do not define `f`.

A field definition is always a mapping. Write `{}` to list a field without changing it; `null` is invalid.

### Field merge

A later definition `L` merges over the merged earlier definition `M` keyword by keyword:

| Keyword | Rule |
|---|---|
| `type` | Both set and different: error (type conflict); the earlier type is kept. Otherwise the type that is set. |
| `value` in `L` | If `M` has a `value`, the two must be deep-equal (error: cannot change the fixed value). If `M` has an `enum`, `L.value` must be a member; if `M` has a `dict`, a value of that dictionary. The result has `value` and no `enum` or `dict`. |
| `enum` in `L` | If `M` has a `value`: error (cannot replace a fixed value with an enum). If `M` has an `enum` or `dict`, `L.enum` must be a subset of its values. The result has `enum` and no `value` or `dict`. |
| `dict` in `L` | If `M` has a `value`: error (cannot replace a fixed value with a dictionary). If `M` has an `enum` or `dict`, the values of `L.dict` must be a subset of its values. The result has `dict` and no `value` or `enum`. |
| `items` | Merged keyword by keyword like a field: `items.type` both set and different is a type conflict; `items.enum` and `items.dict` follow the `enum` and `dict` rows against `M.items`; for the other `items` keywords the later definition wins. |
| `required` | `L.required: false` after any earlier layer with `true` is an error (a minimum cannot be weakened), in every layer. Otherwise `false` on a base layer is the same as unset. The result is `true` if any layer says `true`. |
| `policy` | Only on base layers; in an event it is an error. A later base layer may raise the policy (`specified` < `restricted` < `fixed`) but not lower it (error). The **declaring layer** is the last layer that set the effective policy. |
| `checks`, `pii` | Merged by key (check id, pii key). The later layer's value for a key replaces the earlier one whole. Check params `false` disable a check that an earlier layer set. |
| `x-*` | Each `x-*` key is one entry; the later value replaces the earlier one whole. |
| `example` | The later definition wins. When `L` sets `value`, `enum`, `dict` or narrows `items`, and has no `example`, an inherited `example` that the result does not allow is dropped. |
| Everything else (`name`, `title`, `description`, constraints, array keywords) | The later definition wins, keyword by keyword. |

A membership or subset rule that needs the values of a dictionary that does not exist is skipped; the unknown dictionary is reported where it is written.

### Example

```yaml
# opentp.yaml (excerpt)
spec:
  targets:
    all:
      schema:
        event_name:
          type: string
          policy: fixed
    ios:
      schema:
        device_model:
          type: string
  events:
    payload:
      targets:
        all: [web, ios]
      schema:
        auth_method:
          type: string
          enum: [email, google, github, apple]
        user_id:
          type: string
```

```yaml
# events/auth/login.yaml (excerpt)
event:
  payload:
    schema:
      event_name:
        value: login
      auth_method:
        enum: [email, google]
        required: true
```

Effective fields of this event on `ios`:

- `event_name`: `type: string`, `policy: fixed`, `value: login` (always present);
- `device_model`: `type: string` (a common field of `ios`; optional and free);
- `auth_method`: `type: string`, `enum: [email, google]`, `required: true`.

On `web` the event has `event_name` and `auth_method` only. `user_id` is in the catalog but not in the event, so it is not part of the event.

## Effective field rules

For every `(E, T, V)` unless stated otherwise:

- **Type.** Every effective field has a `type` after merging, and array fields have `items` with an `items.type`. For base fields this is checked once per target against `opentp.yaml`.
- **Keywords that depend on the type.** A keyword that applies only to some types must fit the effective type, in every layer that writes it, also when that layer inherits the type (the schemas can only check definitions that state their `type`):
  - top-level `enum` and `dict` are not allowed on an array field; array elements use `items.enum` and `items.dict`;
  - string constraints (`minLength`, `maxLength`, `pattern`, `format`) only on `string`;
  - number constraints (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`) only on `number` and `integer`;
  - `items`, `minItems`, `maxItems` and `uniqueItems` only on `array`;
  - inside `items`, the same rules against the effective `items.type`.

  Like a type conflict, such a keyword is an error that `ignore` cannot silence.
- **Values and enum members.** A `value`, every `enum` member and every `items.enum` member must satisfy the type and the constraints (including `format`) of the field as merged up to the layer that writes them.
- **Examples.** An `example` is checked where it is written, against the field merged up to and including that layer: type, constraints, `value` (it must be equal), and `enum`, `dict` and `items` membership. An example on a base field is checked once, against `opentp.yaml`.
- **Code-facing names.** A field's code-facing name is its `name`, else its key. Code-facing names are unique (case-sensitive) among the effective fields of one `(E, T, V)`.
- **Empty enums.** `enum: []` is invalid everywhere.

## Presence

A field of `(E, T, V)` is **always present** (in every hit of that version, with a non-null value) when:

- any layer says `required: true`, or
- the effective field has a `value`, or
- its effective `policy` is `restricted` or `fixed`, and `V` is not exempt from policy (see [Policy](#policy)).

Otherwise the field is **optional**: a hit may omit it.

`required: false` cannot contradict presence:

- `required: false` next to `value`, or next to `policy: restricted` or `policy: fixed`, in one definition is invalid (the schemas reject it);
- `required: false` in the event layer, when the effective field has a `value` or a non-exempt `policy: restricted|fixed`, is an error.

There is no "fixed value or absent": a field with a `value` is always present. A transition period, when old builds do not send a field yet, is expressed with versions: an older version without the field (marked `meta.deprecated`) and a newer one with it.

<!-- invalid: required: false contradicts value -->
```yaml
# Invalid: a field with a value is always present
event_name:
  value: login
  required: false
```

## Policy

`policy` on a catalog or common field says what every event must do with that field:

| `policy` | Every event must | The field in hits |
|---|---|---|
| (none) | nothing: it may leave the field out or describe it freely | as `required` says |
| `specified` | list the field (`{}` is enough) | as `required` says |
| `restricted` | list the field and restrict it with `value`, `enum` or `dict` | always present |
| `fixed` | list the field and set its `value` | always present |

Rules:

- `policy` is written only in base layers (catalog, `spec.targets.all`, `spec.targets.<T>`); in an event file it is an error that `ignore` cannot silence.
- The effective policy of a field on `T` comes from the base layers (catalog, then `all`, then `T`); a later layer may raise it but not lower it.
- **Exempt versions:** versions with `meta.deprecated` (an unversioned payload may carry `meta.deprecated` too). They describe history and do not have to follow rules added later. `lifecycle.status` does not exempt anything.
- For every other `(E, T, V)`, and every field of the field set or of the catalog whose effective policy is set, with `L_E` the event layer's definition `S(E, T, V)[f]`:
  - `specified`: `L_E` exists (the event lists the field);
  - `restricted`: `L_E` exists, and a layer after the declaring layer (`spec.targets.<T>` or the event layer) sets `value`, `enum` or `dict`;
  - `fixed`: `L_E` exists, and a layer after the declaring layer sets `value`.
- **Arrays.** An array field cannot have a top-level `enum` or `dict` (see [Effective field rules](#effective-field-rules)), and `items.enum` or `items.dict` only constrain the elements. So `restricted` on an array field can only be satisfied with `value`, and acts like `fixed`.

"May be left out, but restricted when present" cannot be expressed with `policy`: such fields get no policy, and the [overlap](#event-predicate-and-overlap) check reports events that leave them free.

```yaml
# opentp.yaml (excerpt): spec.targets.all.schema
application_id:
  type: string
  dict: data/application_id
  policy: fixed
event_category:
  type: string
  policy: restricted
```

## Closed vocabulary and type inheritance

- **Closed vocabulary.** Every field in `S(E, T, V)` must be a catalog field or a common field of `T`. This is checked per target: a field that is common only on `ios` is unknown in a payload that also covers `web`. Validators should suggest close names (a case-insensitive match, or the names at the smallest edit distance) for unknown fields.
- **Type inheritance.** Because every event field has a base definition, event fields never need `type`: `{}`, `{title: ...}`, `{enum: [...]}` and `{required: true}` are complete event fields. A `type` written in an event must equal the inherited one, so a field has the same type in every event.
- The catalog is optional (default `{}`). A plan without a catalog lets events use only common fields.
- **Slots.** For generic slots such as `dimension_1`, the catalog gives the type and each event gives the meaning (`name`, `title`, `enum`). YAML anchors keep many slots short:

```yaml
# opentp.yaml (excerpt): spec.events.payload
schema:
  dimension_1: &dim
    type: string
  dimension_2: *dim
  dimension_3: *dim
```

## Event predicate and overlap

The **predicate** of `(E, T, V)` decides which hits on `T` are this version of `E`. It is the AND over the effective field set:

| Effective field | Term |
|---|---|
| `value: X` | `field = X` (arrays: equal element by element) |
| `enum: S`, or `dict` with values `S`, always present | `field IN S` |
| `enum: S`, or `dict` with values `S`, optional | `(field IN S OR field IS ABSENT)` |
| anything else (free fields, array fields without `value`) | no restriction |

- `items.enum` and `items.dict` constrain array elements; they are not part of identity.
- **Absent** means the key is missing or its value is `null`. An empty string is a value (forbid it with `minLength: 1`).
- The predicate of `(E, T)` is the OR over all versions of `E` on `T`. `current` is what new code sends; older versions remain valid shapes.
- Fields outside the field set (catalog fields that `E` does not list) are not part of the predicate. A hit that carries them still matches; a runtime validator may report them as unplanned fields.
- Where a field travels inside a tracker payload is not part of identity, and `checks` never take part in the predicate.
- A hit that does not match the predicate is not this event. This strictness is intended: a value outside an enum is not the event, and widening an enum includes earlier hits retroactively.
- Event files describe hits that can be recognised, not aggregates such as "any page view": aggregates are queries over events.

For example, an event with `event_name: {value: login}` and an optional `auth_method: {enum: [email, google]}` has the predicate `event_name = 'login' AND (auth_method IN ('email', 'google') OR auth_method IS ABSENT)`.

**Overlap.** Two events whose predicates can match the same hit on the same target **overlap**; tools should report it. A field constrained by only one of them does not tell them apart. Kinds of overlap:

- **identical**: every hit of either event matches the other;
- **contains**: every hit of one event also matches the other (the broader event contains the narrower one);
- **overlaps**: some hits match both.

Known limit: an event that leaves an optional field free also matches the hits of an event that pins it. Pin the field in both events, or accept and document the overlap.

## Checks

- `checks: { <checkId>: <params> }` may be written on fields, array `items`, taxonomy fields and fragments, `pii.kind` and `pii.masker` configurations, and pii meta fields. It is an open vocabulary, like JSON Schema `format`.
- Check ids match `^[A-Za-z][A-Za-z0-9_.-]*$`; a dot is allowed (`mytool.starts-with`).
- **Portable checks.** `spec.checks.<id>` defines a named check built from portable keywords (`minLength maxLength pattern format minimum maximum exclusiveMinimum exclusiveMaximum multipleOf`, at least one). A value passes when it satisfies every keyword that applies to its type: string keywords apply to strings, number keywords to numbers, others are ignored. In the plan, such an id refers to that definition, and its params must be `true` (enable) or `false` (disable).
- **Tool-defined checks.** Any other id is defined by a tool (for example bound in the reference CLI's `opentp.cli.yaml`). A tool that does not know an id may ignore it and should tell the user.
- **Where validators apply them:**
  - portable checks apply wherever constraints apply: `value`, every `enum` member, `example`, taxonomy values, and pii meta values (in events and in `opentp.yaml`);
  - tool-defined checks apply only to `value`, taxonomy values and pii meta values, never to `enum` members or examples;
  - for an array value, checks apply to each item;
  - runtime validators apply both kinds to hit values.
- Params `false` disable a check that an earlier layer set (see [Field merge](#field-merge)).

```yaml
# opentp.yaml (excerpt): spec.checks
jira-key:
  title: Jira issue key
  pattern: "^[A-Z]+-[0-9]+$"
```

## Extensions

Any key that starts with `x-` is allowed on these fixed-shape objects, and nowhere else:

- `opentp.yaml`: the root, `info`, `spec`, `spec.paths`, `spec.paths.events`, `spec.paths.dictionaries`, `spec.events`, `spec.events.key`, `spec.events.payload`, `spec.events.pii`, the `pii.kind` and `pii.masker` configurations, pii meta field definitions, `spec.targets.<id>`, `spec.checks.<id>`, taxonomy field and fragment definitions, fields, and array `items`;
- event files: the root, `event`, `lifecycle`, `aliases[]`, `aliases[].deprecated`, `ignore[]`, payload versions, `meta` and `meta.deprecated`;
- dictionary files: the root and `dict`.

Maps keyed by names that users choose never treat `x-` specially (there `x-foo` is just a name): `spec.targets`, `spec.checks`, `spec.events.taxonomy`, `fragments`, `spec.events.payload.targets`, every `schema` field map, `spec.events.pii.schema`, every `checks` map, `event.taxonomy`, the map form of `event.payload`, and versioned payload definitions.

Tools ignore every `x-*` key they do not know. The specification reserves exactly one name: `x-opentp` (used until 2026-01) is invalid on every object that allows `x-*`, so content written for 2026-01 is never ignored silently. Use your own prefix, for example `x-acme-team`.

## Ignore

`event.ignore` lists checks to skip for one event. Each entry has a `path` and an optional (recommended) `reason`. Tools may support more path forms; these are the normative core:

| `path` | Silences |
|---|---|
| `key` or `event.key` | key checks: presence, `spec.events.key` constraints, and tool key checks such as a generated-key mismatch |
| `opentp` | the version check of this file |
| `taxonomy.<name>` | the checks on that taxonomy field or fragment; on a composite field (`template` + `fragments`) also every fragment of that field |
| `payload::<f>` | the field-level checks of field `<f>` (the 2026-01 form; the only form for a field whose name contains `.`) |
| `payload.<...>.schema.<f>[.<...>]` | the field-level checks of field `<f>`: the segment right after the first `.schema.`, up to the next `.` or the end |
| `payload.<f>[.<...>]` (no `.schema.`) | the field-level checks of field `<f>`; later segments are keywords and are ignored |

- Every payload form names one field and silences its field-level checks on every target and version. The text between `payload.` and `.schema.` (selector, target, version; versions may contain dots) and anything after the field are not interpreted and need not exist in the event.
- A composite taxonomy value that does not match its `template` gives one error at `taxonomy.<field>`, and its fragments are then not checked.
- An ignore path that matches nothing is not an error.

**Field-level checks** (silenced by a payload path):

- membership and subset of an event `value`, `enum`, `dict` or `items` against the base `enum` or `dict`;
- type, constraints and `format` of values, enum members and examples;
- policy;
- checks (their results, and unknown-check warnings for checks written in the event);
- code-facing name uniqueness;
- unknown dictionaries written in the event layer.

**Never ignorable:**

- load errors, YAML duplicate keys, YAML merge keys (`<<`), duplicate event keys;
- payload resolution errors (selectors, coverage, `current`, aliases, `$ref`);
- unknown fields (closed vocabulary);
- `policy`, `x-opentp` or `valueRequired` written in an event;
- `required: false` contradictions ([Presence](#presence)) and weakened `required`;
- null field definitions;
- a `type` that differs from an earlier layer, and a keyword that does not fit the effective type (for example a top-level `enum` on an array field);
- changing or replacing a fixed `value`;
- every problem in `opentp.yaml` (base layers, and conflicts between the catalog, `all` and `<T>`).

```yaml
# events/page/page_view.yaml (excerpt)
event:
  ignore:
    - path: payload.event_category
      reason: page views have no category
    - path: taxonomy.action
```

## Validator-only rules

The JSON Schemas check the shape of each file. These rules need more than one file, the merged layers or the YAML source, so only validators check them:

- `spec.targets` keys are `all` or ids from `spec.events.payload.targets.all`; selector groups list only ids from `all`;
- payload resolution: selectors and target ids exist, a target is covered at most once, `current`, aliases and `$ref` resolve without cycles;
- event keys are unique; taxonomy values follow `spec.events.taxonomy` (type, `required`, `enum`/`dict`, constraints, `template`);
- dictionaries exist and values belong to them;
- closed vocabulary, per target;
- a `type` (and `items.type`) on every effective field, and no type conflicts between layers;
- keywords that depend on the type, against the effective type in every layer (the schemas check them only where the definition states its `type`): no top-level `enum` or `dict` on array fields, string constraints only on strings, number constraints only on numbers and integers, `items`, `minItems`, `maxItems` and `uniqueItems` only on arrays;
- YAML merge keys: a plain `<<` mapping key anywhere (the closed schemas reject it on fixed-shape objects, but not as a name in a map such as a field map);
- values, enum members and examples against the inherited type, constraints and dictionaries;
- the field merge rules (fixed values, subsets, weakened `required`, policy lowering);
- presence across layers and policy per event;
- code-facing names;
- `spec.checks` params are `true` or `false`; checks results;
- overlap between events (reported, not an error).

## Versioning

How spec versions are named, published and migrated: see [Versioning](./index.md#versioning) and the [changelog](https://github.com/opentrackplan/opentp-spec/blob/main/CHANGELOG.md).
