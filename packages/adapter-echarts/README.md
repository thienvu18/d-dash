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
- `html`

## HTML sanitization

The `html` adapter sanitizes `options.html` before writing it into the widget
container. You can provide a stricter sanitizer:

```ts
const adapters = createEChartsAdapters({
	echarts,
	sanitizeHtml: (rawHtml) => mySanitizer(rawHtml),
});
```

## Target shape

```ts
type EChartsTarget = {
	el: HTMLElement;
	theme?: string;
};
```
