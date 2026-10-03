# Changelog

All notable changes to the OpenTrackPlan file format. Versions are named `YYYY-MM`; a published version never changes (see "Versioning" in [docs/index.md](docs/index.md#versioning)). Each entry ends with migration notes from the previous version.

## [2026-09] - 2026-10-03

The field catalog, common fields per target, `policy` and core `checks`. Plan files must be upgraded: run `opentp migrate` (opentp-cli 0.10.0). Plans that stay on 2026-01 keep working with opentp-cli 0.9.1.

### Breaking

Old files become invalid or change meaning:

1. `spec.events.payload.schema` is now the **field catalog**: the fields events *may* use. It no longer puts fields into every event. Fields common to every event of a target live in `spec.targets.all.schema` (every target) and `spec.targets.<targetId>.schema` (one target).
2. **Closed vocabulary**, checked per target: every field in an event payload must be a catalog field or a common field of each target that payload covers.
3. `valueRequired` is removed. Catalog and common fields take **`policy: specified | restricted | fixed`** instead (what every event must do with the field). `policy` is not allowed in event files.
4. `x-opentp` is removed and reserved: key generation (`x-opentp.keygen`) leaves the plan (it is tool configuration; the reference CLI keeps it in `opentp.cli.yaml`), `x-opentp.checks` becomes the core keyword `checks`, and `x-opentp.role` is dropped. The key `x-opentp` is invalid on every object.
5. `enum` needs at least one value (fields, array `items`, taxonomy fields, fragments, pii configurations).
6. `example` must satisfy the field it is written on (type, constraints, `value`, `enum`, `dict`, `items`).
7. Presence: a `value` (in any layer) and `policy: restricted|fixed` mean the field is present in every hit. `required: false` next to a `value` or next to `policy: restricted|fixed` in the same definition is invalid, and an event `required: false` on a field that has a `value` or `policy: restricted|fixed` is an error. The 2026-01 "optional constant" (`required: false` + `valueRequired: true`: "the value or absent") is gone.
8. An event cannot change a fixed `value` of a base layer, or replace it with `enum` or `dict` (2026-01 let a later layer override anything).
9. Enum members and fixed values must satisfy the field's type and constraints.
10. The event predicate (which hits belong to an event) is normative; see "Event predicate and overlap" in `docs/semantics.md`.
11. `opentp.yaml` and `opentp.yml` in the same directory is an error.
12. `version.schema.json` pins the version: `"const": "2026-09"` (plus the `YYYY-MM` pattern), so the schemas reject files of other versions.
13. Every schema declares the canonical meta-schema URI `http://json-schema.org/draft-07/schema#`.
14. YAML merge keys (`<<`) are not supported (YAML 1.2 core schema); anchors and aliases are. Validators report a plain `<<` key as an error.
15. Target ids are checked: `spec.events.payload.targets.all` must be a non-empty list of unique, non-empty target ids, and the keys of `spec.targets` must be `all` or ids from that list (2026-01 required neither).

### Relaxed

Old files stay valid:

1. Type inheritance: event fields never need `type`. `{}`, `{title: ...}`, `{enum: [...]}` and `{required: true}` are valid event fields. Keywords that depend on the type are checked against the inherited type (for example, no top-level `enum` or `dict` on an array field).
2. `event.ignore[].reason` is optional.
3. The catalog (`spec.events.payload.schema`) is optional; the default is `{}`.
4. A version derived with `$ref` may change values freely (as in 2026-01; now stated).

### Added

1. `spec.targets.all.schema` (fields common to every target) next to `spec.targets.<targetId>.schema`.
2. `policy` on catalog and common fields. On an array field, only `value` satisfies `restricted`.
3. `checks: { <checkId>: <params> }` on fields, array `items`, taxonomy fields and fragments, `pii.kind`/`pii.masker` configurations and pii meta fields, and `spec.checks.<id>`: portable named checks made of portable keywords.
4. Open `x-*` extension keys on every fixed-shape object (for example `x-acme-team`).
5. The `event.ignore` path grammar is defined (`key`, `opentp`, `taxonomy.<name>`, `payload::<field>`, `payload.<field>`, `payload.<...>.schema.<field>`), including which checks can never be ignored.
6. Previously undefined points are defined: YAML 1.2 core schema and duplicate keys, `.yaml`/`.yml`, paths relative to `opentp.yaml` (a leading `/` is the plan directory), the regex dialect (ECMA-262 with Unicode, not anchored), lengths in code points, every `format` (for example, `ipv4` octets have no leading zeros), uncovered targets (the event is not sent there; valid), and the boundary between the plan and tool settings.
7. `docs/semantics.md` is rewritten as the normative document: payload resolution, layers and merge, `$ref`, presence, policy, closed vocabulary, the event predicate and overlap, checks, extensions, ignore, and the validator-only rules.
8. Releases: from this version on, every spec version is an annotated git tag with a GitHub Release whose notes come from this file.

### Removed

- `valueRequired` (use `policy`).
- `x-opentp` everywhere: `spec.events.x-opentp.keygen` (tool configuration), `x-opentp.checks` (use `checks`), `x-opentp.role`.
- Unused schema definitions: `xOpentpField`, `xOpentpEvents`, `transformStep`, `replaceStepParams`, `truncateStepParams`, `transform` (opentp.schema.json) and `xOpentp` (field.schema.json).

### Migration from 2026-01

Run `opentp migrate` (opentp-cli 0.10.0) in the plan repository. It rewrites only what changes and lists what it cannot fix (for example type conflicts between events, examples outside an enum, values that fail constraints). Then run `opentp validate`, and bump every pinned opentp (for example `OPENTP_VERSION` and CI images) to 0.10.x in the same commit.

| 2026-01 | 2026-09 |
|---|---|
| `opentp: 2026-01` in every file | `opentp: 2026-09` |
| `spec.events.payload.schema` (fields in every event) | `spec.targets.all.schema` (common fields; same meaning) |
| fields defined only in events | catalog entries in `spec.events.payload.schema`, with a `type` |
| `valueRequired: true` + `required: true` | `policy: fixed` (and no `required`) |
| `valueRequired: true` on an optional field | `policy: fixed` when every event already pins the field; otherwise removed (no exact equivalent) |
| `valueRequired: true` on a field with a base `value` | removed (a `value` implies presence) |
| `valueRequired: false` | removed |
| `spec.events.x-opentp.keygen` | `keygen` in a tool file (`opentp.cli.yaml` in the reference CLI) |
| `x-opentp.checks: {...}` | `checks: {...}` |
| a webhook check in `x-opentp.checks` | `checks: { <id>: true }` plus a binding of `<id>` in the tool file (`opentp.cli.yaml` `checks.bindings`) |
| `x-opentp.role` | removed |
| `enum: []` | removed |
| `required: false` next to `value` | removed: the field is now always present (use versions for a transition period) |
| a numeric `example` on a string field (`example: 0012`) | quoted (`example: "0012"`) |
| `<<` merge keys | anchors and aliases, or the definition written out |
| `opentp.yaml` and `opentp.yml` side by side | keep one |

Meaning changes to check by hand:

- A `value` on an optional field now means "always this value" (`field = X`). 2026-01 read it as "this value or absent".
- An event field that is neither in the catalog nor a common field is an error. `opentp migrate` collects the fields events use into the catalog.

## [2026-01] - 2026-02-03

Key generation and tool checks moved under `x-opentp`, `spec.targets`, new field types and the first `docs/semantics.md`.

- `spec.paths.events.pattern` → `spec.paths.events.template`.
- Composite taxonomy `pattern` → `template` (`pattern` now always means a regular expression).
- The key-generation template moved from `spec.events.key.pattern` to `spec.events.x-opentp.keygen.template`; `spec.events.key` holds constraints only.
- `spec.transforms` → `spec.events.x-opentp.keygen.transforms`.
- Field `checks` → portable constraints plus `x-opentp.checks`.
- Payload selectors may no longer overlap (2025-12 merged overlapping selectors from broad to narrow).
- The 2025-12 rule "an override `value`/`enum`/`dict` first removes the base `value`/`enum`/`dict`" was replaced by `docs/semantics.md` (a shallow merge). 2026-09 replaces that with the narrowing merge.
- New: `spec.targets`, the `integer` type (fields, taxonomy, dictionaries, pii meta fields), the `array` field type, `valueRequired`, `x-opentp` and `docs/semantics.md`.

### Amended in place on 2026-06-20 (one-time exception)

After the version was finalized (`b8bdeae`, 2026-02-03), commit `27b1a4c` changed `2026-01` in place:

- added the field keywords `name` (code-facing name) and `example`;
- relaxed the `valueRequired` rule: a fixed `value` is required only when the field is required or the event defines it (before: for every event).

The `2026-01` tag points at `27b1a4c`. Published versions are immutable; this amendment is the only exception.

### Migration from 2025-12

| 2025-12 | 2026-01 |
|---|---|
| `opentp: 2025-12` in every file | `opentp: 2026-01` |
| `spec.paths.events.pattern` | `spec.paths.events.template` |
| composite taxonomy `pattern` | `template` |
| `spec.events.key.pattern` (key generation template) | `spec.events.x-opentp.keygen.template`; `spec.events.key.pattern` is now a regex constraint |
| `spec.transforms` | `spec.events.x-opentp.keygen.transforms` |
| field `checks` | portable constraints (`minLength`, `pattern`, ...) or `x-opentp.checks` |
| overlapping payload selectors (merged broad → narrow) | disjoint selectors and target ids: each target covered at most once |

## [2025-12] - 2026-01-20

- Paths moved to `spec.paths` (`spec.paths.events`, new `spec.paths.dictionaries`).
- Payload targets: `spec.events.payload.platforms` → `spec.events.payload.targets` with the reserved `all` selector.
- New: `spec.events.pii`.
- Tool sections left the plan: `spec.validators`, `spec.generators`, `spec.extensions`, `spec.external`.
- Examples split into `examples/simple` and `examples/full`.

## [2025-06] - 2026-01-11

- First `YYYY-MM` version. Earlier versions of the repository used semver versions and unversioned schema `$id`s.
