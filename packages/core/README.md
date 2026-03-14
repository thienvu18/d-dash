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

const validation = runtime.validateDashboard(dashboard);
if (!validation.ok) {
	throw new Error("Invalid dashboard");
}

const session = runtime.createSession(dashboard);
```

See root documentation for full integration details.
