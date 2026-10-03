# Contributing to OpenTrackPlan Specification

Thank you for your interest in contributing to the OpenTrackPlan specification!

## How to Contribute

### Reporting Issues

- Search existing issues before creating a new one
- Provide clear reproduction steps
- Include relevant examples

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test your changes (requires Bun 1.4.2 or later; older Bun versions cannot read `bun.lock`)
   - Run `bun install --frozen-lockfile` once
   - Run `bun scripts/validate.ts` (checks the schemas, examples and docs snippets)
   - Run `bun test scripts/validate.test.ts`
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

### Specification Changes

Changes to the specification format require:

1. Discussion in an issue first
2. Updates to JSON schemas in `schemas/`
3. Updates to documentation in `docs/` (normative rules go to `docs/semantics.md`)
4. Updates to examples in `examples/`
5. An entry in `CHANGELOG.md` with migration notes. Published versions never change, so format changes go into the next version

### Documentation

- Keep documentation clear and concise
- Include examples where helpful
- Update all relevant files

## Code of Conduct

Be respectful and constructive in all interactions.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 license.
