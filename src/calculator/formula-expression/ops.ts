import type { BinaryOp, UnaryOp } from "./ast";
import { OverflowError, ZeroDivisionError } from "./exceptions";

export const UNARY_OPS: Record<UnaryOp, (value: number) => number> = {
  pos: (value) => value,
  neg: (value) => -value,
};

export const BINARY_OPS: Record<BinaryOp, (left: number, right: number) => number> = {
  add: (left, right) => left + right,
  sub: (left, right) => left - right,
  mul: (left, right) => left * right,
  div: (left, right) => {
    if (right === 0) {
      throw new ZeroDivisionError("float division by zero");
    }
    return left / right;
  },
  mod: signedMod,
  pow: safePow,
};

/** Remainder with the sign of the divisor, unlike JavaScript's ``%``. */
function signedMod(left: number, right: number): number {
  if (right === 0) {
    throw new ZeroDivisionError("float modulo");
  }
  return left - Math.floor(left / right) * right;
}

/**
 * Exponentiate in float space. Raising ``0`` to a negative power and
 * overflowing results are arithmetic errors rather than silent infinities.
 */
function safePow(base: number, exponent: number): number {
  if (base === 0 && exponent < 0) {
    throw new ZeroDivisionError("0.0 cannot be raised to a negative power");
  }
  const result = base ** exponent;
  if (!Number.isFinite(result) && Number.isFinite(base) && Number.isFinite(exponent)) {
    throw new OverflowError("(34, 'Numerical result out of range')");
  }
  return result;
}
