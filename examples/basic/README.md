# d-dash basic example

This example has two runnable entry points:

- Node console demo: `src/index.mjs`
- Browser demo (real gridstack + real ECharts): `index.html` + `src/browser/main.js`

Both paths wire the current d-dash runtime and adapters together:

- core runtime
- gridstack grid adapter
- ECharts visualization adapters
- REST datasource adapter
- VictoriaMetrics datasource adapter

The example uses lightweight in-memory mocks for gridstack, ECharts, and fetch so it can run in Node without a browser.

## Run

From repo root, build the packages used by the example:

```bash
npm --workspace packages/core run build
npm --workspace packages/adapter-gridstack run build
npm --workspace packages/adapter-echarts run build
npm --workspace packages/datasource-rest run build
npm --workspace packages/datasource-victoriametrics run build
```

Then run the Node demo:

```bash
npm --workspace examples/basic run start
```

Or run the browser demo server:

```bash
npm --workspace examples/basic run start:web
```

Open `http://127.0.0.1:5174` in your browser.

## Entry point

See `examples/basic/src/index.mjs` for Node and `examples/basic/src/browser/main.js` for browser wiring.
