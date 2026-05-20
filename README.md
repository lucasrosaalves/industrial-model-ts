# industrial-model

TypeScript SDK for querying [Cognite Flexible Data Models (FDM)](https://docs.cognite.com/cdf/data_modeling/) with a type-safe, graph-aware API.

`industrial-model` is designed for application code that needs to move through industrial data as a model, not as loosely typed query payloads. Start with a Cognite data model, describe the view shape in TypeScript, and query nodes, relations, filters, sorting, pagination, and aggregations with compiler support.

## What You Get

- **Typed model queries** - validate selected fields, filters, and sort keys at compile time.
- **Precise result types** - returned items follow the `select` tree, including nested relation selections.
- **Graph traversal** - expand direct, reverse, and edge relations up to 3 levels deep.
- **Industrial filters** - combine scalar filters, list filters, full-text search, and nested relation filters.
- **Pagination support** - use cursors manually or fetch all root pages with `limit: -1`.
- **Aggregation support** - count, group, list distinct values, and aggregate numeric properties.
- **Mutation support** - upsert model-shaped node patches and delete nodes by identity.
- **Runtime validation option** - parse query results with Zod schemas derived from Cognite view metadata.
- **CJS and ESM builds** - works in Node.js and common bundler setups.

## Installation

```bash
npm install industrial-model
npm install @cognite/sdk
```

`@cognite/sdk` is a peer dependency and must be installed by your application.

## Requirements

- Node.js `>=20`
- `@cognite/sdk` `^10.10.0`

## First Query

Create a Cognite SDK client, point `IndustrialModelClient` at a data model, and query a view.

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
  select: {
    name: true,
    description: true,
  },
  filters: {
    name: { prefix: "Pump" },
  },
  sort: {
    name: "ascending",
  },
  limit: 10,
});

items[0]?.name;
```

This is the basic contract:

1. `viewExternalId` selects the Cognite view.
2. The generic type describes the fields you want TypeScript to understand.
3. `select` controls the returned shape.
4. `filters`, `sort`, `limit`, and `cursor` control the query behavior.

## Define A Model

For scalar-only views, a plain object type is enough:

```ts
type CogniteAssetClass = {
  name: string;
  code: string;
};
```

When a view has expandable relations, use `IndustrialModel<TProps, TRelations>`. Put the raw view properties in `TProps`, and put expandable relation result shapes in `TRelations`.

```ts
import type { IndustrialModel, ModelProps, ModelRelations, NodeId } from "industrial-model";

type CogniteAsset = IndustrialModel<
  {
    name: string;
    description: string;
    tags: string[];
    sourceId: string;
    parent?: NodeId;
    root?: NodeId;
    path: NodeId[];
    assetClass?: NodeId;
  },
  {
    parent?: CogniteAsset;
    root?: CogniteAsset;
    path?: CogniteAsset[];
    assetClass?: CogniteAssetClass;
  }
>;

type CogniteEquipment = IndustrialModel<
  {
    name: string;
    manufacturer: string;
    serialNumber: string;
    tags: string[];
    asset?: NodeId;
  },
  {
    asset?: CogniteAsset;
  }
>;
```

The relation metadata is type-only. It lets the SDK infer nested `select` trees and nested filters while Cognite remains the source of truth for the actual view and relation definitions.

All examples below use the [Cognite Core Data Model](https://docs.cognite.com/cdf/data_modeling/reference_data_models/cognite_core/), space `cdf_cdm`, version `v1`.

## Query Basics

Start with a single view, select the fields the application needs, then layer on filters and sorting.

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
  sort: {
    name: "ascending",
  },
  limit: 100,
});
```

The returned item type follows the selection:

```ts
items[0]?.name; // string
items[0]?.description; // string
items[0]?.externalId; // instance metadata is always included
```

To find one known instance, filter by `externalId`:

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
    tags: true,
  },
  filters: {
    externalId: { eq: "WMT:VAL" },
  },
});

const asset = items[0];
```

Use `_all` when you want every scalar property from the root view:

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: { _all: true },
  limit: 50,
});
```

`_all` includes scalar fields and relation IDs. Add nested selections when you want relation objects instead of `NodeId` references.

## Filters And Sorting

Filters are typed from your model. String, number, boolean, date, `NodeId`, and list fields each expose the operators that make sense for that field.

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
  sort: {
    name: "ascending",
  },
  limit: 50,
});
```

Combine conditions with `AND`, `OR`, and `NOT`:

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    tags: true,
    sourceId: true,
  },
  filters: {
    OR: [
      { tags: { containsAny: ["critical"] } },
      { name: { prefix: "Compressor" } },
    ],
    NOT: {
      sourceId: { eq: "legacy-system" },
    },
  },
  limit: 100,
});
```

List fields support `containsAny` and `containsAll`:

```ts
const critical = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    tags: true,
  },
  filters: {
    tags: { containsAny: ["critical", "safety"] },
  },
  limit: 100,
});

const fullyTagged = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    tags: true,
  },
  filters: {
    tags: { containsAll: ["production", "verified"] },
  },
  limit: 100,
});
```

Sort clauses apply to primitive fields on the root view, including node metadata such as `externalId`.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    sourceId: true,
  },
  sort: {
    name: "ascending",
    externalId: "descending",
  },
  limit: 100,
});
```

## Text Search

Use `search` on Cognite text properties and string-list text properties when you want full-text matching instead of exact or prefix matching. The optional `operator` is passed to Cognite search and defaults to `"OR"`.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
    tags: true,
  },
  filters: {
    name: { search: { query: "root pump", operator: "AND" } },
    tags: { search: { query: "critical" } },
  },
  limit: 100,
});
```

Search filters can be combined with regular operators. The SDK first calls Cognite `instances.search`, maps the matched nodes to instance references, and then applies those references to the query or aggregate request.

```ts
const pumps = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    sourceId: true,
  },
  filters: {
    name: {
      prefix: "Pump",
      search: { query: "motor" },
    },
    sourceId: { exists: true },
  },
});
```

## Relations

The same `select` object that selects scalar fields can expand relations. Direct relations move outward from the current node.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
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

List relations work the same way. For example, `path` can be expanded into asset objects for breadcrumb-style views.

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

Nested relation filters let you filter the root view based on related nodes.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    parent: {
      name: true,
    },
  },
  filters: {
    parent: {
      name: { eq: "Site Root" },
    },
  },
  limit: 50,
});
```

You can keep moving through the graph:

```ts
const pumpsByClass = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    parent: {
      assetClass: {
        name: true,
        code: true,
      },
    },
  },
  filters: {
    parent: {
      assetClass: {
        code: { eq: "PUMP" },
      },
    },
  },
  limit: 50,
});
```

### Reverse Relations

Declare reverse relations in `IndustrialModel<TProps, TRelations>`. The SDK resolves the traversal direction from the Cognite data model.

```ts
type AssetWithChildren = IndustrialModel<
  ModelProps<CogniteAsset>,
  ModelRelations<CogniteAsset> & {
    children?: CogniteAsset[];
  }
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

### Edge Relations

Some relations are modeled as edges rather than direct node references. Select them with the same relation syntax.

```ts
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

const { items } = await model.query<Cognite3DObject>()({
  viewExternalId: "Cognite3DObject",
  select: {
    name: true,
    images360: {
      takenAt: true,
    },
  },
  filters: {
    name: { prefix: "Tank" },
  },
  limit: 20,
});
```

## Pagination

`query()` returns a root cursor when more root-view items are available.

```ts
import type { QueryResultItem } from "industrial-model";

let cursor: string | null = null;
const allAssets: QueryResultItem<CogniteAsset, { name: true; description: true }>[] = [];

do {
  const result = await model.query<CogniteAsset>()({
    viewExternalId: "CogniteAsset",
    select: {
      name: true,
      description: true,
    },
    limit: 1000,
    cursor,
  });

  allAssets.push(...result.items);
  cursor = result.cursor;
} while (cursor !== null);
```

Pass `limit: -1` when you want the SDK to follow all root cursors automatically. The SDK issues multiple `instances.query` calls, using 1000 root items per page by default, and returns `cursor: null`.

```ts
const { items } = await model.query<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
  },
  filters: {
    tags: { containsAny: ["production"] },
  },
  limit: -1,
});
```

Expanded relations use internal pagination as well. When a nested relation query reaches the internal page size, the client follows dependency cursors for up to 3 additional rounds.

## Upsert

Use `upsert()` to create or patch nodes with the same model shape you use for queries. Each item must include `space` and `externalId`; all other fields are optional and only the fields you pass are updated.

```ts
await model.upsert<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  items: [
    {
      space: "asset-space",
      externalId: "pump-1",
      name: "Pump 1",
      parent: { space: "asset-space", externalId: "root" },
    },
  ],
});
```

Direct relations are written as `NodeId` values. Reverse direct relations are written by patching the target nodes through the relation field defined in Cognite. For example, writing `children` on an asset updates each child asset's `parent` reference.

```ts
await model.upsert<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  items: [
    {
      space: "asset-space",
      externalId: "parent-asset",
      children: [{ space: "asset-space", externalId: "child-1" }],
    },
  ],
});
```

Edge-backed relations need an edge ID. Provide `onEdgeCreation` for every edge connection property you write. The callback receives normalized `startNode`, `endNode`, and `edgeType` values after the SDK has applied the relation direction from the view metadata.

```ts
await model.upsert<Cognite3DObject>()({
  viewExternalId: "Cognite3DObject",
  items: [
    {
      space: "object-space",
      externalId: "object-1",
      images360: [{ space: "image-space", externalId: "image-1" }],
    },
  ],
  onEdgeCreation: {
    images360: ({ startNode, endNode, edgeType }) => ({
      space: startNode.space,
      externalId: `${startNode.externalId}:${edgeType.externalId}:${endNode.externalId}`,
    }),
  },
});
```

`edgeMode` controls how edge connection properties are applied:

| Mode | Behavior |
| --- | --- |
| `"append"` | Default. Creates the generated edges and leaves existing edges untouched. |
| `"replace"` | Queries existing edges for the provided edge connection fields, deletes edges that were not generated by the current upsert, then applies the new edges. |

To clear an edge connection for a node, include the property with an empty array and use `edgeMode: "replace"`:

```ts
await model.upsert<Cognite3DObject>()({
  viewExternalId: "Cognite3DObject",
  edgeMode: "replace",
  items: [
    {
      space: "object-space",
      externalId: "object-1",
      images360: [],
    },
  ],
});
```

This deletes existing `images360` edges for `object-1`. Other edge connection fields on the same node are not touched, and omitting `images360` entirely leaves its existing edges unchanged.

Use `replace: true` when you want Cognite apply replace semantics for container-backed node properties.

Important constraints:

- Relation fields accept only `NodeId` or `NodeId[]` references. Nested node mutation is intentionally not supported.
- Unknown fields are rejected before Cognite is called.
- Edge connection fields require `onEdgeCreation.<property>` only when the submitted array contains edges to create.
- Cognite apply requests are limited to 1000 writes/deletes per call. You can still pass more than 1000 upsert items or edge references; the SDK follows paginated edge-replacement queries and splits large apply payloads into multiple Cognite calls.
- `edgeMode: "replace"` only replaces edge connection fields included in the submitted items.

## Delete

Use `delete()` when you only need to delete nodes by identity. The method accepts an array of values with `space` and `externalId`; any extra fields are ignored.

```ts
await model.delete([
  { space: "asset-space", externalId: "pump-1" },
  { space: "asset-space", externalId: "pump-2", name: "Pump 2" },
]);
```

The delete operation is view-independent, so it does not require `viewExternalId` and is also available directly on `CogniteCoreClient`.

```ts
await core.delete([{ space: "asset-space", externalId: "pump-1" }]);
```

Deletes are sent through Cognite apply. When more than 1000 nodes are provided, the SDK splits them into multiple Cognite calls.

## Aggregation

Use `aggregate()` when you need grouped counts, distinct values, or numeric summaries without loading every instance.

Group and count assets by `sourceId`:

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  groupBy: {
    sourceId: true,
  },
  aggregate: {
    count: {},
  },
  filters: {
    name: { prefix: "WMT" },
  },
});

for (const row of items) {
  console.log(row.group?.sourceId, row.aggregate?.value);
}
```

Omit `aggregate` to list distinct values for grouped fields:

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  groupBy: {
    sourceId: true,
  },
});

const sourceIds = items.map((row) => row.group?.sourceId);
```

Use `avg`, `min`, `max`, or `sum` on numeric properties:

```ts
type PointCloudVolume = IndustrialModel<{
  volume: number;
  volumeType: string;
  object3D?: NodeId;
}>;

const { items } = await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  groupBy: {
    volumeType: true,
  },
  aggregate: {
    avg: "volume",
  },
});

items[0]?.group?.volumeType;
items[0]?.aggregate?.property; // "volume"
items[0]?.aggregate?.value;
```

Count all rows matching a filter:

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  aggregate: {
    count: {},
  },
  filters: {
    OR: [{ tags: { containsAny: ["critical"] } }, { sourceId: { eq: "sap" } }],
  },
});

items[0]?.aggregate?.value;
```

Group by a direct relation when you need relation IDs in the result:

```ts
const { items } = await model.aggregate<PointCloudVolume>()({
  viewExternalId: "CognitePointCloudVolume",
  groupBy: {
    object3D: true,
  },
  aggregate: {
    sum: "volume",
  },
});

items[0]?.group?.object3D?.externalId;
```

Text search filters are also supported in aggregations:

```ts
const { items } = await model.aggregate<CogniteAsset>()({
  viewExternalId: "CogniteAsset",
  aggregate: {
    count: {},
  },
  filters: {
    name: { search: { query: "compressor seal" } },
  },
});
```

## Runtime Validation

By default, the SDK validates query inputs against the loaded Cognite view metadata before building the request. Query results are mapped without parsing each returned item.

Enable `validateResults` when you also want result parsing through Zod schemas derived from Cognite view metadata:

```ts
const model = new IndustrialModelClient(
  client,
  {
    space: "cdf_cdm",
    externalId: "CogniteCore",
    version: "v1",
  },
  {
    validateResults: true,
  },
);
```

When result validation is enabled, Cognite `date` and `timestamp` view properties are converted to JavaScript `Date` objects. Without it, result values are returned as Cognite provides them, usually ISO strings for timestamps.

## Cognite Core Client

For applications working with the Cognite Core Data Model (`cdf_cdm/CogniteCore/v1`), use `CogniteCoreClient` instead of `IndustrialModelClient`. It pre-configures the data model, bundles all view type definitions, and moves the view name to the first positional argument so TypeScript can infer the model type without a generic annotation.

```ts
import { CogniteClient } from "@cognite/sdk";
import { CogniteCoreClient } from "industrial-model/cognite-core";

const client = new CogniteClient({ ... });
const core = new CogniteCoreClient(client);
```

Query any Cognite Core view by passing its name to `query()`:

```ts
const { items } = await core.query("CogniteAsset")({
  select: {
    name: true,
    description: true,
    parent: { name: true },
  },
  filters: {
    name: { prefix: "Pump" },
  },
  limit: 50,
});

items[0]?.name; // string | undefined
items[0]?.parent?.name; // string | undefined
```

The view name drives TypeScript inference — no generic annotation is needed. All filters, `select` fields, and nested relation selections are type-checked against the bundled view definition. Every feature available on `IndustrialModelClient` — text search, pagination, `limit: -1`, nested filters, and relation traversal — works identically.

Aggregations use the same positional-view-name pattern:

```ts
const { items } = await core.aggregate("CogniteEquipment")({
  groupBy: { manufacturer: true },
  aggregate: { count: {} },
  filters: {
    equipmentType: { exists: true },
  },
});

items[0]?.group?.manufacturer;
items[0]?.aggregate?.value;
```

Upserts use the same pattern and infer the item shape from the view name:

```ts
await core.upsert("CogniteAsset")({
  items: [
    {
      space: "asset-space",
      externalId: "pump-1",
      name: "Pump 1",
      parent: { space: "asset-space", externalId: "root" },
    },
  ],
});
```

Deletes are view-independent:

```ts
await core.delete([{ space: "asset-space", externalId: "pump-1" }]);
```

All Cognite Core view types are exported from `industrial-model` and can be imported directly for use with `IndustrialModelClient` if needed:

```ts
import type { CogniteAsset, CogniteEquipment, CogniteTimeSeries } from "industrial-model";
```

### Inward List-Relation Limitation

Cognite rejects server-side inward traversal of list direct relations. As a result, `timeSeries`, `files`, and `activities` cannot be expanded from `CogniteAsset`. Attempting to select them throws a descriptive error before the Cognite API is called, naming the view to query and the field to filter on.

The alternative is to query the target view directly and filter by the relation field pointing back to the asset:

```ts
// not supported — throws before calling Cognite
await core.query("CogniteAsset")({
  select: { timeSeries: { name: true } } as never,
});

// correct alternative: query CogniteTimeSeries and filter by assets
const { items } = await core.query("CogniteTimeSeries")({
  select: { name: true, type: true },
  filters: {
    assets: { containsAny: [{ space: "my-space", externalId: "WMT:VAL" }] },
  },
});
```

## Custom Data Models

The client can query any FDM in your CDF project. Cognite Core is not required.

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
  select: {
    name: true,
    code: true,
    site: true,
  },
  filters: {
    code: { prefix: "AREA-" },
  },
  limit: 200,
});
```

## Complete Example

This example combines typed relations, nested selections, nested filters, sorting, and cursor pagination.

```ts
type AssetWithRelations = IndustrialModel<
  ModelProps<CogniteAsset>,
  ModelRelations<CogniteAsset> & {
    children?: CogniteAsset[];
  }
>;

const { items, cursor } = await model.query<AssetWithRelations>()({
  viewExternalId: "CogniteAsset",
  select: {
    name: true,
    description: true,
    tags: true,
    parent: {
      name: true,
      assetClass: {
        name: true,
        code: true,
      },
    },
    children: {
      name: true,
    },
  },
  filters: {
    name: { prefix: "WMT" },
    parent: {
      name: { exists: true },
    },
    OR: [
      { tags: { containsAny: ["critical"] } },
      { sourceId: { eq: "sap" } },
    ],
  },
  sort: {
    name: "ascending",
  },
  limit: 25,
  cursor: null,
});

if (cursor) {
  const next = await model.query<AssetWithRelations>()({
    viewExternalId: "CogniteAsset",
    select: {
      name: true,
      description: true,
      tags: true,
      parent: {
        name: true,
        assetClass: {
          name: true,
          code: true,
        },
      },
    },
    filters: {
      name: { prefix: "WMT" },
      parent: {
        name: { exists: true },
      },
    },
    sort: {
      name: "ascending",
    },
    limit: 25,
    cursor,
  });
}
```

## API Reference

### `new CogniteCoreClient(client, options?)`

| Parameter | Type | Description |
| --- | --- | --- |
| `client` | `CogniteClient` | Authenticated Cognite SDK client. |
| `options` | `IndustrialModelClientOptions` | Optional. Same options as `IndustrialModelClient`. |

Pre-configured for the Cognite Core Data Model (`cdf_cdm/CogniteCore/v1`). The exported constant `COGNITE_CORE_DATA_MODEL` holds the data model identifier if you need to pass it to other utilities.

### `core.query(viewExternalId)(options)`

Same as `model.query<TModel>()(options)` on `IndustrialModelClient`, except the view is provided as the first positional argument and the model type is inferred from it. The `viewExternalId` option is not accepted in the second call. `viewExternalId` must be a valid `CogniteCoreViewExternalId`.

### `core.aggregate(viewExternalId)(options)`

Same as `model.aggregate<TModel>()(options)` on `IndustrialModelClient`, with the view name as the first positional argument.

### `core.upsert(viewExternalId)(options)`

Same as `model.upsert<TModel>()(options)` on `IndustrialModelClient`, with the view name as the first positional argument. The model type is inferred from the Cognite Core view name.

### `core.delete(items)`

Same as `model.delete(items)` on `IndustrialModelClient`. Deletes nodes by `space` and `externalId`; no view name is required.

### `new IndustrialModelClient(client, dataModelId, options?)`

| Parameter | Type | Description |
| --- | --- | --- |
| `client` | `CogniteClient` | Authenticated Cognite SDK client. |
| `dataModelId` | `DataModelId` | Data model `space`, `externalId`, and `version`. |
| `options.validateResults` | `boolean` | Optional. Parse result items with generated Zod schemas. |

On the first query or aggregation, view definitions are loaded from CDF and cached for the lifetime of the client instance.

### `model.query<TModel>()(options)`

`query()` uses a curried form so you can provide the model type first and still get return-type inference from `select`.

| Option | Description |
| --- | --- |
| `viewExternalId` | View to query. |
| `select` | Optional. Defaults to `{ _all: true }`. Use nested objects for relations. |
| `filters` | Field, logical, search, and nested relation filters. |
| `sort` | Sort by primitive fields on the root view only. |
| `limit` | Root page size. Defaults to `1000`. Use `-1` to fetch all root pages. |
| `cursor` | Root pagination cursor from a previous response. |

Returns:

```ts
type QueryResult<TItem> = {
  items: TItem[];
  cursor: string | null;
};
```

Each item includes instance metadata such as `space`, `externalId`, `version`, `createdTime`, `deletedTime`, and `lastUpdatedTime`, plus the selected fields.

### `model.upsert<TModel>()(options)`

`upsert()` uses the same model type as `query()` and accepts partial node patches. It returns the Cognite apply result items.

| Option | Description |
| --- | --- |
| `viewExternalId` | View to create or patch. |
| `items` | Node patches. Each item must include `space` and `externalId`. Inputs larger than Cognite's 1000-item apply limit are split into multiple calls. |
| `replace` | Optional. Enables Cognite apply replace semantics for submitted container-backed properties. |
| `edgeMode` | Optional. `"append"` by default; use `"replace"` to remove existing edge connection edges for submitted edge fields before applying the new references. |
| `onEdgeCreation` | Optional map of edge connection property names to callbacks that generate edge IDs. Required for every edge connection property that creates one or more edges. |

Returns:

```ts
type UpsertResult = {
  items: Array<{
    instanceType: "node" | "edge";
    space: string;
    externalId: string;
    version?: number;
    wasModified?: boolean;
    createdTime?: number;
    lastUpdatedTime?: number;
  }>;
};
```

### `model.delete<TItem extends NodeId>(items)`

Deletes nodes by identity. Each item must include `space` and `externalId`; extra fields are ignored. Inputs larger than Cognite's 1000-item apply limit are split into multiple calls.

```ts
await model.delete([{ space: "asset-space", externalId: "pump-1" }]);
```

Returns:

```ts
type DeleteResult = {
  items: Array<{
    instanceType: "node";
    space: string;
    externalId: string;
    version?: number;
    wasModified?: boolean;
    createdTime?: number;
    lastUpdatedTime?: number;
  }>;
};
```

### `model.aggregate<TModel>()(options)`

| Option | Description |
| --- | --- |
| `viewExternalId` | View to aggregate. |
| `groupBy` | Groupable properties set to `true`; max 5 fields. |
| `filters` | Same filter syntax as `query()`. |
| `aggregate` | One of `avg`, `min`, `max`, `sum`, or `count`. |

Provide at least one of `groupBy` or `aggregate`. Omit `aggregate` to fetch distinct grouped values. The client requests up to 1000 aggregate rows.

| Aggregate | Input | Use case |
| --- | --- | --- |
| `count` | `{ count: {} }` | Row count, optionally filtered. |
| `count` | `{ count: "name" }` | Count non-null values for a property. |
| `avg` | `{ avg: "volume" }` | Average of a numeric property. |
| `min` | `{ min: "volume" }` | Minimum numeric value. |
| `max` | `{ max: "volume" }` | Maximum numeric value. |
| `sum` | `{ sum: "volume" }` | Sum of a numeric property. |

### Filter Operators

| Field type | Operators |
| --- | --- |
| `string` | `eq`, `in`, `prefix`, `search`, `exists` |
| `number` | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` |
| `boolean` | `eq`, `exists` |
| timestamp / `Date` | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` |
| `NodeId` | `eq`, `in`, `exists` |
| `string[]` | `containsAny`, `containsAll`, `search`, `exists` |
| `T[]` | `containsAny`, `containsAll`, `exists` |

Logical combinators `AND`, `OR`, and `NOT` are supported at any nesting level, including nested relation filters.

### Relation Traversal

| Relation type | Description |
| --- | --- |
| Direct relations | Outward node references such as `parent`, `asset`, and `unit`. |
| Reverse relations | Relations declared only in `TRelations`, such as `children` on `CogniteAsset`. |
| Edge relations | Edge-backed relations declared in `TRelations`, such as `images360` on `Cognite3DObject`. |
| Depth | Nested `select` and `filters` are supported up to 3 levels deep. |

### Exports

**Core**

| Symbol | Description |
| --- | --- |
| `IndustrialModelClient` | Main client for any FDM data model. |
| `IndustrialModel`, `ModelProps`, `ModelRelations` | Type helpers for model properties and relation metadata. |
| `NodeId`, `DataModelId` | Instance and data model identifiers. |
| `QuerySelect` | Type helper for reusable query selections. |
| `QueryResult`, `QueryResultItem` | Query output types. |
| `AggregateResult`, `AggregateResultItem` | Aggregate output types. |
| `UpsertOptions`, `UpsertNode`, `UpsertProperties` | Upsert input helper types. |
| `UpsertResult`, `UpsertResultItem` | Upsert output types. |
| `DeleteExecutor`, `DeleteResult`, `DeleteResultItem` | Delete helper and output types. |
| `EdgeCreationContext`, `EdgeCreationCallback`, `EdgeCreationCallbacks`, `EdgeMode` | Edge upsert helper types. |
| `IndustrialModelClientOptions` | Client configuration options. |

**Cognite Core**

| Symbol | Description |
| --- | --- |
| `CogniteCoreClient` | Convenience client pre-configured for `cdf_cdm/CogniteCore/v1`. |
| `COGNITE_CORE_DATA_MODEL` | Data model identifier constant for Cognite Core v1. |
| `CogniteCoreViewExternalId` | Union type of all Cognite Core view names. |
| `CogniteAsset`, `CogniteAssetClass`, `CogniteAssetType` | Asset hierarchy views. |
| `CogniteEquipment`, `CogniteEquipmentType` | Equipment views. |
| `CogniteFile`, `CogniteFileCategory` | File views. |
| `CogniteActivity` | Activity view. |
| `CogniteTimeSeries` | Time series view. |
| `CogniteUnit` | Unit of measurement view. |
| `CogniteAnnotation`, `CogniteDiagramAnnotation` | Annotation views. |
| `CogniteSourceSystem` | Source system view. |
| `CogniteDescribable`, `CogniteSourceable`, `CogniteSchedulable`, `CogniteVisualizable` | Mixin views. |
| `Cognite3DObject`, `Cognite3DModel`, `Cognite3DRevision`, `Cognite3DTransformation` | 3D object and model views. |
| `CogniteCADModel`, `CogniteCADRevision`, `CogniteCADNode` | CAD-specific views. |
| `CognitePointCloudModel`, `CognitePointCloudRevision`, `CognitePointCloudVolume` | Point cloud views. |
| `Cognite360Image`, `Cognite360ImageModel`, `Cognite360ImageCollection`, `Cognite360ImageStation`, `Cognite360ImageAnnotation` | 360 image views. |
| `CogniteCubeMap` | Cube map view. |

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

When you change something user-facing, add a changeset:

```bash
npx changeset
```

Commit the generated file under `.changeset/` with your PR. After merge to `main`, the release workflow opens a "Version packages" PR. Merging that PR publishes to npm.

## License

MIT
