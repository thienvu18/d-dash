import type { GridAdapter, GridCapabilities, GridLayoutChange } from "@d-dash/core";

/**
 * Minimal subset of the gridstack.js GridStack instance API required by this adapter.
 * Using a structural interface keeps the adapter decoupled from gridstack's exact import path.
 */
export type GridStackInstance = {
  update(el: Element, opts: { x: number; y: number; w: number; h: number }): void;
  destroy(removeDOM?: boolean): void;
};

/**
 * Factory interface matching gridstack.js static `GridStack.init()`.
 * Pass the real `GridStack` class from gridstack.js, or a test double.
 */
export type GridStackFactory = {
  init(options?: Record<string, unknown>, el?: HTMLElement): GridStackInstance;
};

export type GridstackAdapterOptions = {
  /** The GridStack class (or compatible factory). Injected to keep the adapter testable. */
  GridStack: GridStackFactory;
  /** Options forwarded verbatim to GridStack.init(). */
  gridOptions?: Record<string, unknown>;
};

/**
 * The target passed to every adapter method.
 * The host app owns the container element; the adapter manages the GridStack instance on it.
 */
export type GridstackTarget = {
  el: HTMLElement;
};

/**
 * Creates a d-dash GridAdapter backed by gridstack.js.
 *
 * Usage:
 * ```ts
 * import { GridStack } from "gridstack";
 * import { createGridstackAdapter } from "@d-dash/adapter-gridstack";
 *
 * const adapter = createGridstackAdapter({ GridStack });
 * registry.registerGrid(adapter);
 * ```
 */
export function createGridstackAdapter(
  options: GridstackAdapterOptions,
): GridAdapter<GridstackTarget> {
  // One GridStack instance per container element; keyed weakly to avoid leaks.
  const instances = new WeakMap<HTMLElement, GridStackInstance>();

  const capabilities: GridCapabilities = {
    supportsDrag: true,
    supportsResize: true,
  };

  return {
    id: "gridstack",
    capabilities,

    init(target: GridstackTarget): void {
      // Idempotent: calling init on an already-mounted container is a no-op.
      if (instances.has(target.el)) {
        return;
      }
      const grid = options.GridStack.init(options.gridOptions ?? {}, target.el);
      instances.set(target.el, grid);
    },

    applyLayout(changes: GridLayoutChange[], target: GridstackTarget): void {
      const grid = instances.get(target.el);
      if (!grid) {
        throw new GridstackAdapterException(
          "Grid not initialized. Call init() before applyLayout().",
        );
      }

      for (const change of changes) {
        // Widget elements are expected to carry a `gs-id` attribute matching the widgetId.
        const el = target.el.querySelector(`[gs-id="${change.widgetId}"]`);
        if (!el) {
          // Widget element not yet in DOM — skip gracefully, host can retry after mount.
          continue;
        }
        grid.update(el, { x: change.x, y: change.y, w: change.w, h: change.h });
      }
    },

    destroy(target: GridstackTarget): void {
      const grid = instances.get(target.el);
      if (grid) {
        // Pass false to preserve DOM nodes; host is responsible for DOM cleanup.
        grid.destroy(false);
        instances.delete(target.el);
      }
    },
  };
}

class GridstackAdapterException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GridstackAdapterException";
  }
}
