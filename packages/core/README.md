# @d-dash/core

Headless runtime contracts and orchestration for d-dash.

## What this package provides

- Persisted dashboard schema contracts
- Runtime-resolved execution contracts
- Adapter interfaces (datasource, visualization, grid)
- Registry and validation APIs
- Dashboard runtime orchestration APIs

## Install

```bash
npm install @d-dash/core
```

## Usage

```ts
import { createAdapterRegistry, createDashboardRuntime } from "@d-dash/core";

const registry = createAdapterRegistry();
const runtime = createDashboardRuntime({ registry });

const session = runtime.createSession(dashboard);

// Register render targets for all widgets up front.
runtime.registerWidgetTargets({ w1: targetForW1, w2: targetForW2 });

// Apply layout, execute all widgets, and bind resize in one call.
const { widgetResults, unmount } = await runtime.mountDashboard({
  session,
  gridId: "gridstack",
  gridTarget,
  context: { traceId: "my-trace" },
});

// call unmount() on teardown
```

For fine-grained control over the sequence:

```ts
// 1. Register render targets.
runtime.registerWidgetTargets({ w1: targetForW1, w2: targetForW2 });

// 2. Apply the grid layout (stores the grid entry internally).
await runtime.applyDashboardLayout({ session, gridId: "gridstack", target: gridTarget });

// 3. Execute all widgets (targets resolved from the internal map).
await runtime.executeAllWidgets({ session, context });

// 4. Subscribe grid layout changes to visualization resize.
const unbind = await runtime.bindLayoutResize(session);

// call unbind() on teardown
```

See root documentation for full integration details.
