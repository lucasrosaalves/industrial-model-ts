# industrial-model

## 0.9.0

### Minor Changes

- 2d06958: Add the `industrial-model generate` CLI for generating typed data model clients from Cognite Data Fusion.

  The generator supports interactive authentication, data model and version selection, reusable core view loading, and emits `types.ts`, `client.ts`, and `index.ts` files. Generated clients now follow the same class-based shape as the built-in Cognite Core client while also exposing per-view shortcuts for query, aggregate, upsert, and delete operations.

## 0.8.0

### Minor Changes

- c739ee4: add support for datapoints and files in IndustrialModelClient

## 0.7.0

### Minor Changes

- cd7e67f: add upsert and delete functionality to IndustrialModelClient

## 0.6.0

### Minor Changes

- c50512d: introduce Cognite Core client and enhance SDK structure

## 0.5.0

### Minor Changes

- 3d73e09: Add text search filters to the SDK

## 0.4.0

### Minor Changes

- 92513fc: Add `aggregate()` with typed `groupBy`, `filters`, and one of `avg` / `min` / `max` / `sum` / `count` per call, following the same patterns as `query()`.

## 0.3.0

### Minor Changes

- 1264fff: adding zod as data validator

## 0.2.0

### Minor Changes

- adding new type return
