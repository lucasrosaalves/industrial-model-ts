---
"industrial-model": minor
---

Add `ViewMapperCache` so generated packages and `CogniteCoreClient` embed the data model schema at generation time. The client uses those cached views instead of fetching them from CDF at runtime. Enabled by default for the CLI; pass `--no-view-mapper-cache` to skip it.

**BREAKING:** remove `cache` and `cacheTtlMs` from `IndustrialModelClientOptions`. Use `viewMapperCache` (or a generated `VIEW_MAPPER_CACHE`) instead of a `CachePort` adapter.

