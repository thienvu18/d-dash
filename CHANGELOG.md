# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- New `@d-dash/adapter-html` package for secure HTML and text widgets.
- New `@d-dash/builder` package for a fluent, type-safe dashboard construction SDK.
- Support for `gauge`, `bar`, `pie`, and `heatmap` in ECharts adapter.
- Gridstack layout change event bridge to host callbacks.
- REST and VictoriaMetrics `getMetrics()` metadata discovery.
- Root release scripts and validation utilities.
- TypeDoc configuration for API documentation generation.

### Changed

- **BREAKING**: Removed `stat`, `text`, and `html` kinds from `@d-dash/adapter-echarts`.
- **BREAKING**: `html` and `text` widget support moved to dedicated `@d-dash/adapter-html` package.
- **BREAKING**: Removed `sanitizeHtml` option from ECharts adapter (now handled by HTML adapter).
- Improved HTML security with a `DOMParser`-based sanitizer (browser) and linear state-machine fallback (Node).
