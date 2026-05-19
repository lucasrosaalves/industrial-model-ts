# industrial-model

TypeScript SDK for querying [Cognite Flexible Data Models (FDM)](https://docs.cognite.com/cdf/data_modeling/) with a type-safe, graph-aware API.

## Features

- **Type-safe queries** — define your data model types once, get compile-time validation on filters, selects, and sorts
- **Relation traversal** — query nested relations (edges/nodes) up to 3 levels deep with automatic pagination
- **Text search filters** — use Cognite `instances.search` from query and aggregate filters on text fields
- **Dual CJS/ESM** — works in Node.js and bundlers out of the box
- **Cursor-based pagination** — built-in support for iterating large result sets

## Installation

```bash
npm install industrial-model
```

`@cognite/sdk` is a peer dependency and must be installed separately:

```bash
npm install @cognite/sdk
```

## Requirements

- Node.js `>=20`
- `@cognite/sdk` `^10.10.0` (peer dependency)

## Quick start

```ts
import { CogniteClient } from "@cognite/sdk";
import { IndustrialModelClient } from "industrial-model";

const client = new CogniteClient({
  appId: "my-app",
  project: "my-project",
  baseUrl: "https://az-eastus-1.cognitedata.com",
  oidcTokenProvider: async () => getAccessToken(),
});

const model = new IndustrialModelClient(client, {
  space: "cdf_cdm",
  externalId: "CogniteCore",
  version: "v1",
});

const { items } = await model.query<{ name: string; description: string }>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, description: true },
  filters: { name: { prefix: "Pump" } },
  limit: 10,
});
```

## Examples

| Topic | Section |
|-------|---------|
| Setup & types | [Shared type definitions](#shared-type-definitions) |
| Basic queries | [Query assets](#query-assets), [Single asset](#query-a-single-asset-by-externalid) |
| Relations | [Parent/root](#query-assets-with-parent-and-root-relations), [Path](#query-assets-with-their-full-path), [Children](#query-child-assets-reverse-relation), [Edges](#traverse-edge-relations-360-images-on-3d-objects) |
| Filters | [AND/OR/NOT](#combine-filters-with-and--or--not), [Text search](#search-text-fields), [Nested](#filter-on-related-nodes), [Tags](#filter-assets-by-tags), [Batch IDs](#filter-by-multiple-external-ids) |
| Select & sort | [Select all scalars](#select-all-scalar-fields), [Multi-field sort](#sort-by-multiple-fields) |
| Pagination | [Manual cursor loop](#paginate-through-all-assets), [Fetch all pages](#fetch-all-pages-automatically) |
| Aggregation | [Count by group](#count-assets-by-source-id), [Distinct values](#list-distinct-source-ids), [Numeric aggregates](#average-volume-by-type), [Global count](#count-all-matching-assets) |
| Advanced | [Custom data model](#use-a-custom-data-model), [Full query](#full-example-assets-equipment-and-filters) |

All examples below use the [Cognite Core Data Model](https://docs.cognite.com/cdf/data_modeling/reference_data_models/cognite_core/), space `cdf_cdm`, version `v1`.

### Shared type definitions

```ts
import type {
  IndustrialModel,
  ModelProps,
  ModelRelations,
  NodeId,
  QueryResultItem,
} from "industrial-model";

type CogniteAssetClass = IndustrialModel<{
  name: string;
  code: string;
}>;

type CogniteAsset = IndustrialModel<
  {
    name: string;
    description: string;
    tags: string[];
    aliases: string[];
    sourceId: string;
    sourceCreatedTime: string;
    sourceUpdatedTime: string;
    parent?: NodeId;
    root?: NodeId;
    path: NodeId[];
    assetClass?: NodeId;
    type?: NodeId;
    source?: NodeId;
  },
  {
    parent?: CogniteAsset;
    root?: CogniteAsset;
    path?: CogniteAsset[];
    assetClass?: CogniteAssetClass;
  }
>;

type CogniteActivity = IndustrialModel<{
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  assets: NodeId[];
  equipment: NodeId[];
  timeSeries: NodeId[];
}>;

type CogniteEquipment = IndustrialModel<
  {
    name: string;
    description: string;
    manufacturer: string;
    serialNumber: string;
    tags: string[];
    asset?: NodeId;
    equipmentType?: NodeId;
    source?: NodeId;
  },
  {
    asset?: CogniteAsset;
    activities?: CogniteActivity[];
  }
>;

type CogniteUnit = IndustrialModel<{
  name: string;
  symbol: string;
  quantity: string;
  source: string;
}>;

type CogniteTimeSeries = IndustrialModel<
  {
    name: string;
    description: string;
    isStep: boolean;
    sourceUnit: string;
    unit?: NodeId;
    assets: NodeId[];
    equipment: NodeId[];
  },
  {
    unit?: CogniteUnit;
  }
>;

type Cognite360Image = IndustrialModel<{
  takenAt: string;
}>;

type Cognite3DObject = IndustrialModel<
  {
    name: string;
    description: string;
  },
  {
    images360?: Cognite360Image[];
  }
>;
```

---

### Query assets

Fetch the first 100 assets whose name starts with `"Pump"`, sorted alphabetically.

```ts
const { items, cursor } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
    tags: true,
    sourceId: true,
  },
  filters: {
    name: { prefix: "Pump" },
  },
  sort: { name: "ascending" },
  limit: 100,
});
```

---

### Query a single asset by externalId

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, description: true, tags: true },
  filters: {
    externalId: { eq: "WMT:VAL" },
  },
});

const asset = items[0];
```

---

### Query assets with parent and root relations

Traverse up the asset hierarchy — fetch each asset alongside its direct parent and the root of the tree.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
    parent: {
      name: true,
      description: true,
      parent: {
        name: true,
      },
    },
    root: {
      name: true,
    },
  },
  filters: {
    name: { prefix: "Pump" },
  },
  limit: 50,
});

const firstParentName = items[0]?.parent?.name;
```

---

### Query assets with their full path

The `path` property is a list of `NodeId` references representing the ancestor chain. Use it to reconstruct breadcrumbs.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    path: {
      name: true,
      description: true,
    },
  },
  filters: {
    externalId: { eq: "WMT:VAL" },
  },
});
```

---

### Query equipment linked to an asset

```ts
const { items } = await model.query<CogniteEquipment>()({
  viewExternalId: "CogniteEquipment",
  select: {
    name: true,
    manufacturer: true,
    serialNumber: true,
    tags: true,
    asset: true,
  },
  filters: {
    asset: { eq: { space: "my-space", externalId: "WMT:VAL" } },
    manufacturer: { exists: true },
  },
  sort: { name: "ascending" },
  limit: 50,
});
```

---

### Query time series with their unit

```ts
const { items } = await model.query<CogniteTimeSeries>()({
  viewExternalId: "CogniteTimeSeries",
  select: {
    name: true,
    description: true,
    isStep: true,
    sourceUnit: true,
    unit: {
      name: true,
      symbol: true,
      quantity: true,
    },
  },
  filters: {
    isStep: { eq: false },
    sourceUnit: { exists: true },
  },
  limit: 200,
});
```

---

### Query activities in a time window

```ts
const { items } = await model.query<CogniteActivity>()({
  viewExternalId: "CogniteActivity",
  select: {
    name: true,
    description: true,
    startTime: true,
    endTime: true,
    scheduledStartTime: true,
    scheduledEndTime: true,
  },
  filters: {
    startTime: { gte: "2024-01-01T00:00:00Z", lte: "2024-12-31T23:59:59Z" },
  },
  sort: { startTime: "ascending" },
  limit: 500,
});
```

---

### Combine filters with AND / OR / NOT

Fetch assets that are either tagged `"critical"` or have a name starting with `"Compressor"`, but exclude those from source `"legacy-system"`.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, tags: true, sourceId: true },
  filters: {
    OR: [
      { tags: { containsAny: ["critical"] } },
      { name: { prefix: "Compressor" } },
    ],
    NOT: { sourceId: { eq: "legacy-system" } },
  },
  limit: 100,
});
```

---

### Paginate through all assets

```ts
let cursor: string | null = null;
const allAssets: QueryResultItem<CogniteAsset, { name: true; description: true }>[] = [];

do {
  const result = await model.query<CogniteAsset>()({
    viewExternalId: "CogniteAsset",
    select: { name: true, description: true },
    limit: 1000,
    cursor,
  });

  allAssets.push(...result.items);
  cursor = result.cursor;
} while (cursor !== null);

console.log(`Total assets: ${allAssets.length}`);
```

---

### Fetch all pages automatically

Pass `limit: -1` to follow root-view cursors until every page is loaded. The SDK issues multiple `instances.query` calls (1000 items per page by default). The returned `cursor` is always `null`.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, description: true },
  filters: { tags: { containsAny: ["production"] } },
  limit: -1,
});

console.log(`Loaded ${items.length} assets across all pages`);
```

---

### Select all scalar fields

Use `_all` to include every scalar property on the view without listing them individually. Relation fields are returned as `NodeId` references but are not expanded — add nested `select` blocks when you need related data.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { _all: true },
  limit: 50,
});

// items[0] includes name, description, tags, parent (as NodeId), etc.
```

Combine `_all` with explicit relation expansion:

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    _all: true,
    parent: { name: true },
  },
  limit: 25,
});
```

---

### Filter by multiple external IDs

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, description: true },
  filters: {
    externalId: {
      in: ["WMT:VAL", "WMT:PUMP-01", "WMT:PUMP-02"],
    },
  },
});
```

---

### Filter assets by tags

```ts
// Match assets that have at least one of these tags
const critical = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, tags: true },
  filters: { tags: { containsAny: ["critical", "safety"] } },
  limit: 100,
});

// Match assets that must have every tag
const fullyTagged = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, tags: true },
  filters: { tags: { containsAll: ["production", "verified"] } },
  limit: 100,
});
```

---

### Search text fields

Use `search` on text properties and string-list text properties when you want Cognite full-text matching instead of exact or prefix filters. The optional `operator` is passed to Cognite search and defaults to `"OR"`; use `"AND"` when every term should match.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, description: true, tags: true },
  filters: {
    name: { search: { query: "root pump", operator: "AND" } },
    tags: { search: { query: "critical" } },
  },
  limit: 100,
});
```

Search filters can be combined with normal field operators. The SDK first calls Cognite `instances.search`, then adds the returned node references to the regular query filter.

```ts
const pumps = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, sourceId: true },
  filters: {
    name: {
      prefix: "Pump",
      search: { query: "motor" },
    },
    sourceId: { exists: true },
  },
});
```

The same filter syntax is also supported by `aggregate`:

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  aggregate: { count: {} },
  filters: {
    name: { search: { query: "compressor seal" } },
  },
});
```

---

### Filter on related nodes

Filter the root view based on properties of a direct or nested relation. This uses Cognite nested filters under the hood.

```ts
// Assets whose parent is named "Site Root"
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, parent: { name: true } },
  filters: {
    parent: { name: { eq: "Site Root" } },
  },
  limit: 50,
});

// Assets whose parent's asset class code is "PUMP"
const pumpsByClass = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    parent: { assetClass: { name: true, code: true } },
  },
  filters: {
    parent: { assetClass: { code: { eq: "PUMP" } } },
  },
  limit: 50,
});

// Combine root and nested conditions
const filtered = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, parent: { name: true } },
  filters: {
    AND: [
      { name: { prefix: "Pump" } },
      { parent: { name: { exists: true } } },
    ],
  },
  limit: 100,
});
```

---

### Query child assets (reverse relation)

Declare reverse relations in the `IndustrialModel<TProps, TRelations>` metadata. The library resolves the correct traversal direction from your data model.

```ts
type AssetWithChildren = IndustrialModel<
  ModelProps<CogniteAsset>,
  ModelRelations<CogniteAsset> & { children?: CogniteAsset[] }
>;

const { items } = await model.query<AssetWithChildren>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    children: {
      name: true,
      description: true,
    },
  },
  filters: {
    externalId: { eq: "WMT:VAL" },
  },
});
```

---

### Traverse edge relations (360 images on 3D objects)

Some relations are modeled as edges rather than direct node links. Select them the same way — the SDK builds the edge hop automatically.

```ts
const { items } = await model.query<Cognite3DObject>()({
  viewExternalId: "Cognite3DObject",
  select: {
    name: true,
    images360: { takenAt: true },
  },
  filters: {
    name: { prefix: "Tank" },
  },
  limit: 20,
});
```

---

### Sort by multiple fields

Sort clauses apply to primitive fields on the root view, including node-level properties like `externalId`.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { name: true, sourceId: true },
  sort: {
    name: "ascending",
    externalId: "descending",
  },
  limit: 100,
});
```

---

### Use a custom data model

Point the client at any FDM in your project — not only Cognite Core. Scalar fields work with a plain object type; use `IndustrialModel<TProps, TRelations>` when you need relation selects, filters, or inference.

```ts
const model = new IndustrialModelClient(client, {
  space: "my-custom-space",
  externalId: "MyPlantModel",
  version: "1",
});

type PlantArea = IndustrialModel<{
  name: string;
  code: string;
  site?: NodeId;
}>;

const { items } = await model.query<PlantArea>()({
  viewExternalId: "PlantArea",
  select: { name: true, code: true, site: true },
  filters: { code: { prefix: "AREA-" } },
  limit: 200,
});
```

---

### Full example: assets, equipment, and filters

A single query combining nested selects, nested filters, sorting, and pagination.

```ts
type AssetWithRelations = IndustrialModel<
  ModelProps<CogniteAsset>,
  ModelRelations<CogniteAsset> & { children?: CogniteAsset[] }
>;

const { items, cursor } = await model.query<AssetWithRelations>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
    tags: true,
    parent: {
      name: true,
      assetClass: { name: true, code: true },
    },
  },
  filters: {
    name: { prefix: "WMT" },
    parent: { name: { exists: true } },
    OR: [
      { tags: { containsAny: ["critical"] } },
      { sourceId: { eq: "sap" } },
    ],
  },
  sort: { name: "ascending" },
  limit: 25,
  cursor: null,
});

// Follow-up page
if (cursor) {
  const next = await model.query<AssetWithRelations>()({
    viewExternalId: "CogniteAsset",
    select: {
      name: true,
      description: true,
      tags: true,
      parent: { name: true, assetClass: { name: true, code: true } },
    },
    filters: {
      name: { prefix: "WMT" },
      parent: { name: { exists: true } },
    },
    sort: { name: "ascending" },
    limit: 25,
    cursor,
  });
}
```

---

### Count assets by source ID

Group assets and count how many share each `sourceId`. Uses the same `filters` syntax as `query`.

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  groupBy: { sourceId: true },
  aggregate: { count: {} },
  filters: { name: { prefix: "WMT" } },
});

for (const row of items) {
  console.log(row.group?.sourceId, row.aggregate?.value);
}
```

---

### List distinct source IDs

Omit `aggregate` to return unique combinations of the `groupBy` fields (up to 1000 groups).

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  groupBy: { sourceId: true },
});

const sourceIds = items.map((row) => row.group?.sourceId);
```

---

### Average volume by type

Use `avg`, `min`, `max`, or `sum` on numeric view properties. Only one aggregate operation per call.

```ts
type PointCloudVolume = IndustrialModel<{
  volume: number;
  volumeType: string;
}>;

const { items } = await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  groupBy: { volumeType: true },
  aggregate: { avg: "volume" },
});

items[0]?.group?.volumeType;
items[0]?.aggregate?.property; // "volume"
items[0]?.aggregate?.value;
```

Other numeric aggregates:

```ts
await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  aggregate: { min: "volume" },
});

await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  aggregate: { max: "volume" },
});

await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  aggregate: { sum: "volume" },
});
```

---

### Count non-null values for a property

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  aggregate: { count: "name" },
});

items[0]?.aggregate?.property; // "name"
items[0]?.aggregate?.value;
```

---

### Count all matching assets

A global count with no `groupBy`:

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  aggregate: { count: {} },
  filters: {
    OR: [{ tags: { containsAny: ["critical"] } }, { sourceId: { eq: "sap" } }],
  },
});

items[0]?.aggregate?.value;
```

---

### Group by a direct relation

`groupBy` supports direct relations; results are returned as `NodeId` objects.

```ts
type PointCloudVolume = IndustrialModel<{
  volume: number;
  object3D?: NodeId;
}>;

const { items } = await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  groupBy: { object3D: true },
  aggregate: { sum: "volume" },
});

items[0]?.group?.object3D?.externalId;
```

---

## API

### Exports

| Symbol | Description |
|--------|-------------|
| `IndustrialModelClient` | Main client |
| `IndustrialModel`, `ModelProps`, `ModelRelations` | Type helpers for models and relations |
| `NodeId`, `DataModelId` | Instance and data-model identifiers |
| `QueryOptions`, `QuerySelect`, `WhereInput`, `SortInput` | Query input types |
| `QueryResult`, `QueryResultItem`, `QueryResultMetadata` | Query output types |
| `AggregateOptions`, `AggregateGroupBy`, `AggregateDefinition` | Aggregate input types |
| `AggregateResult`, `AggregateResultItem`, `GroupByKey` | Aggregate output types |
| `buildViewSchema`, `nodeIdSchema` | Zod schemas built from Cognite view metadata |
| `SortDirection` | `"ascending"` \| `"descending"` |

### `new IndustrialModelClient(client, dataModelId, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `CogniteClient` | Authenticated Cognite SDK client |
| `dataModelId` | `DataModelId` | Space, externalId, and version of the data model |
| `options.validateResults` | `boolean` | Optional. Validate and parse query results with Zod schemas derived from Cognite view metadata |

On the first query, view definitions are loaded from CDF and cached for the lifetime of the client instance.

Query inputs are validated against the loaded view metadata before the Cognite request is built. Result validation is opt-in because it parses every returned item:

```ts
const model = new IndustrialModelClient(client, dataModelId, {
  validateResults: true,
});
```

When `validateResults` is enabled, Cognite `date` and `timestamp` view properties are converted to JavaScript `Date` objects. Without this option, result values are returned as Cognite provides them, usually ISO strings for timestamps.

### `model.query<TModel>()(options)`

| Option | Type | Description |
|--------|------|-------------|
| `viewExternalId` | `string` | The view to query |
| `select` | `QuerySelect<TModel>` | Optional. Defaults to `{ _all: true }` (all scalar fields). Use `_all: true` explicitly or list fields; use nested objects for relations |
| `filters` | `WhereInput<TModel>` | Filter conditions (supports nested relation filters) |
| `sort` | `SortInput<TModel>` | Sort by primitive fields on the **root** view only |
| `limit` | `number` | Root page size (default `1000`). Use `-1` to fetch all root pages automatically |
| `cursor` | `string \| null` | Pagination cursor from a previous response |

`query()` uses a curried form so you can supply the model types first and still get return-type inference from `select`.

Use `IndustrialModel<TProps, TRelations>` when the model has expandable direct, reverse, or edge relations.

Returns `Promise<QueryResult<QueryResultItem<TModel, TSelect>>>`:

```ts
type QueryResult<TItem> = {
  items: TItem[];
  cursor: string | null; // null when no more root pages
};
```

Each item always includes instance metadata (`space`, `externalId`, `createdTime`, `deletedTime`, `lastUpdatedTime`, `instanceType`) plus the fields you selected. With `{ _all: true }`, scalar view properties are included as well.

Example:

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    parent: {
      name: true,
    },
  },
});

items[0]?.parent?.name;
items[0]?.externalId;
```

### `model.aggregate<TModel>()(options)`

| Option | Type | Description |
|--------|------|-------------|
| `viewExternalId` | `string` | The view to aggregate |
| `groupBy` | `AggregateGroupBy<TModel>` | Optional. Object of groupable properties set to `true` (max 5) |
| `filters` | `WhereInput<TModel>` | Same filter syntax as `query` |
| `aggregate` | `AggregateDefinition<TModel>` | Optional. One of `avg`, `min`, `max`, `sum`, or `count` per call |

Provide at least one of `groupBy` or `aggregate`. Omit `aggregate` to fetch distinct values for the grouped fields. The client always requests nodes with `limit: 1000`.

`aggregate()` uses the same curried form as `query`. Each result item has the shape:

```ts
type AggregateResultItem = {
  group?: { /* keys from groupBy */ };
  aggregate?: { property?: string; value: number };
};
```

When counting all rows, `aggregate` has only `value` (no `property`). When aggregating a field, `property` matches the name you passed in the request.

| Aggregate | Input | Use case |
|-----------|-------|----------|
| `count` | `{ count: {} }` | Row count (optionally filtered) |
| `count` | `{ count: "name" }` | Count non-null values for a property |
| `avg` | `{ avg: "volume" }` | Average of a numeric property |
| `min` | `{ min: "volume" }` | Minimum numeric value |
| `max` | `{ max: "volume" }` | Maximum numeric value |
| `sum` | `{ sum: "volume" }` | Sum of a numeric property |

See [Count assets by source ID](#count-assets-by-source-id), [List distinct source IDs](#list-distinct-source-ids), and [Average volume by type](#average-volume-by-type) for full examples.

### Automatic query behavior

- **`hasData` filter** — every root query includes a `hasData` constraint for the target view.
- **Nested relation limits** — expanded relations use an internal page size of `10000` per sub-query.
- **Dependency pagination** — when a nested sub-query returns `10000` items and a cursor, the client issues follow-up queries (up to 3 rounds) to load additional related data.

### Filter operators

| Type | Operators |
|------|-----------|
| `string` | `eq`, `in`, `prefix`, `search`, `exists` |
| `number` | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` |
| `boolean` | `eq`, `exists` |
| timestamp / `Date` | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` — use ISO strings or `Date` values (coerced to ISO) |
| `NodeId` | `eq`, `in`, `exists` |
| `string[]` | `containsAny`, `containsAll`, `search`, `exists` |
| `T[]` | `containsAny`, `containsAll`, `exists` |

Logical combinators `AND`, `OR`, and `NOT` are supported at any nesting level, including inside nested relation filters (e.g. `parent: { OR: [...] }`).

`search` is available for Cognite text properties and string-list text properties. It is not accepted on node metadata fields such as `externalId` or `space`. Each `search` filter uses `instances.search` with `limit: 1000`, maps the matched nodes to `instanceReferences`, and applies those references to the query or aggregate request.

### Relation traversal

- **Direct relations** — `parent`, `asset`, `unit` (outwards from the current node). List relations such as `path` return arrays when expanded.
- **Reverse relations** — declare in `TRelations` (e.g. `children` on `CogniteAsset`)
- **Edge relations** — declare in `TRelations` (e.g. `images360` on `Cognite3DObject`)
- **Depth** — nested `select` and `filters` up to 3 levels; dependency pages for large nested result sets are fetched automatically (see above)

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

When you change something user-facing, add a changeset:

```bash
npx changeset
```

Commit the generated file under `.changeset/` with your PR. After merge to `main`, the release workflow opens a "Version packages" PR. Merging that PR publishes to npm.

## License

MIT
