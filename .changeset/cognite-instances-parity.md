---
"industrial-model": minor
---

Cognite Instances parity: list direct-relation and list primitive `groupBy`, multiple aggregates in one call. The singular `aggregate` option and `item.aggregate` result remain as aliases; prefer `aggregates`. Optional numeric properties are valid `avg`/`sum`/`min`/`max` keys.

Cognite Core types are generated from the Core fixture so enums and relations stay in sync with the model. Inward list reverse relations that Cognite cannot traverse are omitted.
