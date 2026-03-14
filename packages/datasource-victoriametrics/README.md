# @d-dash/datasource-victoriametrics

VictoriaMetrics-backed `DatasourceAdapter` for d-dash.

## Usage

```ts
import { createVictoriaMetricsDatasourceAdapter } from "@d-dash/datasource-victoriametrics";

registry.registerDatasource(
	createVictoriaMetricsDatasourceAdapter({
		id: "vm",
		baseUrl: "https://vm.example.com",
		defaultStep: "60s",
	}),
);
```

Query mode handling:

- range mode (default): `/api/v1/query_range`
- instant mode (`filters.mode === "instant"`): `/api/v1/query`

Responses are normalized to d-dash frames (`time` + numeric value fields), preserving metric labels as field labels.
