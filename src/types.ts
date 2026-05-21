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

export type IndustrialModelClientOptions = {
  validateResults?: boolean;
};

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

export type QueryOptions<
  TModel,
  TSelect extends QuerySelect<TModel> | undefined = QuerySelect<TModel> | undefined,
> = {
  viewExternalId: string;
  select?: TSelect;
  filters?: WhereInput<TModel>;
  sort?: SortInput<TModel>;
  limit?: number;
  cursor?: string | null;
};

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

export type QueryResult<TItem = Record<string, unknown>> = {
  items: TItem[];
  cursor: string | null;
};

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

type GroupableValue<T> = [NonNull<T>] extends [NodeId]
  ? true
  : [NonNull<T>] extends [string | number | boolean]
    ? true
    : false;

export type GroupByKey<TModel> = {
  [K in keyof ModelProps<TModel>]: GroupableValue<ModelProps<TModel>[K]> extends true ? K : never;
}[keyof ModelProps<TModel>];

export type AggregateGroupBy<TModel> = {
  [K in GroupByKey<TModel>]?: true;
};

export type NumericKey<TModel> = {
  [K in keyof ModelProps<TModel>]: ModelProps<TModel>[K] extends number ? K : never;
}[keyof ModelProps<TModel>];

export type CountableKey<TModel> = GroupByKey<TModel> | "externalId" | "space";

export type AggregateDefinition<TModel> =
  | { avg: NumericKey<TModel> }
  | { min: NumericKey<TModel> }
  | { max: NumericKey<TModel> }
  | { sum: NumericKey<TModel> }
  | { count: CountableKey<TModel> | Record<string, never> };

type SelectedGroupKeys<TGroupBy> = Extract<
  {
    [K in keyof TGroupBy & string]: TGroupBy[K] extends true ? K : never;
  }[keyof TGroupBy & string],
  string
>;

export type GroupValues<TModel, TGroupBy extends AggregateGroupBy<TModel> | undefined> =
  TGroupBy extends AggregateGroupBy<TModel>
    ? Simplify<Pick<ModelProps<TModel>, SelectedGroupKeys<TGroupBy> & keyof ModelProps<TModel>>>
    : undefined;

export type AggregateValue<TDef> = TDef extends { avg: infer P extends PropertyKey }
  ? { property: P; value: number }
  : TDef extends { min: infer P extends PropertyKey }
    ? { property: P; value: number }
    : TDef extends { max: infer P extends PropertyKey }
      ? { property: P; value: number }
      : TDef extends { sum: infer P extends PropertyKey }
        ? { property: P; value: number }
        : TDef extends { count: infer P }
          ? Record<string, never> extends P
            ? { value: number }
            : { property: P; value: number }
          : never;

export type AggregateOptions<TModel> = {
  viewExternalId: string;
  filters?: WhereInput<TModel>;
  groupBy?: AggregateGroupBy<TModel>;
  aggregate?: AggregateDefinition<TModel>;
};

export type AggregateResultItem<
  TModel,
  TGroupBy extends AggregateGroupBy<TModel> | undefined = undefined,
  TAggregate extends AggregateDefinition<TModel> | undefined = undefined,
> = {
  group?: GroupValues<TModel, TGroupBy>;
  aggregate?: AggregateValue<TAggregate>;
};

export type AggregateResult<TItem = Record<string, unknown>> = {
  items: TItem[];
};

export type AggregateExecutor<TModel> = <const TOptions extends AggregateOptions<TModel>>(
  options: TOptions,
) => Promise<
  AggregateResult<AggregateResultItem<TModel, TOptions["groupBy"], TOptions["aggregate"]>>
>;

type RelationReferenceValue<T> = [NonNull<T>] extends [readonly unknown[]] ? NodeId[] : NodeId;
type NodeIdLike = { space: string; externalId: string };

type ArrayReferencePropertyKeys<TModel> = {
  [K in keyof ModelProps<TModel>]: [NonNull<ModelProps<TModel>[K]>] extends [readonly unknown[]]
    ? [ArrayItem<NonNull<ModelProps<TModel>[K]>>] extends [NodeIdLike]
      ? K
      : never
    : never;
}[keyof ModelProps<TModel>];

type ArrayRelationKeys<TModel> = {
  [K in RelationKeys<TModel>]: [NonNull<ModelRelations<TModel>[K]>] extends [readonly unknown[]]
    ? K
    : never;
}[RelationKeys<TModel>];

export type UpsertProperties<TModel> = Simplify<
  Partial<ModelProps<TModel>> & {
    [K in RelationKeys<TModel>]?: RelationReferenceValue<ModelRelations<TModel>[K]>;
  }
>;

export type UpsertNode<TModel> = Simplify<
  NodeId & Partial<Omit<UpsertProperties<TModel>, keyof NodeId>>
>;

export type EdgeCreationContext = {
  startNode: NodeId;
  endNode: NodeId;
  edgeType: NodeId;
};

export type EdgeCreationCallback = (context: EdgeCreationContext) => NodeId;
export type EdgeCreationCallbacks<TProperty extends string = string> = Partial<
  Record<TProperty, EdgeCreationCallback>
>;
export type OnEdgeCreation<TModel> = EdgeCreationCallbacks<
  Extract<ArrayReferencePropertyKeys<TModel> | ArrayRelationKeys<TModel>, string>
>;
export type EdgeMode = "append" | "replace";

export type UpsertOptions<TModel> = {
  viewExternalId: string;
  items: UpsertNode<TModel>[];
  onEdgeCreation?: OnEdgeCreation<TModel>;
  replace?: boolean;
  edgeMode?: EdgeMode;
};

export type UpsertResultItem = {
  instanceType: "node" | "edge";
  version?: number;
  wasModified?: boolean;
  space: string;
  externalId: string;
  createdTime?: number;
  lastUpdatedTime?: number;
};

export type UpsertResult = {
  items: UpsertResultItem[];
};

export type UpsertExecutor<TModel> = (options: UpsertOptions<TModel>) => Promise<UpsertResult>;

export type DeleteResultItem = Omit<UpsertResultItem, "instanceType"> & {
  instanceType: "node";
};

export type DeleteResult = {
  items: DeleteResultItem[];
};

export type DeleteExecutor = <TItem extends NodeId>(items: TItem[]) => Promise<DeleteResult>;

// ─── Datapoints ──────────────────────────────────────────────────────────────

export type DatapointAggregate =
  | "average"
  | "max"
  | "min"
  | "count"
  | "sum"
  | "interpolation"
  | "stepInterpolation"
  | "totalVariation"
  | "continuousVariance"
  | "discreteVariance";

export type RawDatapoint = {
  timestamp: Date;
  value: number;
};

export type DatapointSeriesResult = {
  timeSeries: NodeId;
  unit?: string;
  datapoints: RawDatapoint[];
  cursor: string | null;
};

export type DatapointsResult = {
  items: DatapointSeriesResult[];
};

export type DatapointsRetrieveOptions = {
  timeSeries: NodeId[];
  start?: Date;
  end?: Date;
  /** Number of datapoints to return per time series, or -1 to auto-paginate all pages. */
  limit?: number;
  aggregate?: DatapointAggregate;
  granularity?: string;
  includeOutsidePoints?: boolean;
  ignoreUnknownIds?: boolean;
  timeZone?: string;
};

export type DatapointsLatestSeries = NodeId & {
  before?: Date;
};

export type DatapointsLatestOptions = {
  timeSeries: DatapointsLatestSeries[];
  ignoreUnknownIds?: boolean;
};

export type DatapointsInsertItem = {
  timeSeries: NodeId;
  datapoints: Array<{ timestamp: Date; value: number }>;
};

export type DatapointsDeleteRange = {
  timeSeries: NodeId;
  start: Date;
  end?: Date;
};

export type DatapointsExecutor = {
  retrieve(options: DatapointsRetrieveOptions): Promise<DatapointsResult>;
  latest(options: DatapointsLatestOptions): Promise<DatapointsResult>;
  insert(items: DatapointsInsertItem[]): Promise<void>;
  delete(ranges: DatapointsDeleteRange[]): Promise<void>;
};

// ─── Files ────────────────────────────────────────────────────────────────────

export type FileUploadInfo = NodeId & {
  name: string;
  mimeType?: string;
  directory?: string;
  source?: string;
  metadata?: Record<string, string>;
};

export type FileUploadResult = NodeId & {
  name: string;
  uploaded: boolean;
  mimeType?: string;
  directory?: string;
  source?: string;
  uploadedTime?: Date;
  createdTime: Date;
  lastUpdatedTime: Date;
  uploadUrl?: string;
};

export type FileDownloadUrl = NodeId & {
  downloadUrl: string;
};

export type FilesExecutor = {
  upload(fileInfo: FileUploadInfo, content?: unknown): Promise<FileUploadResult>;
  getDownloadUrls(nodeIds: NodeId[]): Promise<FileDownloadUrl[]>;
};

export type SearchFilter = { query: string; operator?: "OR" | "AND" };

export type StringFilters = {
  eq?: string;
  in?: string[];
  prefix?: string;
  search?: SearchFilter;
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
} & (T extends string ? { search?: SearchFilter } : unknown);

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
