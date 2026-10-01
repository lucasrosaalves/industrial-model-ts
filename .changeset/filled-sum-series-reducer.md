---
"industrial-model": patch
---

Align `SeriesReducer` filled sum with Python `industrial-model` 1.29.0: when combining multiple time series with `reducer: "sum"` and a `fillValue`, sum on the union of timestamps in one pass over datapoints instead of materializing the full union grid. Same results; much faster for many misaligned PLC series (e.g. scrap counts summed with `fillValue: 0`).
