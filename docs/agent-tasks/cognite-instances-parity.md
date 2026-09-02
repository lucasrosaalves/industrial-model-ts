# Agent task: Cognite Instances parity in industrial-model

## Goal

Close gaps where **Cognite Data Modeling Instances** already supports a pattern, but **industrial-model** rejects or cannot express it — forcing consumers (e.g. `@bd/oee-sol` in isc-app) to call `@cognite/sdk` (`instances.aggregate` / `instances.query`) as an escape hatch.

After this work, those consumers should be able to express the same requests **through IM** and drop (or gate) the raw SDK paths.

Package today: **`industrial-model@0.14.0`**. Prefer an additive **minor** release.

---

## Consumer context (why this exists)

From OEE / Asset3DView Monitoring (`@bd/oee-sol`):

### Case A — Fault count + downtime duration per asset

**Cognite wire (works today):**

```json
{
  "view": { "type": "view", "space": "…", "externalId": "BaseEvent", "version": "…" },
  "instanceType": "node",
  "groupBy": ["assets"],
  "aggregates": [
    { "count": { "property": "externalId" } },
    { "sum": { "property": "duration" } }
  ],
  "filter": { "and": [ /* type = downtime, assets containsAny […], startTime range */ ] }
}
```

Semantics: Cognite **explodes** list direct relation `assets` so each referenced asset gets its own group row, with **both** count and sum on that row.

**IM today (fails):**

- `isGroupableProperty` returns `false` when `property.type.list === true` (`src/utils/view.ts`).
- Types: `GroupableValue` / `GroupByKey` exclude `NodeId[]` (`src/types.ts`).
- Mapper always emits `aggregates: [one]` (`src/mappers/aggregate-mapper.ts`).
- Result mapper only reads `item.aggregates[0]` (`src/mappers/aggregate-result-mapper.ts`).

### Case B — Latest BaseEvent per asset + `assetState.name` in one HTTP call

**Cognite wire (works today):** one `instances.query` with **many independent roots** in `with` (one branch per asset: `sort: startTime desc`, `limit: 1`, filter `assets contains` that asset + `startTime <= now`), plus chained branches to hydrate `assetState` → `State.name`.

**IM today (cannot express):**

- `QueryMapper.map` always builds **exactly one** root keyed by `viewExternalId` (`src/mappers/query-mapper.ts`).
- Nested `include` / relation branches are for **hydration from that single root**, not N independent filtered roots.

Fallback without IM change: **N×** `baseEvent.query({ limit: 1, … })`.

---

## Scope

### In scope (implement)

| # | Feature | Cognite capability | IM change |
|---|---------|----------------------|-----------|
| **1** | List direct-relation `groupBy` | `groupBy: ["assets"]` | Allow list **direct** relations in types + `isGroupableProperty` + validator |
| **1b** | List primitive `groupBy` | `groupBy: ["tags"]` | Allow list primitives (e.g. `text[]`); explode to scalar in `group` types |
| **2** | Multi-aggregate in one call | `aggregates: [count, sum, …]` | Accept multiple aggregate defs; map all; map all result values |

### Out of scope (do **not** implement in this pass unless user asks)

- Multi-root `instances.query` (`queryMany`) — removed; use N× `query()` or raw Cognite SDK for Case B.

- Nested filters through **reverse** relations (`contextList`, `comments`) — separate Cognite/mapper limitation.
- Nested filters on `EventContext.event.assets` / `event.startTime` (Recontextualization) — optional follow-up; see [Follow-up](#follow-up-optional).
- Rewriting `@bd/oee-sol` in isc-app (consumer migration is a separate repo).
- Changing Cognite view definitions / data model.

---

## Proposed public API (design, then implement)

Agents may refine names, but must keep **backward compatibility** for existing callers.

### 1–2 Aggregate (extend existing `aggregate()`)

**Preferred shape (additive):**

```ts
type AggregateOptions<TModel> = {
  viewExternalId: string;
  filters?: WhereInput<TModel>;
  groupBy?: AggregateGroupBy<TModel>; // now includes list direct relations (NodeId[])
  /** One or more Cognite aggregate ops (order preserved in the request and results). */
  aggregates?: readonly AggregateDefinition<TModel>[];
};
```

Rules:

- Provide at least one of `groupBy` or `aggregates` (same rule as today).
- Max groupBy fields: keep existing max **5** unless Cognite docs require otherwise.
- List `groupBy` for direct relations (`type.list === true`, `type.type === "direct"`) and primitive lists (`text[]`, numeric arrays, etc.) — Cognite explodes each list element into one group row.

**Result shape (additive):**

```ts
type AggregateResultItem<…> = {
  group?: GroupValues<…>;
  aggregates?: ReadonlyArray<AggregateValue<…>>;
};
```

**Example target call (consumer intent):**

```ts
await model.aggregate<BaseEvent>()({
  viewExternalId: "BaseEvent",
  groupBy: { assets: true },
  aggregates: [{ count: "externalId" }, { sum: "duration" }],
  filters: {
    /* assets containsAny, startTime, type, … */
  },
});
```

### 3 Multi-root query (out of scope — removed)

Multi-root `queryMany` was implemented briefly and **removed**. Case B (latest BaseEvent per asset in one HTTP call) still requires N× `query()` or raw `@cognite/sdk` `instances.query`.

---

## Files to touch (expected)

| Area | Files |
|------|--------|
| Types | `src/types.ts` |
| Groupable check | `src/utils/view.ts` |
| Aggregate map / validate / results | `src/mappers/aggregate-mapper.ts`, `src/mappers/aggregate-result-mapper.ts`, `src/validators/aggregate-validator.ts` |
| Query | `src/mappers/query-mapper.ts`, `src/client.ts` |
| Docs | `README.md` (Aggregation + Query sections) |
| Tests | `test/aggregate-*.test.ts`, `test/query-mapper.test.ts`, new tests for multi-root / multi-aggregate / list groupBy |
| Release | `.changeset/*.md` |

---

## Acceptance criteria

### Feature 1 — list `groupBy`

- [ ] TypeScript allows `groupBy: { assets: true }` when `assets` is `NodeId[]` on the model type.
- [ ] Runtime validator accepts list **direct** relations; still rejects non-groupable lists.
- [ ] Mapper emits Cognite `groupBy: ["assets"]` (property name string array — already the Cognite shape).
- [ ] Unit test covers the mapped request.
- [ ] README documents list-direct `groupBy` and Cognite explode semantics (one group row per referenced id).

### Feature 2 — multi-aggregate

- [ ] Caller can pass multiple ops; mapper emits `aggregates: […]` with all defs.
- [ ] Result mapper exposes **all** Cognite `item.aggregates[]` values (not only `[0]`).
- [ ] Legacy single `aggregate` option still typechecks and behaves as in 0.14.
- [ ] Unit tests for request + response mapping with count + sum together.
- [ ] README example with multiple aggregates + list `groupBy`.

### Feature 3 — multi-root query

- [x] **Removed** — `queryMany` is not part of the public API.

### Engineering

- [ ] `npm run check` passes.
- [ ] `npm run test:unit` passes.
- [ ] `npm run build` passes.
- [ ] Changeset added (minor): summarize Cognite parity features for consumers.

---

## Implementation order

1. **List `groupBy`** (types + `isGroupableProperty` + validator + tests) — smallest, unlocks Case A partially.
2. **Multi-aggregate** (options + mapper + result mapper + tests + README) — completes Case A.
3. Changeset + final README polish.

Commit only if the user asks; otherwise leave a clean working tree with the changes ready to review.

---

## Follow-up (optional)

Not required for the Leandro / oee-sol escape-hatch question, but related consumer pain:

- Allow nested filters / sort through **forward** direct relations on query/aggregate roots (e.g. `EventContext` filters on `event.assets` / `event.startTime`) when Cognite supports them — today IM/FilterMapper scope is documented as limited, and OEE Recontextualization lists BaseEvent ids then filters `EventContext` with `event in`.

Track separately if discovered while reading FilterMapper.

---

## How to run this agent

From `/home/michelnegrao/industrial-model-ts`:

1. Open this workspace in Cursor.
2. Instruct the agent: *Read `AGENTS.md` and execute `docs/agent-tasks/cognite-instances-parity.md`.*
3. Prefer implementing Features **1 → 2** with tests after each feature.
4. Multi-root query (`queryMany`) is **out of scope** — do not re-add unless the user explicitly requests it.

### Suggested first user prompt

```text
Read AGENTS.md and docs/agent-tasks/cognite-instances-parity.md.
Implement Feature 1 (list direct-relation groupBy) and Feature 2 (multi-aggregate)
with unit tests, README updates, and a minor changeset.
```
