import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createTableAdapter } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Minimal DOM shim for Node.js (no browser)
// ---------------------------------------------------------------------------

function makeElement(tag = "div") {
  const children = [];
  let _innerHTML = "";
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    childNodes: children,
    children,
    get innerHTML() { return _innerHTML; },
    set innerHTML(v) {
      _innerHTML = v;
      // Setting innerHTML to empty clears all child nodes, matching browser behaviour.
      if (v === "") children.length = 0;
    },
    // Minimal DOM API used by the adapter.
    appendChild(child) {
      children.push(child);
      return child;
    },
    createTHead() {
      const thead = makeElement("thead");
      el._thead = thead;
      return thead;
    },
    createTBody() {
      const tbody = makeElement("tbody");
      el._tbody = tbody;
      return tbody;
    },
    insertRow() {
      const tr = makeElement("tr");
      children.push(tr);
      tr.cells = [];
      tr.insertCell = () => {
        const td = makeElement("td");
        td.style = {};
        tr.cells.push(td);
        tr.children.push(td);
        return td;
      };
      // Do NOT override tr.appendChild — makeElement already defines it correctly
      // to push into tr's own children array.
      return tr;
    },
  };
  return el;
}

/**
 * Build a mock target element and a minimal document-like factory so the adapter
 * can create DOM nodes.
 */
function makeDomTarget() {
  const el = makeElement("div");

  // Patch global document for the adapter. The adapter uses:
  //   document.createElement
  //   element.createTHead / createTBody / insertRow / insertCell
  //   element.textContent
  //   element.appendChild / innerHTML
  global.document = {
    createElement(tag) {
      const node = makeElement(tag);
      // Give each node a textContent setter in addition to innerHTML.
      Object.defineProperty(node, "textContent", {
        get() { return this._text ?? ""; },
        set(v) { this._text = String(v); },
        configurable: true,
      });
      node.addEventListener = (_evt, fn) => { node._listeners = node._listeners ?? {}; node._listeners[_evt] = fn; };
      node.disabled = false;
      return node;
    },
  };

  return { el };
}

function makeContext() {
  return { traceId: "trace-table-1" };
}

function makeFrameWithStringAndNumber() {
  return {
    fields: [
      { name: "host", type: "string", values: ["web-1", "web-2", "web-3"] },
      { name: "req/s", type: "number", values: [100, 200, 150] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Capability and type declarations
// ---------------------------------------------------------------------------

describe("createTableAdapter — capabilities and type", () => {
  test("returns an adapter with type 'table'", () => {
    const adapter = createTableAdapter();
    assert.equal(adapter.type, "table");
  });

  test("declares supportsTable and supportsResize capabilities", () => {
    const adapter = createTableAdapter();
    assert.equal(adapter.capabilities?.supportsTable, true);
    assert.equal(adapter.capabilities?.supportsResize, true);
  });
});

// ---------------------------------------------------------------------------
// Render — basic output
// ---------------------------------------------------------------------------

describe("createTableAdapter — render", () => {
  test("renders (no data) message when frames are empty", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    adapter.render(
      { kind: "table", frames: [], options: {}, context: makeContext() },
      { el },
    );

    assert.ok(el.innerHTML.includes("(no data)"), "should render no-data message");
  });

  test("renders a table element for a frame with data", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    adapter.render(
      {
        kind: "table",
        frames: [makeFrameWithStringAndNumber()],
        options: {},
        context: makeContext(),
      },
      { el },
    );

    // The adapter wraps the table in a tableWrapper div, which is in el.children.
    const tableWrapper = el.children.find((c) => c.tagName === "DIV");
    assert.ok(tableWrapper, "table wrapper div should be present");
    const table = tableWrapper?.children.find((c) => c.tagName === "TABLE");
    assert.ok(table, "table element should be present inside wrapper");
  });

  test("destroy clears innerHTML", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    adapter.render(
      {
        kind: "table",
        frames: [makeFrameWithStringAndNumber()],
        options: {},
        context: makeContext(),
      },
      { el },
    );

    adapter.destroy({ el });
    assert.equal(el.innerHTML, "");
  });

  test("resize is a no-op and does not throw", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();
    assert.doesNotThrow(() => adapter.resize({ el }));
  });
});

// ---------------------------------------------------------------------------
// mergeFrameFields — columnOrder
// ---------------------------------------------------------------------------

describe("createTableAdapter — columnOrder option", () => {
  test("re-orders columns according to columnOrder option", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    // Deliberately frame with fields: host then req/s.
    adapter.render(
      {
        kind: "table",
        frames: [makeFrameWithStringAndNumber()],
        options: { columnOrder: ["req/s", "host"] },
        context: makeContext(),
      },
      { el },
    );

    // The adapter wraps the table in a tableWrapper div.
    const tableWrapper = el.children.find((c) => c.tagName === "DIV");
    assert.ok(tableWrapper, "table wrapper div should be present");
    const table = tableWrapper?.children.find((c) => c.tagName === "TABLE");
    assert.ok(table, "table should be present inside wrapper");
    // The thead was created on the table element via createTHead().
    const thead = table._thead;
    assert.ok(thead, "thead should be present");
    const headerRow = thead.children[0];
    assert.ok(headerRow, "header row should exist");
    const headerCells = headerRow.children.filter((c) => c.tagName === "TH");
    assert.equal(headerCells.length, 2);
    // First header should be req/s (column was reordered).
    assert.equal(headerCells[0]._text ?? headerCells[0].textContent, "req/s");
  });
});

// ---------------------------------------------------------------------------
// Multiple frames
// ---------------------------------------------------------------------------

describe("createTableAdapter — multiple frames", () => {
  test("merges fields from multiple frames, skipping duplicate names", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    const frames = [
      {
        fields: [
          { name: "host", type: "string", values: ["web-1"] },
          { name: "cpu", type: "number", values: [55] },
        ],
      },
      {
        // 'host' is duplicate — should be skipped; 'mem' is new.
        fields: [
          { name: "host", type: "string", values: ["web-1"] },
          { name: "mem", type: "number", values: [70] },
        ],
      },
    ];

    adapter.render(
      { kind: "table", frames, options: {}, context: makeContext() },
      { el },
    );

    // The adapter wraps the table in a tableWrapper div.
    const tableWrapper = el.children.find((c) => c.tagName === "DIV");
    assert.ok(tableWrapper, "table wrapper div should be present");
    const table = tableWrapper?.children.find((c) => c.tagName === "TABLE");
    assert.ok(table, "table should be present inside wrapper");
    const thead = table._thead;
    const headerRow = thead.children[0];
    const headerCells = headerRow.children.filter((c) => c.tagName === "TH");
    // Expect: host, cpu, mem (3 unique fields).
    assert.equal(headerCells.length, 3);
  });
});
// ---------------------------------------------------------------------------
// Virtual scroll
// ---------------------------------------------------------------------------

/** Build a frame with `count` rows where: col0 = "row-N" (string), col1 = N (number). */
function makeFrameWithRows(count) {
  const labels = [];
  const values = [];
  for (let i = 0; i < count; i++) {
    labels.push(`row-${i}`);
    values.push(i);
  }
  return {
    fields: [
      { name: "label", type: "string", values: labels },
      { name: "value", type: "number", values: values },
    ],
  };
}

describe("createTableAdapter — virtualScroll option", () => {
  test("wraps table in a scroll container div when virtualScroll is enabled", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    adapter.render(
      {
        kind: "table",
        frames: [makeFrameWithRows(50)],
        options: { virtualScroll: true, virtualScrollHeight: 160, rowHeight: 32 },
        context: makeContext(),
      },
      { el },
    );

    // First child of the container element is the scroll wrapper div, not a table.
    const scrollDiv = el.children[0];
    assert.ok(scrollDiv, "scroll container should be present");
    assert.equal(scrollDiv.tagName, "DIV", "scroll container should be a div");
    // The table lives inside the scroll container.
    const table = scrollDiv.children.find((c) => c.tagName === "TABLE");
    assert.ok(table, "table should be inside scroll container");
  });

  test("renders fewer tbody rows than total row count when virtualScroll is enabled", () => {
    const totalRows = 50;
    // containerHeight=160, rowHeight=32 → 5 visible rows + 6 overscan = 11 max visible
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    adapter.render(
      {
        kind: "table",
        frames: [makeFrameWithRows(totalRows)],
        options: { virtualScroll: true, virtualScrollHeight: 160, rowHeight: 32 },
        context: makeContext(),
      },
      { el },
    );

    const scrollDiv = el.children[0];
    const table = scrollDiv.children.find((c) => c.tagName === "TABLE");
    const tbody = table._tbody;
    // The tbody should have fewer rows than totalRows (window + at most 2 spacers).
    assert.ok(
      tbody.children.length < totalRows,
      `Expected fewer than ${totalRows} tbody rows, got ${tbody.children.length}`,
    );
  });

  test("adds a bottom spacer row when the frame has more rows than the visible window", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();

    adapter.render(
      {
        kind: "table",
        frames: [makeFrameWithRows(50)],
        options: { virtualScroll: true, virtualScrollHeight: 160, rowHeight: 32 },
        context: makeContext(),
      },
      { el },
    );

    const table = el.children[0].children.find((c) => c.tagName === "TABLE");
    const tbody = table._tbody;
    // The last row is the bottom spacer: 1 cell with a height style.
    const lastRow = tbody.children[tbody.children.length - 1];
    assert.ok(lastRow.cells.length === 1, "bottom spacer row should have 1 cell");
    assert.ok(
      lastRow.cells[0].style.height && lastRow.cells[0].style.height !== "0px",
      "bottom spacer cell should have a non-zero height",
    );
  });

  test("scrolling updates the visible window via the scroll listener", () => {
    const adapter = createTableAdapter();
    const { el } = makeDomTarget();
    const frame = makeFrameWithRows(50);
    const opts = { virtualScroll: true, virtualScrollHeight: 160, rowHeight: 32 };

    adapter.render(
      { kind: "table", frames: [frame], options: opts, context: makeContext() },
      { el },
    );

    // Simulate a scroll to row 20 (scrollTop = 20 * 32 = 640).
    const scrollDiv = el.children[0];
    scrollDiv.scrollTop = 640;
    scrollDiv._listeners.scroll({ target: scrollDiv });

    // After re-render the container is replaced; first visible row should now be
    // around row 17 (= floor(640/32) - overscan(3)).
    const newScrollDiv = el.children[0];
    const table = newScrollDiv.children.find((c) => c.tagName === "TABLE");
    const tbody = table._tbody;

    // A top spacer should now exist (rows 0..16 are skipped).
    const firstRow = tbody.children[0];
    assert.ok(
      firstRow.cells.length === 1 && firstRow.cells[0].style.height,
      "top spacer row should be present after scrolling",
    );
  });
});