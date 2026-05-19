# Code Generator (CLI)

The `industrial-model` package includes a CLI that connects to Cognite Data Fusion, reads a data model's view definitions, and generates fully-typed TypeScript code.

## Generated output

For a data model with views `Equipment` and `Facility`, the CLI produces:

```
generated/MyDataModel/
├── models.ts    # IndustrialModel<Props, Relations> type aliases per view
├── client.ts    # createMyDataModelClient() factory with typed query methods
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

### models.ts

```ts
/* eslint-disable */
// DO NOT EDIT — this file is auto-generated
// Data model: my-space/MyDataModel v1
// Generated at: 2026-05-19T12:00:00.000Z
// industrial-model v0.2.0

import type { IndustrialModel, NodeId } from 'industrial-model'

export type Equipment = IndustrialModel<{
    name: string
    temperature?: number
    facility?: NodeId
}, {
    facility?: Facility
}>

export type Facility = IndustrialModel<{
    name: string
    location: string
}>
```

### client.ts

```ts
/* eslint-disable */
// DO NOT EDIT — this file is auto-generated
// Data model: my-space/MyDataModel v1
// Generated at: 2026-05-19T12:00:00.000Z
// industrial-model v0.2.0

import type { CogniteClient } from '@cognite/sdk'
import { IndustrialModelClient, type QueryOptions, type QuerySelect } from 'industrial-model'
import type { Equipment, Facility } from './models'

export function createMyDataModelClient(cogniteClient: CogniteClient) {
  const model = new IndustrialModelClient(cogniteClient, {
    space: "my-space",
    externalId: "MyDataModel",
    version: "1",
  })

  return {
    model,
    equipment: <const TSelect extends QuerySelect<Equipment> | undefined = undefined>(
      options?: Omit<QueryOptions<Equipment, TSelect>, 'viewExternalId'>
    ) => model.query<Equipment>()({ viewExternalId: "Equipment", ...options }),
    facility: <const TSelect extends QuerySelect<Facility> | undefined = undefined>(
      options?: Omit<QueryOptions<Facility, TSelect>, 'viewExternalId'>
    ) => model.query<Facility>()({ viewExternalId: "Facility", ...options }),
  }
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
  getToken: () => getAccessToken(),
})

const client = createMyDataModelClient(cognite)

// Type-safe query with autocomplete on select, filters, and sort
const { items } = await client.equipment({
  select: { name: true, facility: { name: true } },
  filters: { name: { prefix: "Pump" } },
  sort: { name: "ascending" },
  limit: 50,
})

// items[0].name        — string
// items[0].facility    — { name: string } | undefined
```
