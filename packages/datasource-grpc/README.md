# @d-dash/datasource-grpc

gRPC-backed `DatasourceAdapter` for d-dash.

## Usage

```ts
import { createGrpcDatasourceAdapter } from "@d-dash/datasource-grpc";

const adapter = createGrpcDatasourceAdapter({
  id: "grpc",
  client: {
    async query(request, context) {
      // Map request to protobuf call, then map response envelope.
      return { status: "success", frames: [] };
    },
  },
});

registry.registerDatasource(adapter);
```

## Client contract

Your injected `client` handles transport specifics and returns a normalized envelope:

- `query(request, context)` is required
- `getMetrics()` is optional and enables metadata discovery
- `searchMetrics(query, limit, offset)` is optional and enables paginated metric search

The adapter normalizes frame payloads to d-dash `DataFrame[]` and maps gRPC
transport and response failures into structured datasource errors.

## Metric search

When `searchMetrics` is provided on the client, the adapter sets `supportsMetricSearch: true`.
The client should return `{ metrics: [...], total: number }` where `metrics` can be strings
or objects with `id`, `name`, `unit`, and `supportedVisualizations` properties.
