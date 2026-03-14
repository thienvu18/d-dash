# Embedded Dashboard Engine – Full Reference Blueprint

---

## 1. Core Design Goals

- Fully embeddable inside your app  
- Dashboard stored and loaded as JSON  
- Any chart / UI framework injectable  
- Any datasource injectable  
- No hard dependency on React or any UI stack  
- Grafana-like mental model, but owned by you  

---

## 2. High-Level Architecture

```
+--------------------------------------------------+
|                Dashboard JSON                    |
+----------------------+---------------------------+
                       |
                       v
+--------------------------------------------------+
|             Dashboard Runtime Engine             |
|--------------------------------------------------|
| - Parse dashboard config                         |
| - Resolve time ranges                            |
| - Load datasource plugins                        |
| - Execute queries                                |
| - Normalize data to DataFrames                   |
+----------------------+---------------------------+
                       |
                       v
+--------------------------------------------------+
|           Visualization Adapter Layer            |
|--------------------------------------------------|
|  ECharts | Vega | Table | Stat | Custom UI       |
+----------------------+---------------------------+
                       |
                       v
+--------------------------------------------------+
|              Grid / UI Layout Layer              |
+--------------------------------------------------+
```

---

## 3. Recommended Technology Stack

### Grid / Layout (UI-only)
- gridstack.js (framework-agnostic, best default)  
- react-grid-layout (React-only)  
- golden-layout (IDE-style dashboards)

### Charts / Visualizations
- Apache ECharts (closest to Grafana)
- Vega / Vega-Lite (JSON-driven charts)
- Chart.js / Recharts (simple)

### Tables
- AG Grid  
- Ant Design Table  
- TanStack Table  

### Core Runtime
- Plain TypeScript (no UI dependency)
- Optional: RxJS (streaming / live metrics)

---

## 4. Folder / Package Structure

```
dashboard-engine/
├─ core/
│  ├─ dashboard-runtime.ts
│  ├─ time-range.ts
│  ├─ dataframe.ts
│  ├─ registry.ts
│
├─ datasources/
│  ├─ datasource.ts
│  ├─ rest-datasource.ts
│  ├─ sql-datasource.ts
│
├─ visualizations/
│  ├─ visualization.ts
│  ├─ echarts-adapter.ts
│  ├─ vega-adapter.ts
│  ├─ table-adapter.ts
│  ├─ stat-adapter.ts
│
├─ grid/
│  ├─ grid-adapter.ts
│
├─ models/
│  ├─ dashboard-schema.ts
│  ├─ metric.ts
│
└─ index.ts
```

---

## 5. Dashboard JSON Schema (Persisted)

```json
{
  "dashboardId": "system-overview",
  "timeRange": { "from": "now-6h", "to": "now" },
  "layout": [
    { "i": "w1", "x": 0, "y": 0, "w": 6, "h": 4 }
  ],
  "widgets": [
    {
      "id": "cpu_widget",
      "layoutId": "w1",
      "type": "timeseries",
      "datasource": "metrics",
      "metric": "cpu.usage",
      "filters": { "host": "*" },
      "timeRange": "inherit",
      "options": {
        "unit": "percent",
        "legend": true
      }
    }
  ]
}
```

---

## 6. Metric Registry (Metadata Model)

Used for:
- metric picker UI  
- validation  
- defaults  

```ts
type MetricDefinition = {
  id: string;
  name: string;
  unit: string;
  datasource: string;
  supportedVisualizations: string[];
};
```

Example:

```json
{
  "id": "cpu.usage",
  "name": "CPU Usage",
  "unit": "percent",
  "datasource": "metrics",
  "supportedVisualizations": ["timeseries", "stat"]
}
```

---

## 7. Time Range Model (Grafana-Compatible)

```ts
type TimeRange =
  | { type: "relative"; value: "now-1h" }
  | { type: "absolute"; from: number; to: number };
```

Rules:
- Dashboard has default  
- Widget may override  
- Datasource always receives resolved timestamps  

---

## 8. Datasource Plugin Interface

This is the most important abstraction.

```ts
interface Datasource {
  id: string;

  getMetrics(): Promise<MetricDefinition[]>;

  query(request: {
    metric: string;
    timeRange: TimeRange;
    filters?: Record<string, any>;
  }): Promise<DataFrame[]>;
}
```

---

## 9. Example Datasource Implementation (REST)

```ts
class RestDatasource implements Datasource {
  id = "metrics";

  async getMetrics() {
    return [
      {
        id: "cpu.usage",
        name: "CPU Usage",
        unit: "percent",
        datasource: this.id,
        supportedVisualizations: ["timeseries", "stat"]
      }
    ];
  }

  async query({ metric, timeRange, filters }) {
    const res = await fetch("/api/metrics", {
      method: "POST",
      body: JSON.stringify({ metric, timeRange, filters })
    });

    return await res.json(); // must return DataFrame[]
  }
}
```

---

## 10. Unified Data Model (DataFrame)

```ts
type Field = {
  name: string;
  type: "time" | "number" | "string";
  values: any[];
};

type DataFrame = {
  fields: Field[];
};
```

All visualizations consume this format.

---

## 11. Visualization Adapter Interface

```ts
interface VisualizationAdapter {
  type: string;

  render(
    data: DataFrame[],
    options: any,
    container: HTMLElement
  ): void;
}
```

---

## 12. Example ECharts Adapter

```ts
class EChartsAdapter implements VisualizationAdapter {
  type = "timeseries";

  render(data, options, container) {
    const timeField = data[0].fields.find(f => f.type === "time");
    const valueField = data[0].fields.find(f => f.type === "number");

    const chart = echarts.init(container);
    chart.setOption({
      xAxis: { type: "category", data: timeField.values },
      yAxis: { type: "value" },
      series: [{ type: "line", data: valueField.values }]
    });
  }
}
```

---

## 13. Widget Runtime Execution Flow

```
Dashboard JSON
 → For each widget:
    → Resolve effective time range
    → Find datasource
    → datasource.query()
    → Receive DataFrame[]
    → Select visualization adapter
    → Render widget
```

---

## 14. Plugin Registration System

```ts
class Registry {
  datasources = new Map();
  visualizations = new Map();

  registerDatasource(ds) {
    this.datasources.set(ds.id, ds);
  }

  registerVisualization(viz) {
    this.visualizations.set(viz.type, viz);
  }
}
```

---

## 15. What This Architecture Guarantees

- You can swap chart libraries without touching data logic  
- You can add datasources without touching UI  
- Dashboards are portable JSON  
- No vendor lock-in  
- Scales from 10 to 10,000 dashboards  

---

## 16. Final Verdict

This is:
- How Grafana works internally  
- How embedded analytics SaaS are built  
- The correct long-term architecture  

If you implement this, you will not need to rewrite it later.
