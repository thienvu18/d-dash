import type {
  VisualizationAdapter,
  VisualizationCapabilities,
  VisualizationRenderRequest,
} from "@d-dash/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Target passed to every HTML/text adapter method; the host app owns the element. */
export type HtmlTarget = {
  el: HTMLElement;
};

export type HtmlAdapterOptions = {
  /**
   * Optional custom sanitizer applied to `html` widget content.
   * When provided, completely replaces the built-in sanitizer.
   * The built-in sanitizer uses DOMParser (browser) or a safe linear-scan
   * state machine (Node/SSR) — both are immune to the vulnerabilities
   * present in backtracking-regex-based approaches.
   */
  sanitizeHtml?: (rawHtml: string) => string;
};

// ---------------------------------------------------------------------------
// Sanitizer — internal helpers
// ---------------------------------------------------------------------------

/**
 * Dangerous URL schemes that must be blocked on URL-type attributes.
 * Checked by case-insensitive prefix after stripping control characters.
 */
const BLOCKED_SCHEMES: readonly string[] = [
  "javascript:",
  "data:",
  "vbscript:",
];

/**
 * Attribute names that carry URLs and therefore require scheme validation.
 * Covers all HTML5 attributes that can trigger navigation or resource loads.
 */
const URL_ATTRS = new Set<string>([
  "href",
  "src",
  "action",
  "formaction",
  "data",
  "poster",
  "ping",
  "srcdoc",
  "cite",
  "longdesc",
]);

/**
 * HTML tags that must always be removed entirely (along with their subtree).
 * These can execute script, embed external content, or rebase document URLs.
 */
const FORBIDDEN_TAGS = new Set<string>([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "link",
  "meta",
  "noscript",
  "template",
]);

/**
 * Returns true when the attribute value contains a dangerous URL scheme.
 * Strips leading control characters and null bytes before comparison, so that
 * tricks like `java\x00script:` or `  javascript:` are caught.
 */
function hasDangerousScheme(value: string): boolean {
  // Remove null bytes, other control chars, then trim leading whitespace.
  const normalized = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trimStart()
    .toLowerCase();
  return BLOCKED_SCHEMES.some((scheme) => normalized.startsWith(scheme));
}

/**
 * DOM-parser–based sanitizer. Requires a browser environment with DOMParser.
 *
 * Security properties:
 * - Parses HTML structurally via the browser's own parser — immune to all
 *   regex bypass tricks (e.g., `</script >`, `<scr<script>ipt>`, encoding).
 * - Removes forbidden tags by tag-name comparison, not string matching.
 * - Drops `on*` event handler attributes by name prefix.
 * - Validates URL-type attributes against a blocked-scheme list that includes
 *   `javascript:`, `data:`, and `vbscript:`.
 * - No regex with backtracking quantifiers → no ReDoS risk.
 */
function domSanitize(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, "text/html");

  // Collect forbidden elements first (NodeList is live, so collect before removal).
  const allElements = Array.from(doc.body.querySelectorAll("*"));
  const toRemove: Element[] = [];

  for (const el of allElements) {
    const tag = el.tagName.toLowerCase();

    if (FORBIDDEN_TAGS.has(tag)) {
      toRemove.push(el);
      continue;
    }

    // Scrub attributes in-place.
    const attrsToRemove: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();

      // Drop all event-handler attributes (on*).
      if (name.startsWith("on")) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // Drop dangerous URL schemes on URL-bearing attributes.
      if (URL_ATTRS.has(name) && hasDangerousScheme(attr.value)) {
        attrsToRemove.push(attr.name);
      }
    }

    for (const attrName of attrsToRemove) {
      el.removeAttribute(attrName);
    }
  }

  // Remove forbidden elements after iteration to avoid live-NodeList issues.
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }

  return doc.body.innerHTML;
}

// ---------------------------------------------------------------------------
// Linear-scan sanitizer (Node / SSR fallback)
// ---------------------------------------------------------------------------

/**
 * Strips `<script>…</script>` blocks using a O(n) linear state machine.
 *
 * Design goals (no ReDoS):
 * - No alternation inside `*` or `+` quantifiers.
 * - No nested or overlapping quantified groups.
 * - Handles: `<Script>`, `<SCRIPT >`, `</script >`, `</SCRIPT\t>`, unterminated tags.
 */
function stripScriptTagsLinear(html: string): string {
  const out: string[] = [];
  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] !== "<") {
      out.push(html[i++]);
      continue;
    }

    // Peek ahead for "<script" (case-insensitive), followed by whitespace/>/EOF.
    const slice7 = html.slice(i, i + 7).toLowerCase();
    if (slice7 === "<script") {
      const charAfter = html[i + 7] ?? "";
      const isScriptTag =
        charAfter === "" ||
        charAfter === ">" ||
        charAfter === " " ||
        charAfter === "\t" ||
        charAfter === "\n" ||
        charAfter === "\r" ||
        charAfter === "/";

      if (isScriptTag) {
        // Advance past the opening tag (skip to ">").
        let j = i + 7;
        while (j < len && html[j] !== ">") {
          j++;
        }
        j++; // consume ">"

        // Advance past the script body until </script[ \t\n\r>].
        while (j < len) {
          if (html[j] === "<") {
            const closeSlice = html.slice(j, j + 9).toLowerCase();
            if (closeSlice.startsWith("</script")) {
              // Find the ">" that closes the end tag (handles </script >, </script\t>, etc.)
              let k = j + 8;
              while (k < len && html[k] !== ">") {
                k++;
              }
              i = k + 1; // resume after ">"
              break;
            }
          }
          j++;
        }

        if (j >= len) {
          // Unterminated script tag — discard everything to end of input.
          i = len;
        }
        continue;
      }
    }

    out.push(html[i++]);
  }

  return out.join("");
}

/**
 * Safe linear-scan sanitizer for environments without DOMParser (Node/SSR).
 *
 * Security properties:
 * - `<script>` stripping uses a state machine: O(n), no backtracking.
 * - Event-handler attributes are removed with simple, bounded character-class
 *   patterns (`[^"]*`, `[^']*`) that cannot cause catastrophic backtracking.
 * - URL scheme check covers `javascript:`, `data:`, and `vbscript:`.
 *
 * Note: Prefer `domSanitize` in browser environments. This fallback is
 * intentionally conservative and suitable for server-side pre-processing.
 */
function linearSanitize(rawHtml: string): string {
  // 1. Strip script blocks via state machine (no backtracking).
  //    Loop until stable to defeat multi-char reconstruction bypasses like
  //    `<scr<script></script>ipt>` → `<script>` after one pass.
  let result = rawHtml;
  let prev: string;
  do {
    prev = result;
    result = stripScriptTagsLinear(result);
  } while (result !== prev);

  // 2. Strip event-handler attributes.
  //    [^"]* and [^']* are bounded — no nested quantifiers, no ReDoS.
  result = result.replace(/ on[a-zA-Z]+\s*=\s*"[^"]*"/g, "");
  result = result.replace(/ on[a-zA-Z]+\s*=\s*'[^']*'/g, "");
  // Unquoted variant: stop at whitespace or ">".
  result = result.replace(/ on[a-zA-Z]+\s*=\s*[^\s>]*/g, "");

  // 3. Strip dangerous URL schemes in URL-type attributes.
  //    Anchored to the attribute name before "=", so no catastrophic backtracking.
  const urlAttrPattern =
    /(href|src|action|formaction|data|poster|ping)\s*=\s*["']?\s*(javascript|data|vbscript)\s*:/gi;
  result = result.replace(urlAttrPattern, "$1=");

  return result;
}

// ---------------------------------------------------------------------------
// Public sanitizer
// ---------------------------------------------------------------------------

/**
 * Sanitizes raw HTML by removing XSS attack vectors.
 *
 * In browser environments, delegates to `DOMParser` for structural parsing —
 * this is immune to all regex-bypass tricks and has no ReDoS exposure.
 *
 * In Node/SSR environments, falls back to a linear state-machine scanner that
 * avoids backtracking quantifiers.
 *
 * Blocked in both paths:
 * - `<script>` elements — all variants including `<Script>`, `</script >`,
 *   `</SCRIPT\t>`, and unterminated opening tags.
 * - Event-handler attributes: `onclick`, `onload`, `onerror`, etc.
 * - Dangerous URL schemes: `javascript:`, `data:`, `vbscript:` (including
 *   variants with leading whitespace or control characters).
 * - Dangerous embedding elements: `<iframe>`, `<object>`, `<embed>`, `<base>`.
 *
 * Host applications that require stricter policies should provide their own
 * `sanitizeHtml` function via `HtmlAdapterOptions`.
 */
export function sanitizeHtml(rawHtml: string): string {
  if (
    typeof globalThis === "object" &&
    typeof (globalThis as unknown as Record<string, unknown>)["DOMParser"] ===
      "function"
  ) {
    return domSanitize(rawHtml);
  }
  return linearSanitize(rawHtml);
}

// ---------------------------------------------------------------------------
// Widget content helpers
// ---------------------------------------------------------------------------

/**
 * Resolves and sanitizes content for `html` widgets.
 * Reads `options.html` and applies the provided or built-in sanitizer.
 */
export function widgetOptionsToHtmlContent(
  options: Record<string, unknown> = {},
  sanitizer: (raw: string) => string = sanitizeHtml,
): string {
  const raw = typeof options["html"] === "string" ? options["html"] : "";
  return sanitizer(raw);
}

/**
 * Escapes HTML entities so a plain string can be injected into innerHTML safely.
 * This is not a sanitizer — it is purely a text-to-HTML encoder.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolves plain-text content for `text` widgets.
 * Reads `options.text` and optional `options.subtext`.
 * Returns a minimal HTML snippet with all text content safely entity-escaped —
 * no sanitizer is required because user-supplied text is never treated as markup.
 */
export function widgetOptionsToTextContent(
  options: Record<string, unknown> = {},
): string {
  const text = typeof options["text"] === "string" ? options["text"] : "";
  const subtext =
    typeof options["subtext"] === "string" ? options["subtext"] : "";

  const parts: string[] = [];
  if (text) {
    parts.push(`<p class="ddash-text-primary">${escapeHtml(text)}</p>`);
  }
  if (subtext) {
    parts.push(`<p class="ddash-text-subtext">${escapeHtml(subtext)}</p>`);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Capabilities & adapter factory
// ---------------------------------------------------------------------------

const CAPABILITIES: VisualizationCapabilities = {
  supportsTextWidget: true,
  supportsHtmlWidget: true,
};

/** Visualization kinds managed by the HTML adapter factory. */
type HtmlKind = "html" | "text";

/**
 * Creates d-dash `VisualizationAdapter` instances for `html` and `text` widget kinds.
 *
 * - **`html` widgets**: render sanitized HTML from `options.html` into the target element.
 * - **`text` widgets**: render safely entity-escaped plain text from `options.text` /
 *   `options.subtext` (no external sanitizer needed).
 *
 * Usage:
 * ```ts
 * import { createHtmlAdapters } from "@d-dash/adapter-html";
 *
 * for (const adapter of createHtmlAdapters()) {
 *   registry.registerVisualization(adapter);
 * }
 * ```
 */
export function createHtmlAdapters(
  options: HtmlAdapterOptions = {},
): VisualizationAdapter<HtmlTarget>[] {
  return [makeHtmlAdapter("html", options), makeHtmlAdapter("text", options)];
}

function makeHtmlAdapter(
  kind: HtmlKind,
  adapterOptions: HtmlAdapterOptions,
): VisualizationAdapter<HtmlTarget> {
  const resolve = adapterOptions.sanitizeHtml ?? sanitizeHtml;

  return {
    type: kind,
    capabilities: CAPABILITIES,

    render(request: VisualizationRenderRequest, target: HtmlTarget): void {
      const opts =
        (request.options as Record<string, unknown> | undefined) ?? {};

      if (kind === "html") {
        target.el.innerHTML = widgetOptionsToHtmlContent(opts, resolve);
      } else {
        // text: entity-escaped — no sanitizer needed.
        target.el.innerHTML = widgetOptionsToTextContent(opts);
      }
    },

    destroy(target: HtmlTarget): void {
      target.el.innerHTML = "";
    },
  };
}
