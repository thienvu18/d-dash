# @d-dash/adapter-table

DOM-based `table` visualization adapter for d-dash.

## Installation

```bash
npm install @d-dash/adapter-table
```

> **Peer dependencies:** `@d-dash/core`

## Usage

```ts
import { createTableAdapter } from "@d-dash/adapter-table";

// Register the adapter once during runtime setup.
registry.registerVisualization(createTableAdapter());
```

Then use `visualization: { type: "table" }` in the persisted widget:

```json
{
  "id": "report-table",
  "layoutId": "l1",
  "datasource": "metrics",
  "query": { "metric": "events" },
  "visualization": { "type": "table" },
  "options": {
    "sortable": true,
    "pagination": true,
    "pageSize": 25,
    "columnOrder": ["timestamp", "host", "value"],
    "columnWidths": { "timestamp": 200, "value": 100 }
  }
}
```

## Options (`TableAdapterOptions`)

| Field          | Type                         | Default | Description                                      |
|----------------|------------------------------|---------|--------------------------------------------------|
| `sortable`     | `boolean`                    | `false` | Render clickable sort buttons in column headers. |
| `pagination`   | `boolean`                    | `false` | Paginate the table.                              |
| `pageSize`     | `number`                     | `20`    | Rows per page (only when `pagination` is true).  |
| `columnOrder`  | `string[]`                   | —       | Explicit column display order by field name.     |
| `columnWidths` | `Record<string, number>`     | —       | Per-column pixel widths.                         |

## Capabilities

```ts
{
  supportsTable: true,
  supportsResize: true,
}
```

## Status

`@experimental` — API may change in minor releases.
