---
"industrial-model": minor
---

Align the calculator with the Python `industrial-model` (1.25.0 – 1.27.0):

- `sum(...)` / `average(...)` formulas: calculate per fetched point, then aggregate by the new `CalculatorQuery.bucketGranularity` (ratios of totals such as `sum({TTP}) / sum({NSP} * {RUNT})`). The fetch window is widened to the whole buckets Cognite returns for `[start, end)` in the given `timeZone`. Invalid or missing `bucketGranularity` throws the new `BucketGranularityError` before any retrieve; `evaluate()` rejects these formulas.
- New `fillValue` on time-series parameters: a missing point is filled instead of dropping the timestamp; multi-series parameters with `fillValue` combine on the union of their timestamps. Rejected with `alignment: "strict"`.
- Granularities accept quarters (`q`) and years (`y`), plus `t` for minutes.
- Fix: the calculator now sends an explicit per-series `limit` and keeps asking for a series while its page comes back full, so windows longer than one page are no longer truncated.
