# @d-dash/datasource-rest

JSON REST-backed `DatasourceAdapter` for d-dash.

## Usage

```ts
import { createRestDatasourceAdapter } from "@d-dash/datasource-rest";

registry.registerDatasource(
	createRestDatasourceAdapter({
		id: "metrics",
		baseUrl: "https://api.example.com/v1",
		headers: { Authorization: `Bearer ${token}` },
	}),
);
```

The adapter POSTs to `${baseUrl}/query` with a query envelope containing metric, time range, filters, and trace context.

Response envelopes are normalized to d-dash `DataFrame[]` and structured query error results.

## Metric discovery

`getMetrics()` is implemented and performs `GET ${baseUrl}/metrics` by default.
You can override the path with `metricsPath` in adapter options.
