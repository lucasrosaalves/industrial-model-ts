---
"industrial-model": patch
---

Fix `datapoints.retrieve` for Cognite request limits: never forward `limit: -1` (use 10_000 per page instead), chunk time series into groups of 100, and cursor-paginate until all pages are collected when `limit` is `-1`.
