# @d-dash/adapter-html

Secure `html` and `text` visualization adapters for [d-dash](https://github.com/thienvu18/d-dash).

## Overview

This package provides two visualization adapter kinds:

| Kind   | Source option  | Rendering                                                 |
|--------|---------------|-----------------------------------------------------------|
| `html` | `options.html` | Sanitized HTML injected into the target element           |
| `text` | `options.text` / `options.subtext` | Entity-escaped plain text wrapped in `<p>` elements |

## Installation

```sh
npm install @d-dash/adapter-html @d-dash/core
```

## Usage

```ts
import { createHtmlAdapters } from "@d-dash/adapter-html";

for (const adapter of createHtmlAdapters()) {
  registry.registerVisualization(adapter);
}
```

### Custom sanitizer

```ts
import DOMPurify from "dompurify";
import { createHtmlAdapters } from "@d-dash/adapter-html";

const adapters = createHtmlAdapters({
  sanitizeHtml: (raw) => DOMPurify.sanitize(raw),
});
```

## Security

The built-in sanitizer (`sanitizeHtml`) addresses the following threat classes:

| Threat | Mitigation |
|--------|-----------|
| `<script>` injection | Removed structurally (DOMParser tag walk in browser; state-machine scanner in Node) |
| `</script >` bypass (trailing space) | Handled by state-machine linear scan — no regex end-tag matching |
| `<scr<script>ipt>` multi-char bypass | DOMParser structural parse is immune; linear fallback rescans correctly |
| `javascript:` in `href`/`src` | Blocked by scheme allowlist check |
| `data:` in `src` | Blocked — covers image/document injection vectors |
| `vbscript:` in `href` | Blocked — legacy IE attack vector |
| `onclick`, `onerror`, `on*` handlers | Removed by attribute-name prefix check |
| ReDoS via backtracking regex | Eliminated — browser path uses structural DOM walk; Node path uses O(n) state machine |

> **Recommendation**: For production environments, consider providing your own
> battle-tested sanitizer (e.g. [DOMPurify](https://github.com/cure53/DOMPurify))
> via the `sanitizeHtml` option.

## API

### `createHtmlAdapters(options?)`

Returns `VisualizationAdapter[]` for `"html"` and `"text"` kinds.

```ts
type HtmlAdapterOptions = {
  sanitizeHtml?: (rawHtml: string) => string;
};
```

### `sanitizeHtml(rawHtml: string): string`

The built-in sanitizer. Uses `DOMParser` in browsers, linear state-machine in Node/SSR.

### `widgetOptionsToHtmlContent(options, sanitizer?): string`

Reads `options.html`, applies the sanitizer, and returns the result.

### `widgetOptionsToTextContent(options): string`

Reads `options.text` and `options.subtext`, entity-escapes both, and returns an HTML snippet.

## License

LGPL-3.0-or-later
