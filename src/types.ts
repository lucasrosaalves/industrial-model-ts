import type { NodeOrEdge } from "./cognite";

export type { NodeOrEdge };

export type NodeId = {
  externalId: string;
  space: string;
};
export type DataModelId = NodeId & {
  version: string;
};

export type SortDirection = "ascending" | "descending";

export type QueryResultMap = Record<string, NodeOrEdge[]>;

type SelectFor<T, TRelation = never> =
  T extends Array<infer U>
    ? boolean | (U extends object ? QuerySelect<U, TRelation> : never)
    : T extends object
      ? boolean | QuerySelect<T, TRelation>
      : boolean;

export type QuerySelect<T, TRelation = never> = { _all?: boolean } & ([TRelation] extends [never]
  ? { [K in keyof T]?: SelectFor<T[K], TRelation> }
  : { [K in Exclude<keyof T, keyof TRelation>]?: SelectFor<T[K], TRelation> }) &
  ([TRelation] extends [never]
    ? {}
    : { [K in keyof TRelation]?: SelectFor<TRelation[K], TRelation> });

type SortInput<T> = {
  [K in keyof T as T[K] extends string | number | boolean | Date | NodeId
    ? K
    : never]?: SortDirection;
};

export interface QueryOptions<T, TRelation = never> {
  viewExternalId: string;
  select?: QuerySelect<T, TRelation>;
  filters?: WhereInput<T, TRelation>;
  sortClauses?: SortInput<T>;
  limit?: number;
  cursor?: string | null;
}

export interface QueryResult {
  items: Record<string, unknown>[];
  cursor: string | null;
}

export type StringFilters = {
  eq?: string;
  in?: string[];
  prefix?: string;
  exists?: boolean;
};
export type NumberFilters = {
  eq?: number;
  in?: number[];
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  exists?: boolean;
};
export type BooleanFilters = { eq?: boolean; exists?: boolean };
export type DateFilters = {
  eq?: string;
  in?: string[];
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
  exists?: boolean;
};
export type NodeIdFilters = { eq?: NodeId; in?: NodeId[]; exists?: boolean };
export type SpaceFilters = { eq?: string; in?: string[]; exists?: boolean };
export type ListFilters<T> = {
  containsAny?: T[];
  containsAll?: T[];
  exists?: boolean;
};

type FilterFor<T, TRelation = never> = T extends NodeId
  ? NodeIdFilters
  : T extends string
    ? StringFilters
    : T extends number
      ? NumberFilters
      : T extends boolean
        ? BooleanFilters
        : T extends Date
          ? DateFilters
          : T extends Array<infer U>
            ? ListFilters<U>
            : T extends object
              ? NodeIdFilters | WhereInput<T, TRelation>
              : never;

export type WhereInput<T, TRelation = never> = {
  AND?: WhereInput<T, TRelation> | WhereInput<T, TRelation>[];
  OR?: WhereInput<T, TRelation>[];
  NOT?: WhereInput<T, TRelation> | WhereInput<T, TRelation>[];
} & ([TRelation] extends [never]
  ? { [K in keyof T]?: FilterFor<T[K], TRelation> }
  : { [K in Exclude<keyof T, keyof TRelation>]?: FilterFor<T[K], TRelation> }) &
  ([TRelation] extends [never]
    ? {}
    : {
        [K in keyof TRelation]?: FilterFor<TRelation[K], TRelation>;
      });
