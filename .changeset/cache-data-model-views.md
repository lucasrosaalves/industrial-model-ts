---
"industrial-model": minor
---

Cache the data model's views so they aren't refetched on every `IndustrialModelClient` instantiation. In browsers, views are cached in `sessionStorage` (scoped to the tab); elsewhere (Node.js, SSR) an in-process in-memory cache is used instead. Enabled by default; opt out with `useSessionCache: false`.
