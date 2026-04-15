import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  sanitizeHtml,
  widgetOptionsToHtmlContent,
  widgetOptionsToTextContent,
  createHtmlAdapters,
} from "../dist/index.js";

function makeTarget() {
  return { el: { innerHTML: "" } };
}

function makeContext() {
  return { traceId: "trace-html-1" };
}

// ---------------------------------------------------------------------------
// sanitizeHtml — script stripping
// ---------------------------------------------------------------------------

describe("sanitizeHtml — script stripping", () => {
  test("strips a basic <script> block", () => {
    const result = sanitizeHtml("<div>safe</div><script>alert(1)</script>");
    assert.equal(result.includes("<script"), false);
    assert.equal(result.includes("alert"), false);
    assert.ok(result.includes("safe"));
  });

  test("strips <Script> (case-insensitive tag name)", () => {
    const result = sanitizeHtml("<p>ok</p><Script>evil()</Script>");
    assert.equal(result.includes("<Script"), false);
    assert.equal(result.includes("evil"), false);
  });

  test("strips </script > with trailing space after tag name", () => {
    const result = sanitizeHtml("<b>hello</b><script>bad()</script >");
    assert.equal(result.includes("<script"), false);
    assert.equal(result.includes("bad"), false);
    assert.ok(result.includes("hello"));
  });

  test("strips </SCRIPT> with tab before closing angle", () => {
    const result = sanitizeHtml("<span>x</span><script>evil()</script\t>");
    assert.equal(result.includes("<script"), false);
    assert.equal(result.includes("evil"), false);
    assert.ok(result.includes("x"));
  });

  test("strips unterminated script tag (discards remaining input)", () => {
    const result = sanitizeHtml("<p>a</p><script>no close tag ever");
    assert.equal(result.includes("<script"), false);
  });

  test("strips multiple script blocks", () => {
    const result = sanitizeHtml(
      "<script>one()</script><p>ok</p><script>two()</script>",
    );
    assert.equal(result.includes("<script"), false);
    assert.ok(result.includes("ok"));
  });
});

// ---------------------------------------------------------------------------
// sanitizeHtml — event handler stripping
// ---------------------------------------------------------------------------

describe("sanitizeHtml — event handler stripping", () => {
  test("strips onclick double-quoted attribute", () => {
    const result = sanitizeHtml('<div onclick="evil()">text</div>');
    assert.equal(result.includes("onclick"), false);
    assert.ok(result.includes("text"));
  });

  test("strips onerror single-quoted attribute", () => {
    const result = sanitizeHtml("<img onerror='bad()' src='x.png'>");
    assert.equal(result.includes("onerror"), false);
  });

  test("strips onload attribute", () => {
    const result = sanitizeHtml("<body onload=init()>");
    assert.equal(result.includes("onload"), false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeHtml — URL scheme blocking
// ---------------------------------------------------------------------------

describe("sanitizeHtml — URL scheme blocking", () => {
  test("strips javascript: in href", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    assert.equal(result.includes("javascript:"), false);
    assert.ok(result.includes("click"));
  });

  test("strips data: in src (alert #7: incomplete URL scheme check)", () => {
    const result = sanitizeHtml(
      '<img src="data:text/html,<script>alert(1)</script>">',
    );
    assert.equal(result.includes("data:"), false);
  });

  test("strips vbscript: in href (alert #7: incomplete URL scheme check)", () => {
    const result = sanitizeHtml('<a href="vbscript:msgbox(1)">click</a>');
    assert.equal(result.includes("vbscript:"), false);
  });

  test("strips javascript: with leading whitespace/control chars", () => {
    // \x00 null byte trick — stripped before scheme comparison.
    const result = sanitizeHtml('<a href=" javascript:alert(1)">x</a>');
    assert.equal(result.includes("javascript:"), false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeHtml — ReDoS safety (alert #4)
// ---------------------------------------------------------------------------

describe("sanitizeHtml — ReDoS safety", () => {
  test("completes in linear time on pathological <script-repetition input", () => {
    // Backtracking regex on this input would hang (>10s). Linear sanitizer must finish fast.
    const repeated = "<script>".repeat(5_000);
    const start = Date.now();
    sanitizeHtml(repeated);
    const elapsed = Date.now() - start;
    assert.ok(
      elapsed < 2_000,
      `sanitizeHtml took ${elapsed}ms — possible ReDoS`,
    );
  });

  test("completes in linear time on > repetition pathological input", () => {
    // Targets the second ReDoS pattern noted in alert #4.
    const repeated = "<p>" + ">".repeat(10_000);
    const start = Date.now();
    sanitizeHtml(repeated);
    const elapsed = Date.now() - start;
    assert.ok(
      elapsed < 2_000,
      `sanitizeHtml took ${elapsed}ms — possible ReDoS`,
    );
  });
});

// ---------------------------------------------------------------------------
// sanitizeHtml — incomplete multi-char sanitization (alert #3)
// ---------------------------------------------------------------------------

describe("sanitizeHtml — multi-char bypass resistance", () => {
  test("does not allow nested-script bypass like <scr<script>ipt>", () => {
    // Classic single-pass regex trick: after stripping the inner <script></script>,
    // the remaining string reconstructs `<script>evil()</script>`. The sanitizer
    // loops until stable to catch this.
    const result = sanitizeHtml("<scr<script></script>ipt>evil()</script>");
    // The result must not contain any executable script block.
    assert.equal(result.includes("evil()"), false);
    assert.equal(result.includes("<script"), false);
  });
});

// ---------------------------------------------------------------------------
// widgetOptionsToHtmlContent
// ---------------------------------------------------------------------------

describe("widgetOptionsToHtmlContent", () => {
  test("reads options.html and sanitizes it", () => {
    const result = widgetOptionsToHtmlContent({
      html: '<p onclick="evil()">safe</p><script>alert(1)</script>',
    });
    assert.equal(result.includes("<script"), false);
    assert.equal(result.includes("onclick"), false);
    assert.ok(result.includes("safe"));
  });

  test("returns empty string when options.html is missing", () => {
    const result = widgetOptionsToHtmlContent({});
    assert.equal(result, "");
  });

  test("uses custom sanitizer when provided", () => {
    const result = widgetOptionsToHtmlContent(
      { html: "<b>ignored</b>" },
      () => "CUSTOM",
    );
    assert.equal(result, "CUSTOM");
  });
});

// ---------------------------------------------------------------------------
// widgetOptionsToTextContent
// ---------------------------------------------------------------------------

describe("widgetOptionsToTextContent", () => {
  test("wraps options.text in a <p> tag with class ddash-text-primary", () => {
    const result = widgetOptionsToTextContent({ text: "Hello Dashboard" });
    assert.ok(result.includes("ddash-text-primary"));
    assert.ok(result.includes("Hello Dashboard"));
  });

  test("wraps options.subtext in a <p> tag with class ddash-text-subtext", () => {
    const result = widgetOptionsToTextContent({
      text: "Title",
      subtext: "Sub",
    });
    assert.ok(result.includes("ddash-text-subtext"));
    assert.ok(result.includes("Sub"));
  });

  test("returns styled empty container when both text and subtext are missing", () => {
    const result = widgetOptionsToTextContent({});
    assert.ok(result.includes("padding: 16px"));
    assert.ok(result.includes("justify-content: center"));
    assert.ok(result.includes("</div>"));
  });

  test("HTML-encodes < > & \" ' in text to prevent injection", () => {
    const result = widgetOptionsToTextContent({
      text: '<script>alert("xss")</script>',
    });
    assert.equal(result.includes("<script>"), false);
    assert.ok(result.includes("&lt;script&gt;"));
  });

  test("HTML-encodes special characters in subtext", () => {
    const result = widgetOptionsToTextContent({ subtext: "A & B <em>" });
    assert.ok(result.includes("A &amp; B &lt;em&gt;"));
  });
});

// ---------------------------------------------------------------------------
// createHtmlAdapters
// ---------------------------------------------------------------------------

describe("createHtmlAdapters", () => {
  test("returns two adapters: html and text", () => {
    const adapters = createHtmlAdapters();
    assert.equal(adapters.length, 2);
    assert.deepEqual(
      adapters.map((a) => a.type),
      ["html", "text"],
    );
  });

  test("each adapter declares supportsHtmlWidget and supportsTextWidget", () => {
    const adapters = createHtmlAdapters();
    for (const adapter of adapters) {
      assert.equal(adapter.capabilities?.supportsHtmlWidget, true);
      assert.equal(adapter.capabilities?.supportsTextWidget, true);
    }
  });

  test("html adapter render sanitizes and sets innerHTML", () => {
    const adapters = createHtmlAdapters();
    const html = adapters.find((a) => a.type === "html");
    const target = makeTarget();

    html.render(
      {
        kind: "html",
        frames: [],
        options: {
          html: '<p onclick="evil()">ok</p><script>alert(1)</script>',
        },
        context: makeContext(),
      },
      target,
    );

    assert.equal(target.el.innerHTML.includes("<script"), false);
    assert.equal(target.el.innerHTML.includes("onclick"), false);
    assert.ok(target.el.innerHTML.includes("ok"));
  });

  test("html adapter uses custom sanitizer when provided", () => {
    const adapters = createHtmlAdapters({ sanitizeHtml: () => "CUSTOM" });
    const html = adapters.find((a) => a.type === "html");
    const target = makeTarget();

    html.render(
      {
        kind: "html",
        frames: [],
        options: { html: "<div>ignored</div>" },
        context: makeContext(),
      },
      target,
    );

    assert.ok(target.el.innerHTML.includes("CUSTOM"));
    assert.ok(target.el.innerHTML.includes("padding: 12px"));
  });

  test("text adapter render writes escaped text as HTML", () => {
    const adapters = createHtmlAdapters();
    const text = adapters.find((a) => a.type === "text");
    const target = makeTarget();

    text.render(
      {
        kind: "text",
        frames: [],
        options: { text: "System Status" },
        context: makeContext(),
      },
      target,
    );

    assert.ok(target.el.innerHTML.includes("System Status"));
    assert.ok(target.el.innerHTML.includes("ddash-text-primary"));
  });

  test("text adapter HTML-encodes user-supplied text (no XSS)", () => {
    const adapters = createHtmlAdapters();
    const text = adapters.find((a) => a.type === "text");
    const target = makeTarget();

    text.render(
      {
        kind: "text",
        frames: [],
        options: { text: '<img src=x onerror="alert(1)">' },
        context: makeContext(),
      },
      target,
    );

    // The tag brackets must be entity-encoded so no HTML element is injected.
    assert.ok(
      target.el.innerHTML.includes("&lt;img"),
      "expected entity-encoded &lt;img in output",
    );
    // The raw angle bracket must NOT appear (would indicate un-encoded injection).
    assert.equal(
      target.el.innerHTML.includes("<img"),
      false,
      "unexpected raw <img> element in output",
    );
  });

  test("html adapter destroy clears innerHTML", () => {
    const adapters = createHtmlAdapters();
    const html = adapters.find((a) => a.type === "html");
    const target = makeTarget();
    target.el.innerHTML = "<p>something</p>";

    html.destroy(target);

    assert.equal(target.el.innerHTML, "");
  });

  test("text adapter destroy clears innerHTML", () => {
    const adapters = createHtmlAdapters();
    const text = adapters.find((a) => a.type === "text");
    const target = makeTarget();
    target.el.innerHTML = "<p>something</p>";

    text.destroy(target);

    assert.equal(target.el.innerHTML, "");
  });
});
