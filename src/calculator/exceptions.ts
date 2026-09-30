/**
 * Base error for every failure raised by the calculator.
 *
 * {@link FormulaError} and its subclasses derive from this, so a caller that
 * only wants to distinguish "the calculator failed" from "something else
 * failed" can catch this single type.
 */
export class CalculatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculatorError";
  }
}

/** Raised when Cognite returns datapoints the retriever cannot use. */
export class DatapointsRetrievalError extends CalculatorError {
  constructor(message: string) {
    super(message);
    this.name = "DatapointsRetrievalError";
  }
}

/**
 * Raised when a query's `bucketGranularity` does not fit its formula.
 *
 * A `sum(...)` / `average(...)` formula needs a known `bucketGranularity`
 * no finer than any aggregated parameter. Other formulas ignore it.
 */
export class BucketGranularityError extends CalculatorError {
  constructor(message: string) {
    super(message);
    this.name = "BucketGranularityError";
  }
}
