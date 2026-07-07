/**
 * Resultado tipado para casos de uso (éxito | fallo).
 * Sin dependencias de React, Supabase ni código legacy.
 */
export class Result {
  /**
   * @param {boolean} ok
   * @param {*} value
   * @param {Error|null} error
   */
  constructor(ok, value, error = null) {
    this.ok = ok;
    this.value = value;
    this.error = error;
  }

  /** @param {*} value */
  static ok(value) {
    return new Result(true, value, null);
  }

  /** @param {Error|string} error */
  static fail(error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return new Result(false, null, err);
  }

  /** @template T @param {(value: *) => T} fn */
  map(fn) {
    if (!this.ok) return this;
    try {
      return Result.ok(fn(this.value));
    } catch (e) {
      return Result.fail(e);
    }
  }

  /** @param {*} fallback */
  valueOr(fallback) {
    return this.ok ? this.value : fallback;
  }
}
