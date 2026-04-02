## d-dash vs Perses: Detailed Comparison

### 1. Core Architecture & Philosophy

| Aspect                | d-dash                                                                 | Perses                                                                                   | Same/Different | Stronger/Weaker | Notes/Learnings                                                                                 |
|-----------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------|----------------|-----------------|-----------------------------------------------------------------------------------------------|
| Core runtime          | Headless, framework-agnostic, contract-first, pluggable adapters       | API-driven, project-based, plugin-oriented                                               | Similar        | -               | Both are modular and plugin-friendly.                                                          |
| Persisted schema      | JSON, versioned, portable, separated from runtime                      | YAML/JSON, versioned, open specification                                                 | Similar        | -               | Both focus on portability and versioning.                                                      |
| Extensibility         | Adapters for datasources, visualizations, grid; registry system        | Plugin system for panels, queries, datasources                                           | Similar        | -               | Both allow custom plugins/adapters.                                                            |
| UI framework          | No hard dependency, embeddable in any host app                         | Web UI provided, but API is backend-agnostic                                             | d-dash: more embeddable | d-dash stronger | d-dash is easier to embed in custom UIs.                                                       |
| Project concept       | No explicit "project" concept in core                                  | Dashboards belong to projects                                                            | Different      | Perses: stronger for multi-tenancy | Project scoping in Perses is useful for multi-tenant or large orgs.                            |

---

### 2. Schema & API

| Aspect                | d-dash                                                                 | Perses                                                                                   | Same/Different | Stronger/Weaker | Notes/Learnings                                                                                 |
|-----------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------|----------------|-----------------|-----------------------------------------------------------------------------------------------|
| Dashboard schema      | schemaVersion, dashboardId, meta, timeRange, layout, widgets           | kind, metadata (name, project), spec (display, datasources, variables, panels, layouts)  | Similar        | -               | Both are explicit and versioned.                                                               |
| Widget/Panel concept  | Widget: id, layoutId, datasource, query, visualization, options        | Panel: key, spec (display, plugin, queries)                                              | Similar        | -               | Perses separates panel definition from layout; d-dash links widget to layoutId.                |
| Layout                | Array of layout items, grid adapter                                   | Layouts as separate objects, grid spec, items with x/y/w/h                               | Similar        | -               | Both support grid layouts; Perses is more explicit about separating layout from panel.          |
| Variables             | Not deeply described in d-dash docs                                   | First-class, with variable spec and plugin support                                       | Perses: stronger | Perses stronger | Variable system in Perses is more mature and flexible.                                         |
| Datasource            | Adapter interface, registry, pluggable                                | Map of datasources, plugin-based, referenced by panels/variables                         | Similar        | -               | Both support pluggable datasources.                                                            |
| API endpoints         | No REST API described (library/runtime focus)                         | Full REST API: CRUD for dashboards, projects, etc.                                       | Perses: stronger | Perses stronger | Perses is a full backend with REST API; d-dash is a runtime/engine.                            |

---

### 3. Plugin/Adapter Model

| Aspect                | d-dash                                                                 | Perses                                                                                   | Same/Different | Stronger/Weaker | Notes/Learnings                                                                                 |
|-----------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------|----------------|-----------------|-----------------------------------------------------------------------------------------------|
| Plugin types          | Datasource, visualization, grid adapters                               | Panel, query, datasource plugins                                                         | Similar        | -               | Both have clear plugin types.                                                                  |
| Capability model      | Adapters declare capabilities (streaming, theming, etc.)               | Plugins have kind/spec, but capability model less explicit                               | d-dash: stronger | d-dash stronger | d-dash's explicit capability model is a strength.                                              |
| Registration          | Registry system, explicit registration required                        | Plugins discovered/configured via API/spec                                               | Different      | -               | d-dash is more explicit; Perses is more declarative.                                           |
| Security              | Explicit security rules for plugins/adapters                           | Not detailed in API docs                                                                 | d-dash: stronger | d-dash stronger | d-dash has more explicit plugin security guidance.                                             |

---

### 4. Runtime & Execution

| Aspect                | d-dash                                                                 | Perses                                                                                   | Same/Different | Stronger/Weaker | Notes/Learnings                                                                                 |
|-----------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------|----------------|-----------------|-----------------------------------------------------------------------------------------------|
| Execution flow        | Load JSON, validate, resolve, execute widgets, render via adapters     | API-driven, UI fetches dashboard spec, renders via plugins                               | Similar        | -               | Both have clear execution flows.                                                               |
| Error handling        | Structured error model, validation, adapter errors                     | Not detailed in API docs                                                                 | d-dash: stronger | d-dash stronger | d-dash's error handling is more explicit.                                                      |
| Migration strategy    | Schema versioning, explicit migration paths                            | Not detailed in API docs                                                                 | d-dash: stronger | d-dash stronger | d-dash's migration policy is a strength.                                                       |

---

### 5. Documentation & Developer Experience

| Aspect                | d-dash                                                                 | Perses                                                                                   | Same/Different | Stronger/Weaker | Notes/Learnings                                                                                 |
|-----------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------|----------------|-----------------|-----------------------------------------------------------------------------------------------|
| Docs structure        | Architecture, contracts, schema, usage, plugin dev, code rules         | API reference, concepts, plugin docs, user/developer guides                              | Similar        | -               | Both have good docs; Perses has more user-facing guides.                                       |
| API docs              | TypeDoc/JSDoc, code-level                                              | REST API, YAML/JSON schema, plugin SDKs                                                  | Different      | -               | Perses is more API/backend focused; d-dash is more library/runtime focused.                    |
| Example dashboards    | Code and JSON examples in repo                                         | YAML/JSON examples in docs                                                               | Similar        | -               | Both provide examples.                                                                         |

---

### 6. Unique Strengths & Weaknesses

| d-dash Unique Strengths                | Perses Unique Strengths                | d-dash Weaknesses                | Perses Weaknesses                |
|----------------------------------------|----------------------------------------|----------------------------------|----------------------------------|
| - Headless, embeddable runtime         | - Full REST API, project scoping       | - No built-in REST API           | - Less explicit plugin capability model |
| - Explicit capability model            | - Mature variable system               | - Variable system less mature    | - Less explicit error/migration policy  |
| - Strong migration/versioning policy   | - User-facing web UI                   | - No built-in UI                 | - Plugin security less explicit         |
| - Security and contract discipline     | - Dashboard-as-Code (CUE/Go SDK)       |                                  |                                  |

---

### 7. What d-dash Can Learn from Perses

- **Variable System**: Perses' variable system is more flexible and first-class. Consider making variables a more central, pluggable concept.
- **Project Scoping**: Project-level dashboard grouping is useful for multi-tenancy and large orgs.
- **REST API**: Providing a REST API for dashboard CRUD would make d-dash more backend-friendly.
- **Dashboard-as-Code SDKs**: Perses offers CUE/Go SDKs for dashboard-as-code. Consider similar SDKs for advanced users.
- **User-Facing UI**: Perses provides a ready-to-use UI. d-dash could offer a reference UI or starter kit.

---

## Summary Table

| Feature/Aspect         | d-dash                                      | Perses                                      | Notes/Comparison                                 |
|-----------------------|----------------------------------------------|----------------------------------------------|--------------------------------------------------|
| Core runtime          | Headless, embeddable, contract-first         | API-driven, plugin-based, project-scoped     | d-dash is more embeddable                        |
| Schema                | JSON, versioned, portable                    | YAML/JSON, versioned, open spec              | Both are portable and versioned                   |
| Plugin/Adapter model  | Explicit, capability-declared                | Plugin system, less explicit capabilities    | d-dash's capability model is a strength           |
| Variable system       | Basic, not first-class                       | Mature, first-class, pluggable               | Perses stronger                                  |
| Datasource            | Pluggable adapters                           | Plugin-based, referenced in panels/variables | Both are flexible                                |
| Layout/Grid           | Grid adapter, layout array                   | Grid spec, layout separate from panels       | Perses more explicit separation                   |
| REST API              | No built-in API                              | Full CRUD REST API                           | Perses stronger                                  |
| Migration/versioning  | Explicit, tested, semver                     | Not detailed                                 | d-dash stronger                                  |
| Security              | Explicit plugin security rules               | Not detailed                                 | d-dash stronger                                  |
| UI                    | No built-in UI, embeddable                   | Web UI provided                              | Perses stronger                                  |
| Dashboard-as-Code     | JSON, code examples                          | YAML/JSON, CUE/Go SDKs                       | Perses offers more SDKs                           |

---

**In summary:**  
- d-dash is a headless, embeddable dashboard engine with strong contracts, migration, and security discipline, ideal for custom integrations and advanced embedding.
- Perses is a full-featured dashboard platform with REST API, project scoping, a mature variable system, and user-facing UI, ideal for teams needing a ready-to-use solution.

**What to learn:**  
- Consider improving variable support, adding project scoping, and providing a REST API and/or reference UI.  
- Perses' dashboard-as-code SDKs and user-facing guides are also valuable for adoption.