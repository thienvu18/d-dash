# @d-dash/adapter-gridstack

gridstack.js-backed `GridAdapter` for d-dash.

## Install

This package expects:

- `@d-dash/core`
- `gridstack` (peer dependency)

## Usage

```ts
import { createGridstackAdapter } from "@d-dash/adapter-gridstack";
import { GridStack } from "gridstack";

registry.registerGrid(
	createGridstackAdapter({ GridStack }),
);
```

## Target shape

```ts
type GridstackTarget = {
	el: HTMLElement;
	onLayoutChange?: (changes: GridLayoutChange[]) => void;
};
```

Widget elements should expose `gs-id="<widgetId>"` so layout changes can be mapped.
When users drag or resize items, the adapter forwards normalized layout changes
to `onLayoutChange`.
