# @d-dash/adapter-gridstack

gridstack.js-backed `GridAdapter` for d-dash.

## Install

This package expects:

- `@d-dash/core`
- `gridstack` 12.6 through 14.x (peer dependency)

GridStack 14 replaces the `float` option with `mode`; use the option supported by
the GridStack version installed in your application.

## Usage

```ts
import { createGridstackAdapter } from "@d-dash/adapter-gridstack";
import { GridStack } from "gridstack";

registry.registerGrid(createGridstackAdapter({ GridStack }));
```

## Target shape

```ts
type GridstackTarget = {
  el: HTMLElement;
};
```

Widget elements should expose `gs-id="<widgetId>"` so layout changes can be mapped.
When users drag or resize items, subscribe to normalized layout changes through
`adapter.subscribeLayoutChanges(target, handler)`.
