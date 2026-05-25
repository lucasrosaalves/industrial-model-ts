# Code Generator (CLI)

The `industrial-model` package includes a CLI that connects to Cognite Data Fusion, reads a data model's view definitions, and generates fully-typed TypeScript code.

## Generated output

For a data model with views `Equipment` and `Facility`, the CLI produces:

```
generated/MyDataModel/
├── types.ts     # IndustrialModel<Props, Relations> type aliases and executors
├── client.ts    # MyDataModelClient class and createMyDataModelClient() shortcuts
└── index.ts     # Re-exports
```

## Usage

```bash
# Interactive (prompts for everything, opens browser for auth)
npx industrial-model generate

# Fully flag-driven
npx industrial-model generate \
  --token $TOKEN \
  --project my-proj \
  --base-url https://az-eastus-1.cognitedata.com \
  --data-model "my-space/MyModel/1" \
  --output ./generated \
  --client-name MyModel
```

## Authentication

When no `--token` is provided, the CLI offers two options:

1. **Browser login (recommended)** — opens your browser for OAuth PKCE login via `auth.cognite.com`. Project and base URL are auto-detected from the JWT token claims.
2. **Paste token manually** — for CI environments or when you already have a bearer token.

After authentication, if the JWT contains `projects` and `aud` claims, the CLI pre-fills project name and base URL (you can still override them).

## Flags

| Flag | Description |
|------|-------------|
| `--token <token>` | CDF bearer token (skips auth prompt) |
| `--project <project>` | CDF project name |
| `--base-url <url>` | CDF cluster URL |
| `--data-model <space/id/version>` | Data model identifier (e.g. `"my-space/MyModel/1"`) |
| `--output <path>` | Output directory (default: `./generated`) |
| `--client-name <name>` | Pascal-case name for the client (default: derived from data model ID) |
| `--json-types <path>` | Path to a TypeScript file with JSON property type overrides (optional) |

When flags are omitted and no token is provided, the CLI falls back to interactive prompts. If `--token`, `--project`, and `--base-url` are provided but `--data-model` is not, the CLI connects to CDF and presents a fuzzy-searchable list of available data models.

## Example generated code

### types.ts

```ts
/* eslint-disable */
// DO NOT EDIT — this file is auto-generated
// Data model: my-space/MyDataModel v1
// Generated at: 2026-05-19T12:00:00.000Z
// industrial-model v0.2.0

import type { IndustrialModel, NodeId } from "industrial-model";

export type MyDataModelViewExternalId = "Equipment" | "Facility";

export type Equipment = IndustrialModel<{
  name: string;
  temperature?: number;
  facility?: NodeId;
}, {
  facility?: Facility;
}>;

export type Facility = IndustrialModel<{
  name: string;
  location: string;
}>;
```

### client.ts

```ts
/* eslint-disable */
// DO NOT EDIT — this file is auto-generated
// Data model: my-space/MyDataModel v1
// Generated at: 2026-05-19T12:00:00.000Z
// industrial-model v0.2.0

import type { CogniteClient } from "@cognite/sdk";
import { IndustrialModelClient, type DataModelId } from "industrial-model";
import type { MyDataModelQueryExecutor, MyDataModelViewExternalId } from "./types";

export const DATA_MODEL = {
  space: "my-space",
  externalId: "MyDataModel",
  version: "1",
} satisfies DataModelId;

export class MyDataModelClient {
  private readonly model: IndustrialModelClient;

  constructor(cogniteClient: CogniteClient) {
    this.model = new IndustrialModelClient(cogniteClient, DATA_MODEL);
  }

  query<TView extends MyDataModelViewExternalId>(
    viewExternalId: TView,
  ): MyDataModelQueryExecutor<TView> {
    // implementation omitted
  }
}

export function createMyDataModelClient(cogniteClient: CogniteClient) {
  const model = new MyDataModelClient(cogniteClient);

  return {
    model,
    equipment: {
      query: model.query("Equipment"),
      aggregate: model.aggregate("Equipment"),
      upsert: model.upsert("Equipment"),
      delete: (items) => model.delete(items),
    },
    facility: {
      query: model.query("Facility"),
      aggregate: model.aggregate("Facility"),
      upsert: model.upsert("Facility"),
      delete: (items) => model.delete(items),
    }
  };
}
```

## Using the generated client

```ts
import { CogniteClient } from '@cognite/sdk'
import { createMyDataModelClient } from './generated/MyDataModel'

const cognite = new CogniteClient({
  appId: 'my-app',
  project: 'my-project',
  baseUrl: 'https://az-eastus-1.cognitedata.com',
  oidcTokenProvider: () => getAccessToken(),
})

const client = createMyDataModelClient(cognite)

// Type-safe query with autocomplete on select, filters, and sort
const { items } = await client.equipment.query({
  select: { name: true, facility: { name: true } },
  filters: { name: { prefix: "Pump" } },
  sort: { name: "ascending" },
  limit: 50,
})

// items[0].name        — string
// items[0].facility    — { name: string } | undefined
```

## JSON property type overrides

By default, Cognite `json` (JSONObject) properties are generated as `unknown`. You can provide a TypeScript file that maps specific JSON properties to custom types, which the generator will copy into the generated `types.ts`.

### Usage

```bash
# Flag mode
npx industrial-model generate --json-types ./json-types.ts

# Interactive mode (defaults to json-types.ts)
npx industrial-model generate
# → "Path to JSON property type overrides file: (json-types.ts)"
```

### Example `json-types.ts`

```ts
export type SensorMetadata = {
  unit: string;
  precision: number;
  calibrationDate: string;
};

export type GeoCoordinates = {
  lat: number;
  lng: number;
  altitude?: number;
};

export const jsonPropertyTypes = [
  { space: "my_space", view: "Sensor", property: "metadata", type: "SensorMetadata" },
  { space: "my_space", view: "Sensor", property: "location", type: "GeoCoordinates" },
  { space: "my_space", view: "Facility", property: "coordinates", type: "GeoCoordinates" },
] as const;
```

### Rules

- Each entry in `jsonPropertyTypes` must have `space`, `view`, `property`, and `type` fields.
- `space` and `view` identify the Cognite view (by space and externalId). No version needed.
- `property` is the original property name in Cognite (not the camelCase field name).
- `type` must reference an exported type or interface from the same file.
- The referenced property must exist in the data model and be of type `json`. The generator will error otherwise.
- Types are copied verbatim into the generated `types.ts` — no import from the config file at runtime.
