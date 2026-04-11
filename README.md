# d-dash

Contract-first embeddable dashboard engine with a headless core and pluggable adapters for datasources, visualizations, and grid/layout runtimes.

## Highlights

- Headless runtime (`@d-dash/core`) with typed contracts
- First-party adapters for ECharts, HTML, Gridstack, Table, REST, VictoriaMetrics, and gRPC
- Builder SDK (`@d-dash/builder`) for fully typed programmatic dashboard generation
- Persisted JSON schema separated from runtime-resolved execution model
- Structured error model and adapter capability declarations

## Packages

- `@d-dash/core`
- `@d-dash/adapter-echarts`
- `@d-dash/adapter-html`
- `@d-dash/adapter-gridstack`
- `@d-dash/adapter-table`
- `@d-dash/datasource-rest`
- `@d-dash/datasource-victoriametrics`
- `@d-dash/datasource-grpc`
- `@d-dash/builder`

## Quick start

```bash
npm install
npm run build
npm run test
```

Run the basic browser example:

```bash
npm run -w examples/basic dev
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Contracts](docs/CONTRACTS.md)
- [Schema design](docs/SCHEMA_DESIGN.md)
- [Usage](docs/USAGE.md)
- [Plugin development](docs/PLUGIN_DEVELOPMENT.md)
- [Code rules](docs/CODE_RULES.md)
- [Docs index](docs/README.md)

## API docs

Generate API docs from JSDoc + TypeDoc:

```bash
npm run docs:api
```

Output is written to `docs/api`.

## Workflow

### On `dev` — while coding

For every user-facing change (bug fix, new feature, breaking change), create a changeset before committing:

```bash
npm run changeset   # select affected packages and semver bump type
git add .
git commit -m "feat: your change"
```

The generated `.changeset/*.md` file is committed alongside your code and travels with the PR to `main`.

### On `main` — to release

After merging from `dev`, run the full release flow:

```bash
npm run release:version   # consume changesets → bump versions, update CHANGELOGs, commit
npm run release:publish   # lint/build/test → publish to npm → create git tags → push
```

Or as a single command:

```bash
npm run release
```

Dry-run before publishing (validates everything, no npm publish or git push):

```bash
npm run release:dry-run
```

Detailed maintainer steps are in [docs/RELEASE.md](docs/RELEASE.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
