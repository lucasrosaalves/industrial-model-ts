# Cache

`ViewMapper` (used internally by `IndustrialModelClient`) loads a data model's view definitions from CDF once and memoizes them for as long as the mapper instance is alive. That in-process memoization is not a public API.

To avoid fetching views from CDF at all, pass a `ViewMapperCache` — typically the one the CLI embeds in generated packages:

```ts
import { IndustrialModelClient, ViewMapperCache } from "industrial-model";

const model = new IndustrialModelClient(client, dataModelId, {
  viewMapperCache: ViewMapperCache.fromViews(viewDumps),
});
```

Generated packages write `VIEW_MAPPER_CACHE` and pass it into `IndustrialModelClient` automatically. Pass `--no-view-mapper-cache` when generating if you want the client to load views from CDF instead.
