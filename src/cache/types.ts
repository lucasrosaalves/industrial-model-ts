export interface CachePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type CacheResolverOptions<T> = {
  adapter?: CachePort;
  ttlMs?: number;
  /** Converts a resolved value into a JSON-safe representation before it is stored in the cache envelope. Defaults to the value itself. */
  serialize?: (value: T) => unknown;
  /** Converts a JSON-safe representation (produced by `serialize`) back into the resolved value. Defaults to a straight cast. */
  deserialize?: (json: unknown) => T;
};

export type CacheResolver<T> = {
  resolve(key: string, load: () => Promise<T>): Promise<T>;
  invalidate(key: string): Promise<void>;
};
