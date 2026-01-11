# Schema Reference

OpenTrackPlan uses YAML files for configuration. This section covers all file formats.

## File Types

| File | Purpose | Schema |
|------|---------|--------|
| [`opentp.yaml`](./opentp-yaml.md) | Main configuration | `opentp.schema.json` |
| [`events/*.yaml`](./events.md) | Event definitions | `event.schema.json` |
| [`dictionaries/*.yaml`](./dictionaries.md) | Reusable value lists | `dict.schema.json` |

## JSON Schemas

All file formats have JSON schemas for IDE validation and autocompletion.

Add this comment at the top of your YAML files:

```yaml
# yaml-language-server: $schema=https://opentp.dev/schemas/latest/opentp.schema.json
```

### Schema URLs

| Schema | URL |
|--------|-----|
| Main config | `https://opentp.dev/schemas/latest/opentp.schema.json` |
| Events | `https://opentp.dev/schemas/latest/event.schema.json` |
| Dictionaries | `https://opentp.dev/schemas/latest/dict.schema.json` |
| Field (shared) | `https://opentp.dev/schemas/latest/field.schema.json` |
| Version (shared) | `https://opentp.dev/schemas/latest/version.schema.json` |

## Version

All OpenTrackPlan files start with:

```yaml
opentp: 2025-06
```

This declares the format version for compatibility.
