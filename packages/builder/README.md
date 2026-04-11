# @d-dash/builder

Type-safe fluent SDK for constructing d-dash dashboards and widgets.

## Overview

The `builder` package provides a developer-friendly API to create dashboard JSON models that are guaranteed to satisfy the d-dash schema. It eliminates manual object literal construction and provides IDE autocompletion for visualization options and datasource queries.

## Installation

```bash
npm install @d-dash/builder @d-dash/core
```

## Usage

### Building a Dashboard

```ts
import { DashboardBuilder, WidgetBuilder } from "@d-dash/builder";

const dashboard = new DashboardBuilder()
  .setTitle("System Overview")
  .setDescription("Production cluster metrics")
  .addVariable({
    name: "host",
    type: "custom",
    options: ["web-1", "web-2"],
    default: "web-1"
  })
  .addWidget(
    new WidgetBuilder()
      .setId("cpu-usage")
      .setTitle("CPU Usage")
      .setDatasource("metrics")
      .setQuery({ 
        metric: "cpu.utilization", 
        filters: { host: "$host" } 
      })
      .setVisualization({ 
        type: "timeseries",
        options: { showLegend: true } 
      })
      .setLayout({ x: 0, y: 0, w: 6, h: 4 })
  )
  .build();
```

## Features

- **Fluent API**: Chain methods to configure dashboard properties.
- **Validation**: Throws errors early if required fields (like title or ID) are missing.
- **Experimental Support**: Includes builders for template variables and layout configurations.

## API Reference

### `DashboardBuilder`
Root builder for the dashboard model.
- `setTitle(string)`
- `setDescription(string)`
- `addVariable(Variable)`
- `addWidget(WidgetBuilder | Widget)`
- `build()`: Returns a validated `Dashboard` object.

### `WidgetBuilder`
Builder for individual widgets.
- `setId(string)`
- `setTitle(string)`
- `setDatasource(string)`
- `setQuery(any)`
- `setVisualization(Visualization)`
- `setLayout(Layout)`
- `build()`: Returns a validated `Widget` object.

## License

LGPL-3.0-or-later
