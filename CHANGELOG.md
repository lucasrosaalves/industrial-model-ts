# industrial-model

## 0.17.0

### Minor Changes

- df36e4d: Cognite Instances parity: list direct-relation and list primitive `groupBy`, multiple aggregates in one call. The singular `aggregate` option and `item.aggregate` result remain as aliases; prefer `aggregates`. Optional numeric properties are valid `avg`/`sum`/`min`/`max` keys.

  Cognite Core types are generated from the Core fixture so enums and relations stay in sync with the model. Inward list reverse relations that Cognite cannot traverse are omitted.

## 0.16.0

### Minor Changes

- 758d3ae: Add a `CachePort` interface and `createCacheResolver` for memoizing data model schema loads beyond a client instance's lifetime. `IndustrialModelClient` accepts new `cache` and `cacheTtlMs` options; `createMemoryCacheAdapter` and `createWebStorageCacheAdapter` (for `localStorage`/`sessionStorage`) are shipped as built-in adapters, and any other store (a file, IndexedDB, a KV service) can implement the same three-method interface.

## 0.15.0

### Minor Changes

- 4c228a6: Add `inputs` to `CalculationResult` with the aligned series the formula evaluated, keyed by parameter alias.

## 0.14.0

### Minor Changes

- 2c9d0f9: Extend the calculator with constants, multi-series reducers, and timestamp alignment.

  **BREAKING:** every `CalculatorParameter` now requires a `type` tag (`"constant"`, `"single_timeseries"`, or `"multi_timeseries"`), matching the Python package's JSON contract. Existing `{ timeSeries, alias }` callers must become `{ type: "single_timeseries", timeSeries, alias }`.

  The result's time axis is now the intersection of **all** time-series parameters in the query (or an exact match under `alignment: "strict"`), not the first parameter the formula happens to reference. Constants are broadcast onto that axis and never fetched from Cognite. A `MultiTimeSeriesParameter` combines two or more series with `min`/`max`/`sum`/`average` by intersecting on timestamp.

## 0.13.1

### Patch Changes

- 87d571c: Simplify `nullsFirst` in `SortMapper` to depend only on sort direction (`true` for descending, `false` for ascending), removing the special case that flipped it for direct-relation properties. Direct-relation sorts now behave the same as scalar sorts: ascending sorts nulls last, descending sorts nulls first.

## 0.13.0

### Minor Changes

- c64b487: Map Cognite `timestamp` and `date` view properties to TypeScript `Date` (generator + Cognite Core types), and always coerce those fields to `Date` on query results. Upsert and filters continue to serialize `Date` values to ISO strings for Cognite.

## 0.12.2

### Patch Changes

- aa48d9c: Fix `upsert`/`delete` calling a nonexistent `client.instances.apply` method on the Cognite SDK, which made every upsert and delete call throw at runtime. The adapter now calls the real `client.instances.upsert` and `client.instances.delete` methods (there is no combined upsert+delete endpoint in the SDK), splitting and merging requests as needed.

## 0.12.1

### Patch Changes

- 7d34e77: Paginate calculator datapoint retrieval in chunks of 100 time series. Cognite's datapoints retrieve endpoint rejects requests with more than 100 items, so calculators referencing over 100 distinct series (or series/granularity combinations) previously failed. Requests are now split into chunks of 100, fetched in parallel, and stitched back together in request order.

## 0.12.0

### Minor Changes

- 69a43c9: Add a `Calculator` module (available at the `industrial-model/calculator` subpath) for computing derived time series from formulas over Cognite datapoints. Includes a standalone formula engine (`evaluate`) supporting arithmetic, comparisons, boolean operators, and conditional expressions, evaluated element-by-element with Python-compatible semantics.

## 0.11.3

### Patch Changes

- 2c7cd85: including dependency views on the cache

## 0.11.2

### Patch Changes

- ec286aa: Remove unnecessary reserved words escaping and enum name clash

## 0.11.1

### Patch Changes

- a3894b5: Allow for non-nullable properties and change json-type override properties with clearer name

## 0.11.0

### Minor Changes

- 7091d26: Include strong typing for JSONObject properties in cognite via config file json-types.ts

## 0.10.0

### Minor Changes

- 3073658: -Add support for enums on the generator
  -Fix query stop clause when limit is -1. The query was executing one last time returning an empty result and cursor

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
