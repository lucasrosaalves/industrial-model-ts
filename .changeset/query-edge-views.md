---
"industrial-model": minor
---

Add query support for edge-backed data model views. Edge-view results include selected properties and edge endpoints (including Cognite intrinsic edge `type` when validating results). Generated edge-view shortcuts are query-only; Core and generated `aggregate`/`upsert` accept node views only and reject edge views at runtime.
