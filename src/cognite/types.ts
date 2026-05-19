import type { DataModelId, SortDirection } from "../types";

export interface ViewReference {
  type: "view";
  space: string;
  externalId: string;
  version: string;
}

export interface ViewPropertyType {
  type?: string;
  source?: ViewReference;
  list?: boolean;
}

export interface ViewPropertyDefinition {
  container: unknown;
  containerPropertyIdentifier: string;
  type: ViewPropertyType;
}

export interface ReverseDirectRelationConnection {
  through: { source: ViewReference; identifier: string };
  source: ViewReference;
  connectionType?: string;
  targetsList?: boolean;
}

export interface EdgeConnection {
  type: unknown;
  source: ViewReference;
  direction?: "outwards" | "inwards";
}

export type ViewDefinitionProperty =
  | ViewPropertyDefinition
  | ReverseDirectRelationConnection
  | EdgeConnection;

export interface ViewDefinition {
  space: string;
  externalId: string;
  version: string;
  properties: Record<string, ViewDefinitionProperty>;
}

export type FilterDefinition =
  | { and: FilterDefinition[] }
  | { or: FilterDefinition[] }
  | { not: FilterDefinition }
  | { equals: { property: string[]; value: string | number | boolean } }
  | { in: { property: string[]; values: (string | number | boolean)[] } }
  | {
      range: {
        property: string[];
        gt?: number | string;
        gte?: number | string;
        lt?: number | string;
        lte?: number | string;
      };
    }
  | { exists: { property: string[] } }
  | { prefix: { property: string[]; value: string } }
  | { containsAll: { property: string[]; values: (string | number | boolean)[] } }
  | { containsAny: { property: string[]; values: (string | number | boolean)[] } }
  | { nested: { scope: string[]; filter: FilterDefinition } }
  | { instanceReferences: Array<{ space: string; externalId: string }> }
  | { hasData: ViewReference[] };

export type TableExpressionFilter = FilterDefinition | { and: FilterDefinition[] };

export interface PropertySort {
  property: string[];
  direction: SortDirection;
  nullsFirst: boolean;
}

export interface QuerySelectExpression {
  sources?: Array<{ source: ViewReference; properties: string[] }>;
}

export interface QueryNodeTableExpression {
  nodes: {
    filter?: TableExpressionFilter;
    from?: string;
    direction?: "outwards" | "inwards";
    through?:
      | { view: ViewReference; identifier: string }
      | { source: ViewReference; identifier: string };
  };
  sort?: PropertySort[];
  limit?: number;
}

export interface QueryEdgeTableExpression {
  edges: {
    from: string;
    maxDistance?: number;
    filter?: TableExpressionFilter;
    direction?: "outwards" | "inwards";
  };
  limit?: number;
}

export type QueryTableExpression = QueryNodeTableExpression | QueryEdgeTableExpression;

export interface InstancesQueryRequest {
  with: Record<string, QueryTableExpression>;
  select: Record<string, QuerySelectExpression | Record<string, never>>;
  cursors?: Record<string, string>;
}

export interface NodeDefinition {
  instanceType: "node";
  version?: number;
  space: string;
  externalId: string;
  properties?: Record<string, Record<string, Record<string, unknown>>>;
  createdTime?: number;
  deletedTime?: number;
  lastUpdatedTime?: number;
}

export interface EdgeDefinition {
  instanceType: "edge";
  space: string;
  externalId: string;
  startNode: { space: string; externalId: string };
  endNode: { space: string; externalId: string };
}

export type NodeOrEdge = NodeDefinition | EdgeDefinition;

export interface InstancesQueryResponse {
  items: Record<string, NodeOrEdge[]>;
  nextCursor: Record<string, string>;
}

export interface InstancesSearchRequest {
  view: ViewReference;
  query: string;
  instanceType: "node";
  properties: string[];
  operator?: "OR" | "AND";
  filter?: FilterDefinition;
  limit?: number;
}

export interface InstancesSearchResponse {
  items: NodeOrEdge[];
}

export interface DataModelRetrieveItem {
  views?: ViewDefinition[];
  createdTime: number;
}

export interface DataModelRetrieveOptions {
  inlineViews?: boolean;
}

export type AggregateFunctionName = "avg" | "min" | "max" | "sum" | "count";

export type InstancesAggregateDefinition =
  | { avg: { property: string } }
  | { min: { property: string } }
  | { max: { property: string } }
  | { sum: { property: string } }
  | { count: { property?: string } };

export interface InstancesAggregateRequest {
  view: ViewReference;
  instanceType: "node";
  limit: number;
  filter?: FilterDefinition;
  groupBy?: string[];
  aggregates?: InstancesAggregateDefinition[];
}

export interface InstancesAggregateValue {
  aggregate: AggregateFunctionName;
  property?: string;
  value?: number;
}

export interface InstancesAggregateResultItem {
  aggregates: InstancesAggregateValue[];
  group?: Record<string, string | number | boolean | { space: string; externalId: string }>;
  instanceType: "node" | "edge";
}

export interface InstancesAggregateResponse {
  items: InstancesAggregateResultItem[];
}

export type { DataModelId };
