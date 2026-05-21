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
