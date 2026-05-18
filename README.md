# industrial-model

TypeScript SDK for querying [Cognite Flexible Data Models (FDM)](https://docs.cognite.com/cdf/data_modeling/) with a type-safe, graph-aware API.

## Features

- **Type-safe queries** — define your data model types once, get compile-time validation on filters, selects, and sorts
- **Relation traversal** — query nested relations (edges/nodes) up to 3 levels deep with automatic pagination
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

## Quick start

```ts
import { CogniteClient } from "@cognite/sdk";
import { IndustrialModel } from "industrial-model";

const client = new CogniteClient({
  appId: "my-app",
  project: "my-project",
  baseUrl: "https://az-eastus-1.cognitedata.com",
  oidcTokenProvider: async () => getAccessToken(),
});

const model = new IndustrialModel(client, {
  space: "cdf_cdm",
  externalId: "CogniteCore",
  version: "v1",
});

const { items } = await model.query({
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
| Filters | [AND/OR/NOT](#combine-filters-with-and--or--not), [Nested](#filter-on-related-nodes), [Tags](#filter-assets-by-tags), [Batch IDs](#filter-by-multiple-external-ids) |
| Select & sort | [Select all scalars](#select-all-scalar-fields), [Multi-field sort](#sort-by-multiple-fields) |
| Pagination | [Manual cursor loop](#paginate-through-all-assets), [Fetch all pages](#fetch-all-pages-in-one-call) |
| Advanced | [Custom data model](#use-a-custom-data-model), [Full query](#full-example-assets-equipment-and-filters) |

All examples below use the [Cognite Core Data Model](https://docs.cognite.com/cdf/data_modeling/reference_data_models/cognite_core/), space `cdf_cdm`, version `v1`.

### Shared type definitions

```ts
import type { NodeId } from "industrial-model";

type CogniteAsset = {
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
};

type CogniteAssetRelations = {
  parent: CogniteAsset;
  root: CogniteAsset;
  path: CogniteAsset[];
};

type CogniteEquipment = {
  name: string;
  description: string;
  manufacturer: string;
  serialNumber: string;
  tags: string[];
  asset?: NodeId;
  equipmentType?: NodeId;
  source?: NodeId;
};

type CogniteTimeSeries = {
  name: string;
  description: string;
  isStep: boolean;
  sourceUnit: string;
  unit?: NodeId;
  assets: NodeId[];
  equipment: NodeId[];
};

type CogniteActivity = {
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  assets: NodeId[];
  equipment: NodeId[];
  timeSeries: NodeId[];
};

type CogniteUnit = {
  name: string;
  symbol: string;
  quantity: string;
  source: string;
};

type CogniteUnitRelations = {
  unit: CogniteUnit;
};

type Cognite3DObject = {
  name: string;
  description: string;
};

type Cognite360ImageRelations = {
  images360: { takenAt: string };
};
```

---

### Query assets

Fetch the first 100 assets whose name starts with `"Pump"`, sorted alphabetically.

```ts
const { items, cursor } = await model.query<CogniteAsset>({
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
  sortClauses: { name: "ascending" },
  limit: 100,
});
```

---

### Query a single asset by externalId

```ts
const { items } = await model.query<CogniteAsset>({
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
const { items } = await model.query<CogniteAsset, CogniteAssetRelations>({
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
```

---

### Query assets with their full path

The `path` property is a list of `NodeId` references representing the ancestor chain. Use it to reconstruct breadcrumbs.

```ts
const { items } = await model.query<CogniteAsset, CogniteAssetRelations>({
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
const { items } = await model.query<CogniteEquipment>({
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
  sortClauses: { name: "ascending" },
  limit: 50,
});
```

---

### Query time series with their unit

```ts
const { items } = await model.query<CogniteTimeSeries, CogniteUnitRelations>({
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
const { items } = await model.query<CogniteActivity>({
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
  sortClauses: { startTime: "ascending" },
  limit: 500,
});
```

---

### Combine filters with AND / OR / NOT

Fetch assets that are either tagged `"critical"` or have a name starting with `"Compressor"`, but exclude those from source `"legacy-system"`.

```ts
const { items } = await model.query<CogniteAsset>({
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
const allAssets: Record<string, unknown>[] = [];

do {
  const result = await model.query<CogniteAsset>({
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

### Fetch all pages in one call

Pass `limit: -1` to automatically follow cursors until every page is loaded. The returned `cursor` is always `null`.

```ts
const { items } = await model.query<CogniteAsset>({
  viewExternalId: "CogniteAsset",
  select: { name: true, description: true },
  filters: { tags: { containsAny: ["production"] } },
  limit: -1,
});

console.log(`Loaded ${items.length} assets in one request chain`);
```

---

### Select all scalar fields

Use `_all` to include every scalar property on the view without listing them individually. Relation fields are returned as `NodeId` references but are not expanded — add nested `select` blocks when you need related data.

```ts
const { items } = await model.query<CogniteAsset>({
  viewExternalId: "CogniteAsset",
  select: { _all: true },
  limit: 50,
});

// items[0] includes name, description, tags, parent (as NodeId), etc.
```

Combine `_all` with explicit relation expansion:

```ts
const { items } = await model.query<CogniteAsset, CogniteAssetRelations>({
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
const { items } = await model.query<CogniteAsset>({
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
const critical = await model.query<CogniteAsset>({
  viewExternalId: "CogniteAsset",
  select: { name: true, tags: true },
  filters: { tags: { containsAny: ["critical", "safety"] } },
  limit: 100,
});

// Match assets that must have every tag
const fullyTagged = await model.query<CogniteAsset>({
  viewExternalId: "CogniteAsset",
  select: { name: true, tags: true },
  filters: { tags: { containsAll: ["production", "verified"] } },
  limit: 100,
});
```

---

### Filter on related nodes

Filter the root view based on properties of a direct or nested relation. This uses Cognite nested filters under the hood.

```ts
// Assets whose parent is named "Site Root"
const { items } = await model.query<CogniteAsset>({
  viewExternalId: "CogniteAsset",
  select: { name: true, parent: { name: true } },
  filters: {
    parent: { name: { eq: "Site Root" } },
  },
  limit: 50,
});

// Assets whose parent's asset class code is "PUMP"
const pumpsByClass = await model.query<CogniteAsset>({
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
const filtered = await model.query<CogniteAsset>({
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

Declare reverse relations in the second generic parameter (`TRelation`). The library resolves the correct traversal direction from your data model.

```ts
type AssetWithChildren = CogniteAsset & {
  children?: CogniteAsset[];
};

const { items } = await model.query<AssetWithChildren, { children: CogniteAsset }>({
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
const { items } = await model.query<Cognite3DObject, Cognite360ImageRelations>({
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
const { items } = await model.query<CogniteAsset>({
  viewExternalId: "CogniteAsset",
  select: { name: true, sourceId: true },
  sortClauses: {
    name: "ascending",
    externalId: "descending",
  },
  limit: 100,
});
```

---

### Use a custom data model

Point the client at any FDM in your project — not only Cognite Core. Views and filters work the same way once your TypeScript types match the model.

```ts
const model = new IndustrialModel(client, {
  space: "my-custom-space",
  externalId: "MyPlantModel",
  version: "1",
});

type PlantArea = {
  name: string;
  code: string;
  site?: NodeId;
};

const { items } = await model.query<PlantArea>({
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
type AssetWithRelations = CogniteAsset & {
  parent?: CogniteAsset & { assetClass?: { name: string; code: string } };
};

const { items, cursor } = await model.query<AssetWithRelations, CogniteAssetRelations>({
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
  sortClauses: { name: "ascending" },
  limit: 25,
  cursor: null,
});

// Follow-up page
if (cursor) {
  const next = await model.query<AssetWithRelations, CogniteAssetRelations>({
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
    sortClauses: { name: "ascending" },
    limit: 25,
    cursor,
  });
}
```

---

## API

### `new IndustrialModel(client, dataModelId)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `CogniteClient` | Authenticated Cognite SDK client |
| `dataModelId` | `DataModelId` | Space, externalId, and version of the data model |

### `model.query<T, TRelation?>(options)`

| Option | Type | Description |
|--------|------|-------------|
| `viewExternalId` | `string` | The view to query |
| `select` | `QuerySelect<T, TRelation>` | Fields to include; use `_all: true` for all scalars |
| `filters` | `WhereInput<T, TRelation>` | Filter conditions (supports nested relation filters) |
| `sortClauses` | `SortInput<T>` | Sort by primitive fields |
| `limit` | `number` | Max items per page (default 1000, max 10000). Use `-1` to fetch all pages |
| `cursor` | `string \| null` | Pagination cursor from a previous response |

Returns `Promise<QueryResult>`:

```ts
type QueryResult = {
  items: Record<string, unknown>[];
  cursor: string | null; // null when no more pages
};
```

### Filter operators

| Type | Operators |
|------|-----------|
| `string` | `eq`, `in`, `prefix`, `exists` |
| `number` | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` |
| `boolean` | `eq`, `exists` |
| `Date` | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` |
| `NodeId` | `eq`, `in`, `exists` |
| `T[]` | `containsAny`, `containsAll`, `exists` |

Logical combinators `AND`, `OR`, and `NOT` are supported at any nesting level, including inside nested relation filters (e.g. `parent: { OR: [...] }`).

### Relation traversal

- **Direct relations** — `parent`, `asset`, `unit` (outwards from the current node)
- **Reverse relations** — declare in `TRelation` (e.g. `children` on `CogniteAsset`)
- **Edge relations** — declare in `TRelation` (e.g. `images360` on `Cognite3DObject`)
- **Depth** — nested selects and filters up to 3 levels; dependency pages are fetched automatically

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

When you change something user-facing, add a changeset:

```bash
npx changeset
```

Commit the generated file under `.changeset/` with your PR. After merge to `main`, the release workflow opens a "Version packages" PR. Merging that PR publishes to npm.

## License

MIT
