import type {
  DashboardMeta,
  PersistedDashboard,
  PersistedWidget,
  PersistedVariable,
  LayoutItem,
  WidgetQuery,
  WidgetVisualization,
  WidgetDisplay,
  PersistedTimeRange,
  VisualizationKind,
  JsonObject,
} from "@d-dash/core";

export class WidgetBuilder {
  private _id: string;
  private _layoutId: string;
  private _datasource!: string;
  private _query!: WidgetQuery;
  private _visualization!: WidgetVisualization;
  private _display?: WidgetDisplay;
  private _timeRange?: PersistedTimeRange;
  private _options?: JsonObject;

  constructor(id: string, layoutId: string) {
    this._id = id;
    this._layoutId = layoutId;
  }

  datasource(datasource: string): this {
    this._datasource = datasource;
    return this;
  }

  query(metric: string, filters?: JsonObject): this {
    this._query = { metric, filters };
    return this;
  }

  visualization(type: VisualizationKind): this {
    this._visualization = { type };
    return this;
  }

  display(title: string, description?: string): this {
    this._display = { title, description };
    return this;
  }

  timeRange(timeRange: PersistedTimeRange): this {
    this._timeRange = timeRange;
    return this;
  }

  options(options: JsonObject): this {
    this._options = options;
    return this;
  }

  build(): PersistedWidget {
    if (!this._datasource || !this._query || !this._visualization) {
      throw new Error("Widget is missing required fields (datasource, query, visualization).");
    }

    return {
      id: this._id,
      layoutId: this._layoutId,
      datasource: this._datasource,
      query: this._query,
      visualization: this._visualization,
      display: this._display,
      timeRange: this._timeRange,
      options: this._options,
    };
  }
}

export class DashboardBuilder {
  private _dashboardId: string;
  private _meta: DashboardMeta = { title: "" };
  private _timeRange: PersistedTimeRange = { type: "relative", value: "now-6h" };
  private _layout: LayoutItem[] = [];
  private _widgets: PersistedWidget[] = [];
  private _variables: PersistedVariable[] = [];

  constructor(dashboardId: string) {
    this._dashboardId = dashboardId;
  }

  title(title: string): this {
    this._meta.title = title;
    return this;
  }

  description(description: string): this {
    this._meta.description = description;
    return this;
  }

  tags(tags: string[]): this {
    this._meta.tags = tags;
    return this;
  }

  folder(folder: string): this {
    this._meta.folder = folder;
    return this;
  }

  tenant(tenant: string): this {
    this._meta.tenant = tenant;
    return this;
  }

  timeRange(timeRange: PersistedTimeRange): this {
    this._timeRange = timeRange;
    return this;
  }

  addVariable(variable: PersistedVariable): this {
    this._variables.push(variable);
    return this;
  }

  addWidget(widget: PersistedWidget | WidgetBuilder): this {
    if (widget instanceof WidgetBuilder) {
      this._widgets.push(widget.build());
    } else {
      this._widgets.push(widget);
    }
    return this;
  }

  addLayoutItem(item: LayoutItem): this {
    this._layout.push(item);
    return this;
  }

  build(): PersistedDashboard {
    if (!this._meta.title) {
      throw new Error("Dashboard must have a title.");
    }
    
    const dashboard: PersistedDashboard = {
      schemaVersion: 1,
      dashboardId: this._dashboardId,
      meta: this._meta,
      timeRange: this._timeRange,
      layout: this._layout,
      widgets: this._widgets,
    };

    if (this._variables.length > 0) {
      dashboard.variables = this._variables;
    }

    return dashboard;
  }
}
