# @d-dash/adapter-echarts

ECharts-backed visualization adapters for d-dash.

## Install

This package expects:

- `@d-dash/core`
- `echarts` (peer dependency)

## Usage

```ts
import * as echarts from "echarts";
import { createEChartsAdapters } from "@d-dash/adapter-echarts";

for (const adapter of createEChartsAdapters({ echarts })) {
	registry.registerVisualization(adapter);
}
```

Created adapters:

- `timeseries`
- `stat`
- `text`

## Target shape

```ts
type EChartsTarget = {
	el: HTMLElement;
	theme?: string;
};
```
