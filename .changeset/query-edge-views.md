---
"industrial-model": minor
---

Add query support for edge-backed data model views. Edge-view results include selected properties and edge endpoints, including Cognite intrinsic edge `type`. Root edge queries support filtering and sorting by `startNode`, `endNode`, and `type`. Generated edge-view shortcuts are query-only; Core and generated `aggregate`/`upsert` accept node views only and reject edge views at runtime.
