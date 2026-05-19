import type { NodeDefinition, NodeOrEdge } from "./cognite";

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

export interface IndustrialModelClientOptions {
  validateResults?: boolean;
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Merge<A, B> = Simplify<Omit<A, keyof B> & B>;
type NonNull<T> = Exclude<T, null | undefined>;
type ArrayItem<T> = T extends readonly (infer U)[] ? U : never;
type QueryDepth = 0 | 1 | 2 | 3;
type PrevDepth = {
  0: 0;
  1: 0;
  2: 1;
  3: 2;
};

export const MODEL_RELATIONS = Symbol("industrial-model.relations");

export type IndustrialModel<TProps, TRelations = {}> = Simplify<
  TProps & { readonly [MODEL_RELATIONS]?: TRelations }
>;

export type ModelProps<TModel> = Simplify<Omit<TModel, typeof MODEL_RELATIONS>>;
export type ModelRelations<TModel> = TModel extends {
  readonly [MODEL_RELATIONS]?: infer TRelations;
}
  ? NonNull<TRelations>
  : never;

type RelationKeys<TModel> = [ModelRelations<TModel>] extends [never]
  ? never
  : keyof ModelRelations<TModel>;

type IsOptionalKey<T, K extends PropertyKey> = K extends keyof T
  ? {} extends Pick<T, K>
    ? true
    : false
  : false;

type UnwrapRelationTarget<T> =
  NonNull<T> extends readonly unknown[] ? ArrayItem<NonNull<T>> : NonNull<T>;

type BaseSelectFor<T, TDepth extends QueryDepth = 3> = [NonNull<T>] extends [NodeId]
  ? boolean
  : NonNull<T> extends readonly unknown[]
    ? [ArrayItem<NonNull<T>>] extends [NodeId]
      ? boolean
      : TDepth extends 0
        ? boolean
        : NonNull<ArrayItem<NonNull<T>>> extends object
          ? boolean | QuerySelect<NonNull<ArrayItem<NonNull<T>>>, PrevDepth[TDepth]>
          : boolean
    : TDepth extends 0
      ? boolean
      : NonNull<T> extends object
        ? boolean | QuerySelect<NonNull<T>, PrevDepth[TDepth]>
        : boolean;

type RelationSelectFor<T, TDepth extends QueryDepth = 3> = TDepth extends 0
  ? never
  : QuerySelect<UnwrapRelationTarget<T>, PrevDepth[TDepth]>;

type QuerySelectValue<TModel, K extends PropertyKey, TDepth extends QueryDepth> =
  K extends RelationKeys<TModel>
    ? K extends keyof ModelProps<TModel>
      ? boolean | RelationSelectFor<ModelRelations<TModel>[K], TDepth>
      : RelationSelectFor<ModelRelations<TModel>[K], TDepth>
    : K extends keyof ModelProps<TModel>
      ? BaseSelectFor<ModelProps<TModel>[K], TDepth>
      : never;

export type QuerySelect<TModel, TDepth extends QueryDepth = 3> = { _all?: true } & {
  [K in keyof ModelProps<TModel> | RelationKeys<TModel>]?: QuerySelectValue<TModel, K, TDepth>;
};

type SortInput<TModel> = {
  [K in keyof ModelProps<TModel> as NonNull<ModelProps<TModel>[K]> extends
    | string
    | number
    | boolean
    | Date
    | NodeId
    ? K
    : never]?: SortDirection;
};

export interface QueryOptions<
  TModel,
  TSelect extends QuerySelect<TModel> | undefined = QuerySelect<TModel> | undefined,
> {
  viewExternalId: string;
  select?: TSelect;
  filters?: WhereInput<TModel>;
  sort?: SortInput<TModel>;
  limit?: number;
  cursor?: string | null;
}

export type QueryResultMetadata = Pick<
  NodeDefinition,
  "space" | "externalId" | "version" | "createdTime" | "deletedTime" | "lastUpdatedTime"
>;

type ResultShapeForKey<TModel, K extends PropertyKey> = K extends keyof ModelProps<TModel>
  ? ModelProps<TModel>[K]
  : K extends RelationKeys<TModel>
    ? ModelRelations<TModel>[K]
    : never;

type ResultEntityForKey<TModel, K extends PropertyKey> =
  K extends RelationKeys<TModel>
    ? ModelRelations<TModel>[K]
    : K extends keyof ModelProps<TModel>
      ? ModelProps<TModel>[K]
      : never;

type WrapResultValue<TShape, TValue> = [NonNull<TShape>] extends [readonly unknown[]]
  ? TValue[]
  : TValue;

type AsQuerySelect<TModel, TSelect> = TSelect extends QuerySelect<TModel> ? TSelect : never;

type SelectedValue<
  TModel,
  K extends PropertyKey,
  TValue,
  TDepth extends QueryDepth,
> = TValue extends true
  ? K extends keyof ModelProps<TModel>
    ? ModelProps<TModel>[K]
    : never
  : TDepth extends 0
    ? never
    : TValue extends object
      ? WrapResultValue<
          ResultShapeForKey<TModel, K>,
          QueryResultItem<
            UnwrapRelationTarget<ResultEntityForKey<TModel, K>>,
            AsQuerySelect<UnwrapRelationTarget<ResultEntityForKey<TModel, K>>, TValue>,
            PrevDepth[TDepth]
          >
        >
      : never;

type ExplicitSelectionResult<TModel, TSelect, TDepth extends QueryDepth> = Simplify<
  {
    [K in keyof NonNull<TSelect> as K extends "_all"
      ? never
      : SelectedValue<TModel, K, NonNull<TSelect>[K], TDepth> extends never
        ? never
        : IsOptionalKey<ModelProps<TModel>, K> extends true
          ? never
          : IsOptionalKey<ModelRelations<TModel>, K> extends true
            ? never
            : K]-?: SelectedValue<TModel, K, NonNull<TSelect>[K], TDepth>;
  } & {
    [K in keyof NonNull<TSelect> as K extends "_all"
      ? never
      : SelectedValue<TModel, K, NonNull<TSelect>[K], TDepth> extends never
        ? never
        : IsOptionalKey<ModelProps<TModel>, K> extends true
          ? K
          : IsOptionalKey<ModelRelations<TModel>, K> extends true
            ? K
            : never]?: SelectedValue<TModel, K, NonNull<TSelect>[K], TDepth>;
  }
>;

export type QueryResultItem<
  TModel,
  TSelect extends QuerySelect<TModel> | undefined = undefined,
  TDepth extends QueryDepth = 3,
> = [TSelect] extends [undefined]
  ? Merge<QueryResultMetadata, ModelProps<TModel>>
  : Merge<
      TSelect extends { _all: true }
        ? Merge<QueryResultMetadata, ModelProps<TModel>>
        : QueryResultMetadata,
      ExplicitSelectionResult<TModel, TSelect, TDepth>
    >;

export interface QueryResult<TItem = Record<string, unknown>> {
  items: TItem[];
  cursor: string | null;
}

export type QueryExecutor<TModel> = {
  <const TSelect extends QuerySelect<TModel>>(
    options: Omit<QueryOptions<TModel, TSelect>, "select"> & {
      select: TSelect & QuerySelect<TModel>;
    },
  ): Promise<QueryResult<QueryResultItem<TModel, TSelect>>>;
  (
    options: Omit<QueryOptions<TModel, undefined>, "select"> & { select?: undefined },
  ): Promise<QueryResult<QueryResultItem<TModel, undefined>>>;
};

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

type BaseFilterFor<T> = T extends NodeId
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
              ? NodeIdFilters | WhereInput<T>
              : never;

type RelationFilterFor<T> =
  UnwrapRelationTarget<T> extends object ? WhereInput<UnwrapRelationTarget<T>> : never;

type QueryFilterValue<TModel, K extends PropertyKey> =
  K extends RelationKeys<TModel>
    ? K extends keyof ModelProps<TModel>
      ? BaseFilterFor<ModelProps<TModel>[K]> | RelationFilterFor<ModelRelations<TModel>[K]>
      : RelationFilterFor<ModelRelations<TModel>[K]>
    : K extends keyof ModelProps<TModel>
      ? BaseFilterFor<ModelProps<TModel>[K]>
      : never;

export type WhereInput<TModel> = {
  AND?: WhereInput<TModel> | WhereInput<TModel>[];
  OR?: WhereInput<TModel>[];
  NOT?: WhereInput<TModel> | WhereInput<TModel>[];
} & {
  [K in keyof ModelProps<TModel> | RelationKeys<TModel>]?: QueryFilterValue<TModel, K>;
};
