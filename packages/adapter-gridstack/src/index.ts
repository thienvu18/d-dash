import type {
  GridAdapter,
  GridCapabilities,
  GridLayoutChange,
  GridLayoutChangeHandler,
} from "@d-dash/core";
import type {
  GridStack,
  GridStackNode,
  GridStackOptions,
  GridStackElement,
} from "gridstack";

/** Configuration options for creating a Gridstack adapter instance. */
export type GridstackAdapterOptions = {
  /** The GridStack class (injected for testability). */
  GridStack: typeof GridStack;
  /** Options forwarded verbatim to GridStack.init(). */
  gridOptions?: GridStackOptions;
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
  const instances = new WeakMap<HTMLElement, GridStack>();
  const changeHandlers = new WeakMap<
    HTMLElement,
    (event: unknown, items?: GridStackNode[]) => void
  >();
  const subscribers = new WeakMap<HTMLElement, Set<GridLayoutChangeHandler>>();

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

      if (typeof grid.on === "function") {
        const handler = (_event: unknown, items?: GridStackNode[]) => {
          const changes: GridLayoutChange[] = [];

          for (const item of items ?? []) {
            const widgetId =
              // prefer explicit id, fall back to element `gs-id` attribute when present
              item.id ??
              (item.el?.getAttribute
                ? (item.el.getAttribute("gs-id") ?? undefined)
                : undefined);

            if (!widgetId) {
              continue;
            }

            changes.push({
              widgetId,
              x: item.x ?? 0,
              y: item.y ?? 0,
              w: item.w ?? 0,
              h: item.h ?? 0,
            });
          }

          if (changes.length > 0) {
            const listeners = subscribers.get(target.el);
            if (listeners) {
              for (const listener of listeners) {
                listener(changes);
              }
            }
          }
        };

        grid.on("change", handler);
        changeHandlers.set(target.el, handler);
      }
    },

    subscribeLayoutChanges(
      target: GridstackTarget,
      handler: GridLayoutChangeHandler,
    ): () => void {
      let listeners = subscribers.get(target.el);
      if (!listeners) {
        listeners = new Set<GridLayoutChangeHandler>();
        subscribers.set(target.el, listeners);
      }

      listeners.add(handler);

      return () => {
        const currentListeners = subscribers.get(target.el);
        if (!currentListeners) {
          return;
        }

        currentListeners.delete(handler);
        if (currentListeners.size === 0) {
          subscribers.delete(target.el);
        }
      };
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
        const el = target.el.querySelector(
          `[gs-id="${change.widgetId}"]`,
        ) as unknown as GridStackElement;
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
        if (typeof grid.off === "function") {
          // grid.off removes handlers by event name per gridstack typings
          grid.off("change");
        }

        // Pass false to preserve DOM nodes; host is responsible for DOM cleanup.
        grid.destroy(false);
        instances.delete(target.el);
        changeHandlers.delete(target.el);
        subscribers.delete(target.el);
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
