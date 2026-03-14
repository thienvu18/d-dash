# d-dash

Contract-first embeddable dashboard engine with a headless core and pluggable adapters for datasources, visualizations, and grid/layout runtimes.

## Highlights

- Headless runtime (`@d-dash/core`) with typed contracts
- First-party adapters for ECharts, Gridstack, REST, VictoriaMetrics, and gRPC
- Persisted JSON schema separated from runtime-resolved execution model
- Structured error model and adapter capability declarations

## Packages

- `@d-dash/core`
- `@d-dash/adapter-echarts`
- `@d-dash/adapter-gridstack`
- `@d-dash/datasource-rest`
- `@d-dash/datasource-victoriametrics`
- `@d-dash/datasource-grpc`

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

## Release readiness

```bash
npm run release:prepare
npm run release:dry-run
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
