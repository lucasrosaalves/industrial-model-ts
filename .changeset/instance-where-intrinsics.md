---
"industrial-model": minor
---

Add Cognite instance intrinsics to typed query filters and sort: filter by `externalId`, `space`, `createdTime`, and `lastUpdatedTime`; sort by `externalId` and `space`. Align validators with Cognite `instances.query` (no `deletedTime` filter; timestamps are not sortable).
