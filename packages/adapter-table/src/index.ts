import type {
  DataFrame,
  VisualizationAdapter,
  VisualizationCapabilities,
  VisualizationRenderRequest,
} from "@d-dash/core";

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

/** Target passed to the table adapter; the host app owns the container element. */
export type TableTarget = {
  el: HTMLElement;
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for the table visualization adapter.
 * Pass these through the widget's `options` field in the persisted dashboard.
 * @experimental
 */
export type TableAdapterOptions = {
  /**
   * Whether to render a sort button in each column header.
   * Clicking the header re-renders the table with that column sorted ascending/descending.
   * @default false
   */
  sortable?: boolean;
  /**
   * Whether to paginate the table.
   * @default false
   */
  pagination?: boolean;
  /**
   * Number of rows per page when `pagination` is enabled.
   * @default 20
   */
  pageSize?: number;
  /**
   * Explicit column order (by field name). Fields not listed are appended in their
   * original order.
   */
  columnOrder?: string[];
  /**
   * Per-column pixel widths keyed by field name. Values without a declared width
   * receive no inline width style.
   */
  columnWidths?: Record<string, number>;
  /**
   * Renders only the rows visible in the current scroll window instead of the
   * full row set. Improves performance for frames with large row counts.
   * Incompatible with `pagination` — `pagination` takes precedence when both are set.
   * @default false
   */
  virtualScroll?: boolean;
  /**
   * Height of the scrollable table container in pixels when `virtualScroll` is enabled.
   * @default 400
   */
  virtualScrollHeight?: number;
  /**
   * Estimated height of a single data row in pixels, used to compute the visible window
   * and spacer row heights. All rows are assumed to share this height.
   * @default 32
   */
  rowHeight?: number;
};

// ---------------------------------------------------------------------------
// Capability declaration
// ---------------------------------------------------------------------------

const CAPABILITIES: VisualizationCapabilities = {
  supportsTable: true,
  supportsResize: true,
};

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

/**
 * Creates a d-dash `VisualizationAdapter` that renders DataFrames into an HTML
 * `<table>` element. Returns a single adapter with `type: "table"`.
 *
 * Usage:
 * ```ts
 * import { createTableAdapter } from "@d-dash/adapter-table";
 *
 * registry.registerVisualization(createTableAdapter());
 * ```
 * @experimental
 */
export function createTableAdapter(): VisualizationAdapter<TableTarget> {
  // Per-element state map: current sort state and page index.
  const state = new WeakMap<
    HTMLElement,
    { sortCol: string | null; sortAsc: boolean; page: number; scrollTop: number }
  >();

  function getState(el: HTMLElement) {
    if (!state.has(el)) {
      state.set(el, { sortCol: null, sortAsc: true, page: 0, scrollTop: 0 });
    }
    return state.get(el)!;
  }

  function doRender(
    request: VisualizationRenderRequest,
    target: TableTarget,
  ): void {
    const opts = (request.options ?? {}) as TableAdapterOptions;
    const sortable = opts.sortable === true;
    const pagination = opts.pagination === true;
    const pageSize = typeof opts.pageSize === "number" ? opts.pageSize : 20;
    const columnOrder = Array.isArray(opts.columnOrder) ? opts.columnOrder : [];
    const columnWidths: Record<string, number> =
      opts.columnWidths && typeof opts.columnWidths === "object"
        ? (opts.columnWidths as Record<string, number>)
        : {};
    const virtualScroll = opts.virtualScroll === true;

    const s = getState(target.el);

    // Merge all frames into a unified column set. Each frame provides rows.
    const allFields = mergeFrameFields(request.frames, columnOrder);
    if (allFields.length === 0) {
      target.el.innerHTML = "<table><tbody><tr><td>(no data)</td></tr></tbody></table>";
      return;
    }

    // Build rows: each index position across all fields forms a row.
    const rowCount = allFields[0].values.length;
    let rows: unknown[][] = Array.from({ length: rowCount }, (_, i) =>
      allFields.map((f) => f.values[i] ?? null),
    );

    // Sort by the active column.
    if (s.sortCol !== null) {
      const colIdx = allFields.findIndex((f) => f.name === s.sortCol);
      if (colIdx !== -1) {
        rows = [...rows].sort((a, b) => {
          const av = a[colIdx];
          const bv = b[colIdx];
          if (av === bv) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          if (typeof av === "number" && typeof bv === "number") {
            return s.sortAsc ? av - bv : bv - av;
          }
          return s.sortAsc
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av));
        });
      }
    }

    // Virtual scroll: render only the rows inside the current viewport window.
    // A top and bottom spacer row preserve the full scrollable height without
    // creating DOM nodes for every data row.
    if (virtualScroll && !pagination) {
      const containerHeight = opts.virtualScrollHeight ?? 400;
      const rowH = opts.rowHeight ?? 32;
      const overscan = 3;
      const firstVisible = Math.max(0, Math.floor(s.scrollTop / rowH) - overscan);
      const visibleCount = Math.ceil(containerHeight / rowH) + overscan * 2;
      const lastVisible = Math.min(rows.length - 1, firstVisible + visibleCount - 1);
      const windowRows = rows.slice(firstVisible, lastVisible + 1);
      const topSpacerHeight = firstVisible * rowH;
      const bottomSpacerHeight = Math.max(0, (rows.length - 1 - lastVisible) * rowH);

      const vsTable = document.createElement("table");
      vsTable.style.borderCollapse = "collapse";
      vsTable.style.width = "100%";

      const vsThead = vsTable.createTHead();
      const vsHeaderRow = vsThead.insertRow();
      for (const field of allFields) {
        const th = document.createElement("th");
        th.style.textAlign = "left";
        th.style.padding = "4px 8px";
        th.style.borderBottom = "1px solid #ccc";
        if (columnWidths[field.name]) {
          th.style.width = `${columnWidths[field.name]}px`;
        }
        if (sortable) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.style.background = "none";
          btn.style.border = "none";
          btn.style.cursor = "pointer";
          btn.style.fontWeight = "bold";
          btn.style.padding = "0";
          const indicator = s.sortCol === field.name ? (s.sortAsc ? " ▲" : " ▼") : "";
          btn.textContent = field.name + indicator;
          btn.addEventListener("click", () => {
            if (s.sortCol === field.name) {
              s.sortAsc = !s.sortAsc;
            } else {
              s.sortCol = field.name;
              s.sortAsc = true;
            }
            s.page = 0;
            s.scrollTop = 0;
            doRender(request, target);
          });
          th.appendChild(btn);
        } else {
          th.textContent = field.name;
        }
        vsHeaderRow.appendChild(th);
      }

      const vsTbody = vsTable.createTBody();
      if (topSpacerHeight > 0) {
        const spacerRow = vsTbody.insertRow();
        const spacerCell = spacerRow.insertCell();
        spacerCell.colSpan = allFields.length;
        spacerCell.style.height = `${topSpacerHeight}px`;
        spacerCell.style.padding = "0";
      }
      for (const row of windowRows) {
        const tr = vsTbody.insertRow();
        for (const cell of row) {
          const td = tr.insertCell();
          td.style.padding = "4px 8px";
          td.style.borderBottom = "1px solid #eee";
          td.textContent = cell === null || cell === undefined ? "" : String(cell);
        }
      }
      if (bottomSpacerHeight > 0) {
        const spacerRow = vsTbody.insertRow();
        const spacerCell = spacerRow.insertCell();
        spacerCell.colSpan = allFields.length;
        spacerCell.style.height = `${bottomSpacerHeight}px`;
        spacerCell.style.padding = "0";
      }

      const scrollContainer = document.createElement("div");
      scrollContainer.style.overflowY = "auto";
      scrollContainer.style.height = `${containerHeight}px`;
      scrollContainer.addEventListener("scroll", (e) => {
        s.scrollTop = (e.target as HTMLElement).scrollTop;
        doRender(request, target);
      });
      scrollContainer.appendChild(vsTable);

      target.el.innerHTML = "";
      target.el.appendChild(scrollContainer);
      // Restore the scroll position after the container is in the DOM.
      scrollContainer.scrollTop = s.scrollTop;
      return;
    }

    // Paginate.
    const totalPages = pagination ? Math.ceil(rows.length / pageSize) : 1;
    s.page = Math.min(s.page, Math.max(0, totalPages - 1));
    const visibleRows = pagination
      ? rows.slice(s.page * pageSize, (s.page + 1) * pageSize)
      : rows;

    // Build table HTML.
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";

    // Header row.
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    for (const field of allFields) {
      const th = document.createElement("th");
      th.style.textAlign = "left";
      th.style.padding = "4px 8px";
      th.style.borderBottom = "1px solid #ccc";
      if (columnWidths[field.name]) {
        th.style.width = `${columnWidths[field.name]}px`;
      }

      if (sortable) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.background = "none";
        btn.style.border = "none";
        btn.style.cursor = "pointer";
        btn.style.fontWeight = "bold";
        btn.style.padding = "0";
        const indicator =
          s.sortCol === field.name ? (s.sortAsc ? " ▲" : " ▼") : "";
        // Text content only — prevents XSS.
        btn.textContent = field.name + indicator;
        btn.addEventListener("click", () => {
          if (s.sortCol === field.name) {
            s.sortAsc = !s.sortAsc;
          } else {
            s.sortCol = field.name;
            s.sortAsc = true;
          }
          s.page = 0;
          doRender(request, target);
        });
        th.appendChild(btn);
      } else {
        th.textContent = field.name;
      }

      headerRow.appendChild(th);
    }

    // Data rows.
    const tbody = table.createTBody();
    for (const row of visibleRows) {
      const tr = tbody.insertRow();
      for (const cell of row) {
        const td = tr.insertCell();
        td.style.padding = "4px 8px";
        td.style.borderBottom = "1px solid #eee";
        // Use textContent to avoid XSS — values are data, not markup.
        td.textContent = cell === null || cell === undefined ? "" : String(cell);
      }
    }

    // Pagination controls.
    target.el.innerHTML = "";
    target.el.appendChild(table);

    if (pagination && totalPages > 1) {
      const controls = document.createElement("div");
      controls.style.marginTop = "4px";
      controls.style.display = "flex";
      controls.style.gap = "8px";
      controls.style.alignItems = "center";

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.textContent = "‹ Prev";
      prevBtn.disabled = s.page === 0;
      prevBtn.addEventListener("click", () => {
        s.page -= 1;
        doRender(request, target);
      });

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.textContent = "Next ›";
      nextBtn.disabled = s.page >= totalPages - 1;
      nextBtn.addEventListener("click", () => {
        s.page += 1;
        doRender(request, target);
      });

      const pageLabel = document.createElement("span");
      pageLabel.textContent = `Page ${s.page + 1} / ${totalPages}`;

      controls.appendChild(prevBtn);
      controls.appendChild(pageLabel);
      controls.appendChild(nextBtn);
      target.el.appendChild(controls);
    }
  }

  return {
    type: "table",
    capabilities: CAPABILITIES,

    render(request: VisualizationRenderRequest, target: TableTarget): void {
      doRender(request, target);
    },

    resize(_target: TableTarget): void {
      // The table is fluid-width; no resize action needed.
    },

    destroy(target: TableTarget): void {
      target.el.innerHTML = "";
      state.delete(target.el);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merges fields from all frames into a single array respecting columnOrder.
 * Fields with duplicate names from later frames are skipped.
 */
function mergeFrameFields(
  frames: DataFrame[],
  columnOrder: string[],
): DataFrame["fields"] {
  const seen = new Set<string>();
  const allFields: DataFrame["fields"] = [];

  for (const frame of frames) {
    for (const field of frame.fields) {
      if (!seen.has(field.name)) {
        seen.add(field.name);
        allFields.push(field);
      }
    }
  }

  if (columnOrder.length === 0) {
    return allFields;
  }

  // Re-order: listed columns first (in order), then remaining fields.
  const ordered = columnOrder
    .map((name) => allFields.find((f) => f.name === name))
    .filter((f): f is DataFrame["fields"][number] => f !== undefined);
  const rest = allFields.filter((f) => !columnOrder.includes(f.name));

  return [...ordered, ...rest];
}
