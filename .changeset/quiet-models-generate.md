---
"industrial-model": minor
---

Add the `industrial-model generate` CLI for generating typed data model clients from Cognite Data Fusion.

The generator supports interactive authentication, data model and version selection, reusable core view loading, and emits `types.ts`, `client.ts`, and `index.ts` files. Generated clients now follow the same class-based shape as the built-in Cognite Core client while also exposing per-view shortcuts for query, aggregate, upsert, and delete operations.
