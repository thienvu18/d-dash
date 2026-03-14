import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createGridstackAdapter } from "../dist/index.js";

/** Builds a mock GridStack factory and records all calls. */
function makeGridStackFactory() {
  const calls = { init: [], update: [], destroy: [], on: [], off: [] };
  const listeners = new WeakMap();

  const factory = {
    init(options, el) {
      calls.init.push({ options, el });
      const listenerMap = new Map();
      listeners.set(el, listenerMap);

      return {
        update(el, opts) {
          calls.update.push({ el, opts });
        },
        on(event, callback) {
          calls.on.push({ event });
          listenerMap.set(event, callback);
        },
        off(event, callback) {
          calls.off.push({ event });
          const current = listenerMap.get(event);
          if (current === callback) {
            listenerMap.delete(event);
          }
        },
        destroy(removeDOM) {
          calls.destroy.push({ removeDOM });
        },
      };
    },
  };

  function emitChange(el, items) {
    const listenerMap = listeners.get(el);
    const callback = listenerMap?.get("change");
    if (callback) {
      callback({}, items);
    }
  }

  return { factory, calls, emitChange };
}

/**
 * Builds a minimal duck-typed target.
 * Each child is { gsId, el } where gsId is the expected gs-id attribute value.
 */
function makeTarget(children = []) {
  return {
    el: {
      querySelector(selector) {
        const match = children.find((c) => selector === `[gs-id="${c.gsId}"]`);
        return match ? match.el : null;
      },
    },
  };
}

describe("createGridstackAdapter", () => {
  test("adapter id is 'gridstack'", () => {
    const { factory } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    assert.equal(adapter.id, "gridstack");
  });

  test("adapter declares drag and resize capabilities", () => {
    const { factory } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    assert.equal(adapter.capabilities?.supportsDrag, true);
    assert.equal(adapter.capabilities?.supportsResize, true);
  });

  test("init creates a GridStack instance on the target element", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();

    adapter.init(target);

    assert.equal(calls.init.length, 1);
    assert.equal(calls.init[0].el, target.el);
  });

  test("init forwards gridOptions to GridStack.init", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({
      GridStack: factory,
      gridOptions: { column: 12 },
    });
    const target = makeTarget();

    adapter.init(target);

    assert.deepEqual(calls.init[0].options, { column: 12 });
  });

  test("init is idempotent — repeated calls do not create duplicate instances", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();

    adapter.init(target);
    adapter.init(target);

    assert.equal(calls.init.length, 1);
  });

  test("applyLayout calls update for each matched widget element", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const widgetEl = {};
    const target = makeTarget([{ gsId: "w1", el: widgetEl }]);

    adapter.init(target);
    adapter.applyLayout([{ widgetId: "w1", x: 1, y: 2, w: 4, h: 3 }], target);

    assert.equal(calls.update.length, 1);
    assert.equal(calls.update[0].el, widgetEl);
    assert.deepEqual(calls.update[0].opts, { x: 1, y: 2, w: 4, h: 3 });
  });

  test("applyLayout skips widgetId with no matching DOM element", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget(); // no children

    adapter.init(target);
    adapter.applyLayout(
      [{ widgetId: "missing", x: 0, y: 0, w: 2, h: 2 }],
      target,
    );

    assert.equal(calls.update.length, 0);
  });

  test("applyLayout throws when grid is not initialized", () => {
    const { factory } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();

    assert.throws(
      () => adapter.applyLayout([], target),
      (error) => {
        assert.match(String(error?.message), /not initialized/);
        return true;
      },
    );
  });

  test("destroy calls grid.destroy(false) and cleans up the instance", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();

    adapter.init(target);
    adapter.destroy(target);

    assert.equal(calls.destroy.length, 1);
    assert.equal(calls.destroy[0].removeDOM, false);
  });

  test("subscribeLayoutChanges receives normalized grid change events", () => {
    const { factory, emitChange } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();
    const received = [];

    adapter.init(target);
    const unsubscribe = adapter.subscribeLayoutChanges(target, (changes) => {
      received.push(...changes);
    });

    emitChange(target.el, [{ id: "w1", x: 4, y: 5, w: 6, h: 7 }]);

    assert.equal(received.length, 1);
    assert.deepEqual(received[0], { widgetId: "w1", x: 4, y: 5, w: 6, h: 7 });

    unsubscribe();
  });

  test("subscribeLayoutChanges unsubscribe stops receiving events", () => {
    const { factory, emitChange } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();
    const received = [];

    adapter.init(target);
    const unsubscribe = adapter.subscribeLayoutChanges(target, (changes) => {
      received.push(...changes);
    });

    unsubscribe();
    emitChange(target.el, [{ id: "w1", x: 4, y: 5, w: 6, h: 7 }]);

    assert.equal(received.length, 0);
  });

  test("destroy unregisters change event listener", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();

    adapter.init(target);
    adapter.destroy(target);

    assert.equal(calls.on.length, 1);
    assert.equal(calls.off.length, 1);
    assert.equal(calls.off[0].event, "change");
  });

  test("destroy on uninitialized target is a no-op", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const target = makeTarget();

    assert.doesNotThrow(() => adapter.destroy(target));
    assert.equal(calls.destroy.length, 0);
  });

  test("two separate targets each get independent GridStack instances", () => {
    const { factory, calls } = makeGridStackFactory();
    const adapter = createGridstackAdapter({ GridStack: factory });
    const targetA = makeTarget();
    const targetB = makeTarget();

    adapter.init(targetA);
    adapter.init(targetB);

    assert.equal(calls.init.length, 2);
    assert.notEqual(calls.init[0].el, calls.init[1].el);
  });
});
