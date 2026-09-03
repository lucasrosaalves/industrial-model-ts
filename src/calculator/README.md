# Calculator

The `industrial-model/calculator` subpath computes derived time series from formulas that combine a constant, a single Cognite time series (raw or aggregated), or several time series combined with a reducer. Each query pairs a `formula` with the `parameters` its `{alias}` placeholders resolve to. The calculator fetches every time-series parameter's datapoints in a single de-duplicated round trip, aligns them on timestamp, and evaluates the formula element-by-element.

The formula engine that powers it (`evaluate`) is also exported on its own, so you can evaluate formulas over in-memory numeric series without touching Cognite at all.

## Table of contents

- [Quick start](#quick-start)
- [Parameter kinds](#parameter-kinds)
- [Aggregated parameters](#aggregated-parameters)
- [Constants](#constants)
- [Multiple time series per parameter](#multiple-time-series-per-parameter)
- [Timestamp alignment](#timestamp-alignment)
- [Evaluating several queries at once](#evaluating-several-queries-at-once)
- [Real-world example: OEE](#real-world-example-oee)
- [The standalone formula engine](#the-standalone-formula-engine)
- [Supported operators](#supported-operators)
- [Rolling average](#rolling-average)
- [Error handling](#error-handling)
- [API reference](#api-reference)

## Quick start

```ts
import { CogniteClient } from "@cognite/sdk";
import { Calculator } from "industrial-model/calculator";

const cognite = new CogniteClient({ appId: "my-app", project: "my-project", /* ... */ });
const calculator = new Calculator(cognite);

const result = await calculator.calculate(
  {
    formula: "{power} / {flow} if {flow} != 0 else 0",
    parameters: [
      { type: "single_timeseries", timeSeries: { space: "ts-space", externalId: "power" }, alias: "power" },
      { type: "single_timeseries", timeSeries: { space: "ts-space", externalId: "flow" }, alias: "flow" },
    ],
  },
  new Date("2024-01-01T00:00:00.000Z"),
  new Date("2024-01-02T00:00:00.000Z"),
);

result.datapoints;
// [{ timestamp: Date, value: number }, …]
result.inputs;
// { power: DataPoint[], flow: DataPoint[] } — aligned series used by the formula
// result.inputs[alias][i] is the point used to compute result.datapoints[i]
```

Every parameter must include a `type` tag (`"constant"`, `"single_timeseries"`, or `"multi_timeseries"`). A JSON payload that omits `type` is rejected.

`result.query` is the exact `CalculatorQuery` that was passed in — handy when matching results back to their originating query after `calculateMultiples`. `result.inputs` is the aligned series that the formula actually evaluated: after retrieval, any `MultiTimeSeriesParameter` reduction, timestamp alignment, and constant broadcast. Each input series is a `DataPoint[]` sharing the same timestamps as `datapoints`; `inputs[alias][i]` is the point used to compute `datapoints[i]`. These series are already in memory at evaluation time, so returning them does not refetch from CDF.

Timestamps in the result come from the **shared time axis** of the query's time-series parameters. By default (`alignment: "intersect"`) that axis is the intersection of their timestamps: a point is emitted only when every time-series parameter has a value at that exact timestamp. Set `alignment: "strict"` to require identical timestamps and raise `ParameterTimestampError` if they differ. `ConstantParameter` values don't participate in this alignment — they are broadcast to the resulting length.

Parameters that share a time series (and granularity, for aggregates) are folded into a single request, so adding more parameters never triggers a duplicate fetch of the same series.

## Parameter kinds

`CalculatorParameter` is a discriminated union of three kinds, keyed on `type`:

| Kind | `type` tag | Fields | Notes |
|---|---|---|---|
| Constant | `"constant"` | `alias`, `value` | A fixed scalar, broadcast across every timestamp in the result. No CDF call is made for it. |
| Single time series | `"single_timeseries"` | `alias`, `timeSeries`, `aggregateType?`, `granularity?` | Exactly one CDF time series. |
| Multi time series | `"multi_timeseries"` | `alias`, `timeSeries` (≥ 2, unique), `reducer`, `aggregateType?`, `granularity?` | Two or more CDF time series, combined with `reducer`. `reducer` has no default. Duplicate instance ids are rejected. |

`CalculatorQuery` also takes `alignment?: "intersect" | "strict"` (default `"intersect"`). Every parameter's `alias` must be unique within the query — `calculate` rejects duplicates before it talks to Cognite.

Use `validateCalculatorQuery` to run the same checks on a payload you haven't passed to `Calculator` yet (for example a JSON body from an API).

## Aggregated parameters

Set `aggregateType` and `granularity` on a time-series parameter to fetch aggregates instead of raw datapoints. `granularity` is required whenever `aggregateType` is set:

```ts
const result = await calculator.calculate(
  {
    formula: "{maxTemp} - {avgTemp}",
    parameters: [
      { type: "single_timeseries", timeSeries: tempTs, aggregateType: "max", granularity: "1h", alias: "maxTemp" },
      { type: "single_timeseries", timeSeries: tempTs, aggregateType: "average", granularity: "1h", alias: "avgTemp" },
    ],
  },
  start,
  end,
);
```

Both parameters read the same time series at the same granularity, so the calculator issues one aggregate request that accumulates every aggregate its parameters ask for (`max` and `average`), rather than two separate requests.

Supported `aggregateType` values: `"average"`, `"max"`, `"min"`, `"count"`, `"sum"`, `"interpolation"`, `"stepInterpolation"`, `"totalVariation"`, `"continuousVariance"`, `"discreteVariance"`.

## Constants

Use a constant parameter for fixed values — conversion factors, thresholds, headcount for a shift — that don't come from a time series:

```ts
const result = await calculator.calculate(
  {
    formula: "{produced} * {lbsToKg}",
    parameters: [
      { type: "single_timeseries", timeSeries: producedTs, alias: "produced" },
      { type: "constant", alias: "lbsToKg", value: 0.453592 },
    ],
  },
  start,
  end,
);
```

`Calculator` never contacts CDF for a constant — its `value` is broadcast onto the timestamps established by the query's time-series parameters. A query made **only** of constants has no time axis to broadcast onto, and raises `MissingTimeAxisError`.

## Multiple time series per parameter

Use a multi-time-series parameter when a formula input is really an aggregation over several time series. It takes `timeSeries` (two or more) and a required `reducer`. The calculator fetches every listed time series and combines them **element-wise, by timestamp**, before the formula ever sees them:

```ts
const result = await calculator.calculate(
  {
    formula: "{lineTotal}",
    parameters: [
      {
        type: "multi_timeseries",
        alias: "lineTotal",
        timeSeries: [
          { space: "plant", externalId: "ts_line_1" },
          { space: "plant", externalId: "ts_line_2" },
          { space: "plant", externalId: "ts_line_3" },
        ],
        aggregateType: "sum",
        granularity: "1h",
        reducer: "sum",
      },
    ],
  },
  start,
  end,
);
```

If you only have one time series for a parameter, use `"single_timeseries"` instead — `"multi_timeseries"` requires at least two instance ids and rejects zero or one.

**Combining behavior:**

- Series are combined by **intersecting on timestamp**: a timestamp survives into the reduced series only if *every* referenced time series has a value at that exact timestamp. This is stricter than a positional zip — it won't silently pair up unrelated points if one series has a gap the others don't.
- Because of that, **use `aggregateType` + `granularity`** whenever you reduce multiple time series. Aggregated queries bucket every series onto the same aligned time grid, so timestamps line up; raw datapoints from independent series almost never share exact timestamps, and reducing raw series will typically collapse to an empty result.
- If the referenced series have no timestamps in common at all, the parameter's series — and therefore the formula's result — is empty.
- `reducer` is one of `"min"`, `"max"`, `"sum"`, `"average"`.

## Timestamp alignment

Element-wise formulas like `{A} + {B}` are evaluated on a single time axis. `CalculatorQuery.alignment` chooses how that axis is built from the query's time-series parameters (after any multi-series reduction):

| Mode | Behavior |
|---|---|
| `"intersect"` (default) | Keep timestamps present in **every** time-series parameter. Gaps in one series drop that timestamp from the result rather than failing the query. If there is no overlap, the result is empty. |
| `"strict"` | Require identical timestamps at every index. Raise `ParameterTimestampError` if they differ. Use this when a missing bucket should fail the job rather than be omitted. |

This is the same intersection rule used inside a multi-time-series parameter. Constants are broadcast onto whatever timestamps remain.

```ts
// default: evaluate only where A and B both have a point
{ formula: "{A} + {B}", parameters: [paramA, paramB] }

// fail if A and B don't share the exact same timestamps
{ formula: "{A} + {B}", parameters: [paramA, paramB], alignment: "strict" }
```

## Evaluating several queries at once

`calculateMultiples` batches the datapoint retrieval for several queries into one de-duplicated round trip, returning one `CalculationResult` per query, in order. Each query keeps its own `alignment`. Constants never reach Cognite.

```ts
const [efficiency, downtime] = await calculator.calculateMultiples(
  [
    {
      formula: "{good} / {total} * 100",
      parameters: [
        { type: "single_timeseries", timeSeries: goodUnitsTs, alias: "good" },
        { type: "single_timeseries", timeSeries: totalUnitsTs, alias: "total" },
      ],
    },
    {
      formula: "{plannedMinutes} - {runMinutes}",
      parameters: [
        { type: "single_timeseries", timeSeries: plannedMinutesTs, alias: "plannedMinutes" },
        { type: "single_timeseries", timeSeries: runMinutesTs, alias: "runMinutes" },
      ],
    },
  ],
  start,
  end,
);
```

If both queries happen to reference the same time series, it is still only fetched once — batching several KPI formulas for a shift report is a single network round trip regardless of how much overlap they have.

## Real-world example: OEE

Overall Equipment Effectiveness (`Availability × Performance × Quality`) is a good illustration of composing several formulas from a small set of shared inputs:

```ts
const line = { space: "ts-space", externalId: "line-42" };

const [availability, performance, quality, oee] = await calculator.calculateMultiples(
  [
    {
      // Availability = run time / planned production time
      formula: "{runTime} / {plannedTime}",
      parameters: [
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-run-time` }, alias: "runTime" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-planned-time` }, alias: "plannedTime" },
      ],
    },
    {
      // Performance = (total count * ideal cycle time) / run time
      formula: "({count} * {idealCycleTime}) / {runTime} if {runTime} != 0 else 0",
      parameters: [
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-count` }, alias: "count" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-ideal-cycle-time` }, alias: "idealCycleTime" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-run-time` }, alias: "runTime" },
      ],
    },
    {
      // Quality = good count / total count
      formula: "{good} / {count} if {count} != 0 else 0",
      parameters: [
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-good-count` }, alias: "good" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-count` }, alias: "count" },
      ],
    },
    {
      // OEE combines the three factors directly from their source series
      formula:
        "(({runTime} / {plannedTime}) * (({count} * {idealCycleTime}) / {runTime}) * ({good} / {count})) if ({runTime} != 0 and {count} != 0) else 0",
      parameters: [
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-run-time` }, alias: "runTime" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-planned-time` }, alias: "plannedTime" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-count` }, alias: "count" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-ideal-cycle-time` }, alias: "idealCycleTime" },
        { type: "single_timeseries", timeSeries: { ...line, externalId: `${line.externalId}-good-count` }, alias: "good" },
      ],
    },
  ],
  shiftStart,
  shiftEnd,
);
```

The four queries share `runTime`, `count`, `plannedTime`, `idealCycleTime`, and `good` across formulas, so `calculateMultiples` still fetches each underlying time series exactly once for the whole batch.

Constants combined with a reduced multi-series parameter — total plant output across three lines, converted and compared against a target:

```ts
const result = await calculator.calculate(
  {
    formula: "(({linesKg} * {kgToLbs}) / {targetLbs}) * 100",
    parameters: [
      {
        type: "multi_timeseries",
        alias: "linesKg",
        timeSeries: [
          { space: "plant", externalId: "ts_line_1" },
          { space: "plant", externalId: "ts_line_2" },
          { space: "plant", externalId: "ts_line_3" },
        ],
        aggregateType: "sum",
        granularity: "1h",
        reducer: "sum",
      },
      { type: "constant", alias: "kgToLbs", value: 2.20462 },
      { type: "constant", alias: "targetLbs", value: 5000 },
    ],
  },
  start,
  end,
);
```

## The standalone formula engine

`evaluate` runs the same formula engine over plain in-memory arrays, with no Cognite dependency:

```ts
import { evaluate } from "industrial-model/calculator";

evaluate("{A} + {B} * 2", { A: [1, 2, 3], B: [10, 20, 30] });
// [21, 42, 63]
```

This is useful for unit-testing a formula in isolation, or for evaluating a formula over data that didn't come from Cognite at all (e.g. values computed elsewhere in your pipeline):

```ts
const shiftGoodUnits = [980, 1010, 940];
const shiftTotalUnits = [1000, 1000, 1000];

const yieldPct = evaluate("{good} / {total} * 100", {
  good: shiftGoodUnits,
  total: shiftTotalUnits,
});
// [98, 101, 94]
```

`evaluate` compiles the formula text into an expression tree and caches it (up to 1024 entries) by its normalized text, so calling `evaluate` repeatedly with the same formula string — e.g. once per row or per incoming batch — does not re-parse it. Use `compileFormula` directly when you need the parsed formula's metadata, such as the list of parameters it references, without evaluating it yet:

```ts
import { compileFormula, clearCache } from "industrial-model/calculator";

const compiled = compileFormula("{setpoint} - {reading}");
compiled.variables; // ["setpoint", "reading"]

// Reset the compilation cache, e.g. between test cases
clearCache();
```

## Supported operators

- **Arithmetic:** `+` `-` `*` `/` `**` `%` (binary) and `+` `-` (unary)
- **Comparisons:** `==` `!=` `<` `<=` `>` `>=` (chained comparisons are supported, e.g. `0 <= {x} < 100`)
- **Boolean:** `and` `or`
- **Conditional:** `{A} / {B} if {B} != 0 else 0`
- **Functions:** `rolling_average(series, N)` — simple moving average of the last `N` aligned points; see [Rolling average](#rolling-average)

Comparisons, boolean operators, and conditionals are evaluated element-by-element, and only the selected branch runs for a given element — so a value-dependent failure (like division by zero) in an unselected branch never throws:

```ts
evaluate("{A} / {B} if {B} != 0 else -1", { A: [10, 20], B: [2, 0] });
// [5, -1]  — the {A} / {B} branch never runs for the second element
```

Modulo: the result takes the sign of the divisor (not JavaScript's `%`).

```ts
evaluate("{A} % {B}", { A: [-7], B: [3] }); // [2], not [-1]
```

## Rolling average

`rolling_average(series, N)` is a simple moving average over the last `N` aligned points. It is **count-based**, not time-based: `N` is a positive integer constant (literals and folded expressions like `12 * 2` or `6 / 2` are fine; a parameter `{WINDOW}` is not). The series argument can be any numeric sub-expression.

The result is **the same length as the inputs**. At the start of a series there are fewer than `N` points, so those indexes average whatever exists so far (index 0 is itself; the true `N`-point average starts at index `N - 1`). There are no NaNs and no dropped timestamps, so `inputs[alias][i]` still corresponds to `datapoints[i]`.

```ts
evaluate("rolling_average({A}, 3)", { A: [10, 20, 30, 40] });
// [10, 15, 20, 30]

evaluate("rolling_average({A}, 3) - {B}", {
  A: [10, 20, 30, 40],
  B: [1, 2, 3, 4],
});
// [9, 13, 17, 26]
```

This is not a CDF bucket aggregate (`aggregateType: "average"` + `granularity`) and not time-weighted. Hourly aggregates plus `rolling_average({TEMP}, 24)` is the 24-hour moving average of hourly values. For raw irregular points it is “last N aligned samples.”

`Calculator` still fetches `[start, end]` only. The first `N - 1` points in the result are a warmup; pass an earlier `start` if you need a full window at the beginning of the range you care about. Unknown function names, keyword arguments, starred arguments, and a non-constant or non-positive window still raise `InvalidFormulaError`.

A ternary (or `and`/`or`) around the **call** does not protect values inside the window. Once any element selects `rolling_average(...)`, the series argument is evaluated at every aligned index — so an unguarded `{A} / {B}` still raises if any `B` is 0. Put the guard **inside** the series argument. A call that is never selected does not run.

```ts
evaluate("rolling_average({A} / {B} if {B} != 0 else 0, 2)", {
  A: [10, 20, 30],
  B: [2, 0, 5],
});
// [5, 2.5, 3]  — the zero is replaced before the window sees it

evaluate("rolling_average({A} / {B}, 2) if {B} != 0 else 0", {
  A: [10, 20, 30],
  B: [2, 0, 5],
});
// throws ZeroDivisionError — the call runs at the first non-zero B,
// then the window evaluates {A} / {B} at every index

evaluate("rolling_average({A} / {B}, 2) if {C} > 0 else 0", {
  A: [10, 20],
  B: [0, 0],
  C: [0, 0],
});
// [0, 0]  — the call is never selected, so the zero divisor is not evaluated
```

```ts
evaluate("rolling_average({TEMP}, 24) - {SETPOINT}", {
  TEMP: [100, 110, 120, 130],
  SETPOINT: [105, 105, 110, 115],
});
// [-5, 0, 0, 0]
// rolling_average(TEMP, 24) with only 4 points is the expanding mean:
// [100, 105, 110, 115]
```

## Error handling

Every exception the package raises derives from `CalculatorError`, so `catch (error) { if (error instanceof CalculatorError) … }` catches the lot. `ArithmeticError` is deliberately **not** a `CalculatorError` — it depends on the data, not the formula.

```
CalculatorError
├── DatapointsRetrievalError
└── FormulaError
    ├── InvalidFormulaError
    ├── MissingParameterError
    └── ParameterError
        ├── ParameterLengthError
        ├── ParameterTimestampError
        └── MissingTimeAxisError
```

| Error | Raised when |
|---|---|
| `InvalidFormulaError` | The formula has invalid syntax, uses an unsupported operation, or calls an unknown function (including a non-constant or non-positive `rolling_average` window) |
| `MissingParameterError` | The formula references a `{alias}` that wasn't provided in `parameters` |
| `ParameterError` | A parameter value is not a valid numeric sequence |
| `ParameterLengthError` | Referenced parameters don't all share the same length. Direct `evaluate()` calls raise this; `Calculator` aligns on timestamps before calling `evaluate`. |
| `ParameterTimestampError` | A query with `alignment: "strict"` has time-series parameters that do not share the same timestamps at every index |
| `MissingTimeAxisError` | A query has parameters but none of them are time-series parameters, so there are no timestamps to broadcast its constants onto |
| `DatapointsRetrievalError` | Cognite returned datapoints the retriever cannot use (a short response, or non-numeric datapoints) |

Value-dependent arithmetic failures throw a subclass of `ArithmeticError` instead:

| Error | Raised when |
|---|---|
| `ZeroDivisionError` | Division or modulo by zero |
| `OverflowError` | Exponentiation overflows the floating-point range |

```ts
import { evaluate, MissingParameterError, ZeroDivisionError } from "industrial-model/calculator";

try {
  evaluate("{A} / {B}", { A: [1, 2, 3], B: [1, 0, 3] });
} catch (error) {
  if (error instanceof ZeroDivisionError) {
    // handle the zero division — note {A} / {B} has no `if` guard here,
    // so the zero at index 1 is not skipped
  }
}

try {
  evaluate("{A} + {C}", { A: [1, 2], B: [3, 4] });
} catch (error) {
  if (error instanceof MissingParameterError) {
    error.missing; // ["C"]
  }
}
```

When every referenced parameter is an empty series, the result is an empty array; a mix of empty and non-empty parameters is a length mismatch (`ParameterLengthError`). `Calculator` aligns on timestamps first, so a mix of empty and non-empty *time series* becomes an empty result under `"intersect"` rather than a length error.

## API reference

### `Calculator`

| Member | Description |
|---|---|
| `new Calculator(cognite: CogniteClient)` | Create a calculator backed by a Cognite client |
| `calculate(query, start, end): Promise<CalculationResult>` | Evaluate a single query over a time range |
| `calculateMultiples(queries, start, end): Promise<CalculationResult[]>` | Evaluate several queries in one de-duplicated round trip |

### Types

| Type | Description |
|---|---|
| `CalculatorQuery` | `{ formula: string; parameters: CalculatorParameter[]; alignment?: AlignmentMode }` |
| `CalculatorParameter` | Discriminated union of `ConstantParameter`, `TimeSeriesParameter`, `MultiTimeSeriesParameter` |
| `ConstantParameter` | `{ type: "constant"; alias: string; value: number }` |
| `TimeSeriesParameter` | `{ type: "single_timeseries"; timeSeries: NodeId; alias: string; aggregateType?: DatapointAggregate; granularity?: string }` |
| `MultiTimeSeriesParameter` | `{ type: "multi_timeseries"; timeSeries: NodeId[]; alias: string; reducer: ReducerType; aggregateType?: DatapointAggregate; granularity?: string }` |
| `ReducerType` | `"min" \| "max" \| "sum" \| "average"` |
| `AlignmentMode` | `"intersect" \| "strict"` |
| `CalculationResult` | `{ query: CalculatorQuery; datapoints: DataPoint[]; inputs: Record<string, DataPoint[]> }`. `query` is the originating query; `datapoints` has one `DataPoint` per aligned index; `inputs` is the aligned parameter series the formula evaluated (`inputs[alias][i]` was used to compute `datapoints[i]`). |
| `DataPoint` | `{ timestamp: Date; value: number }`. Used both for the formula result (`datapoints`) and for each aligned input series. |

### Validation

| Export | Description |
|---|---|
| `validateCalculatorQuery(query)` | Rejects a query the calculator cannot evaluate (duplicate aliases, missing `type`, aggregate without granularity, …) |
| `validateCalculatorQueries(queries)` | Same checks across a batch, reporting every problem |

### Formula engine

| Export | Description |
|---|---|
| `evaluate(formula, parameters): number[]` | Compile and evaluate a formula in one call |
| `compileFormula(formula): CompiledFormula` | Compile once, evaluate many times; exposes `.variables` and `.evaluate(parameters)` |
| `clearCache()` | Clear the internal compiled-formula cache |
