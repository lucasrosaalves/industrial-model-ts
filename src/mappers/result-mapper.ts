import type {
  EdgeDefinition,
  NodeDefinition,
  ReverseDirectRelationConnection,
  ViewDefinition,
} from "../cognite";
import { EDGE_MARKER, NESTED_SEP } from "../constants";
import type { QueryResultMap } from "../types";
import {
  getDirectRelationSource,
  isEdgeConnection,
  isListDirectRelation,
  isReverseDirectRelation,
  isViewPropertyDefinition,
} from "../utils";
import type { ViewMapper } from "./view-mapper";

type ConnectionType = "DirectRelation" | "ReverseDirectRelation" | "Edge";

interface PropertyMapping {
  isList: boolean;
  connectionType: ConnectionType;
  nodes: Map<string, NodeDefinition[]>;
  edges: Map<string, EdgeDefinition[]>;
}

function nodeInstanceId(node: NodeDefinition): string {
  return `${node.space}:${node.externalId}`;
}

function getElementKeys(node: NodeDefinition, element: unknown): string[] {
  if (element && typeof element === "object" && !Array.isArray(element)) {
    const ref = element as Record<string, string>;
    return [`${ref.space ?? ""}:${ref.externalId ?? ""}`];
  }
  if (Array.isArray(element)) {
    return element
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const ref = item as Record<string, string>;
        return `${ref.space ?? ""}:${ref.externalId ?? ""}`;
      });
  }
  return [nodeInstanceId(node)];
}

function coerceToDate(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
}

function coerceTemporalProperties(view: ViewDefinition, properties: Record<string, unknown>): void {
  for (const [name, property] of Object.entries(view.properties)) {
    if (!isViewPropertyDefinition(property)) continue;
    const type = property.type.type;
    if (type !== "timestamp" && type !== "date") continue;

    const value = properties[name];
    if (value === undefined || value === null) continue;

    if (property.type.list === true) {
      if (Array.isArray(value)) {
        properties[name] = value.map(coerceToDate);
      }
      continue;
    }

    properties[name] = coerceToDate(value);
  }
}

export class QueryResultMapper {
  constructor(private readonly viewMapper: ViewMapper) {}

  async mapNodes(
    rootNode: string,
    queryResult: QueryResultMap,
  ): Promise<Record<string, unknown>[]> {
    if (!(rootNode in queryResult)) {
      throw new Error(`"${rootNode}" is not available in the query result`);
    }

    const rootView = await this.viewMapper.getView(rootNode);
    if (rootView.usedFor === "edge") {
      return this.mapRootEdges(rootNode, rootView, queryResult);
    }
    const values = await this.mapNodeProperty(rootNode, rootView, queryResult);
    if (!values) return [];

    return [...values.values()].flatMap((nodes) => nodes.map((n) => this.nodeToDict(n)));
  }

  private mapRootEdges(
    key: string,
    view: ViewDefinition,
    queryResult: QueryResultMap,
  ): Record<string, unknown>[] {
    const viewKey = `${view.externalId}/${view.version}`;
    const visited = new Set<string>();
    const result: Record<string, unknown>[] = [];

    for (const item of queryResult[key] ?? []) {
      if (item.instanceType !== "edge") continue;
      const edge = item as EdgeDefinition;
      const id = `${edge.space}:${edge.externalId}`;
      if (visited.has(id)) continue;
      visited.add(id);

      const properties = {
        ...(edge.properties?.[view.space]?.[viewKey] ?? {}),
      };
      coerceTemporalProperties(view, properties);
      result.push(
        this.edgeToDict({ ...edge, properties: { [view.space]: { [viewKey]: properties } } }),
      );
    }

    return result;
  }

  private async mapNodeProperty(
    key: string,
    view: ViewDefinition,
    queryResult: QueryResultMap,
    resultPropertyKey?: string,
  ): Promise<Map<string, NodeDefinition[]> | null> {
    if (!(key in queryResult)) return null;

    const mappings = await this.getPropertyMappings(key, view, queryResult);
    const viewKey = `${view.externalId}/${view.version}`;

    const visited = new Set<string>();
    const result = new Map<string, NodeDefinition[]>();

    for (const item of queryResult[key] ?? []) {
      if (item.instanceType !== "node") continue;
      const node = item as NodeDefinition;

      const id = nodeInstanceId(node);
      if (visited.has(id)) continue;
      visited.add(id);

      const spaceProps = node.properties?.[view.space];
      if (!spaceProps || !(viewKey in spaceProps)) continue;

      const properties: Record<string, unknown> = { ...(spaceProps[viewKey] ?? {}) };
      coerceTemporalProperties(view, properties);

      const getResultId = (): string => {
        if (!resultPropertyKey) return id;
        const entry = properties[resultPropertyKey];
        if (!entry || typeof entry !== "object") {
          throw new Error(`Invalid result property key "${resultPropertyKey}"`);
        }
        const ref = entry as Record<string, string>;
        return `${ref.space ?? ""}:${ref.externalId ?? ""}`;
      };

      const edgesMapping: Record<string, EdgeDefinition[]> = {};
      const resultId = getResultId();

      for (const [mappingKey, mapping] of Object.entries(mappings)) {
        const element = properties[mappingKey];
        const { isList, connectionType, nodes: mappingNodes, edges: mappingEdges } = mapping;

        if (element === undefined && connectionType === "DirectRelation") continue;

        const elementKeys = getElementKeys(node, element);
        const nodeEntries = elementKeys.flatMap((k) => mappingNodes.get(k) ?? []);

        if (nodeEntries.length === 0) {
          delete properties[mappingKey];
          continue;
        }

        const entryData = nodeEntries.map((n) => this.nodeToDict(n));
        properties[mappingKey] = isList ? entryData : entryData[0];

        const edgeEntries = elementKeys.flatMap((k) => mappingEdges.get(k) ?? []);
        if (edgeEntries.length > 0) edgesMapping[mappingKey] = edgeEntries;
      }

      properties._edges = edgesMapping;

      if (node.properties?.[view.space]) {
        node.properties[view.space] = {
          ...node.properties[view.space],
          [viewKey]: properties,
        };
      }

      const existing = result.get(resultId);
      if (existing) {
        existing.push(node);
      } else {
        result.set(resultId, [node]);
      }
    }

    return result;
  }

  private async getPropertyMappings(
    key: string,
    view: ViewDefinition,
    queryResult: QueryResultMap,
  ): Promise<Record<string, PropertyMapping>> {
    const mappings: Record<string, PropertyMapping> = {};

    for (const [propertyName, property] of Object.entries(view.properties)) {
      const propertyKey = `${key}${NESTED_SEP}${propertyName}`;

      let nodes: Map<string, NodeDefinition[]> | null = null;
      let edges: Map<string, EdgeDefinition[]> = new Map();
      let isList = false;
      let connectionType: ConnectionType = "DirectRelation";

      if (isViewPropertyDefinition(property)) {
        const source = getDirectRelationSource(property);
        if (source) {
          const nestedView = await this.viewMapper.getView(source.externalId);
          nodes = await this.mapNodeProperty(propertyKey, nestedView, queryResult);
          isList = isListDirectRelation(property);
          connectionType = "DirectRelation";
        }
      } else if (isReverseDirectRelation(property)) {
        const rel = property as ReverseDirectRelationConnection;
        const nestedView = await this.viewMapper.getView(rel.source.externalId);
        nodes = await this.mapNodeProperty(
          propertyKey,
          nestedView,
          queryResult,
          rel.through.identifier,
        );
        isList = rel.connectionType === "multi_reverse_direct_relation" || rel.targetsList === true;
        connectionType = "ReverseDirectRelation";
      } else if (isEdgeConnection(property)) {
        const nestedView = await this.viewMapper.getView(property.source.externalId);
        const [edgeNodes, edgeEdges] = await this.mapEdgeProperty(
          propertyKey,
          nestedView,
          queryResult,
          property.direction ?? "outwards",
        );
        nodes = edgeNodes;
        edges = edgeEdges ?? new Map();
        isList = true;
        connectionType = "Edge";
      }

      if (nodes !== null) {
        mappings[propertyName] = { isList, connectionType, nodes, edges };
      }
    }

    return mappings;
  }

  private async mapEdgeProperty(
    key: string,
    view: ViewDefinition,
    queryResult: QueryResultMap,
    edgeDirection: "outwards" | "inwards",
  ): Promise<[Map<string, NodeDefinition[]> | null, Map<string, EdgeDefinition[]> | null]> {
    const edgeKey = `${key}${NESTED_SEP}${EDGE_MARKER}`;
    if (!(key in queryResult) || !(edgeKey in queryResult)) return [null, null];

    const nodes = await this.mapNodeProperty(key, view, queryResult);
    if (!nodes) return [null, null];

    const visitedEdges = new Set<string>();
    const nodesResult = new Map<string, NodeDefinition[]>();
    const edgesResult = new Map<string, EdgeDefinition[]>();

    for (const item of queryResult[edgeKey] ?? []) {
      if (item.instanceType !== "edge") continue;
      const edge = item as EdgeDefinition;

      const edgeId = `${edge.space}:${edge.externalId}`;
      if (visitedEdges.has(edgeId)) continue;
      visitedEdges.add(edgeId);

      const entryKey =
        edgeDirection === "inwards"
          ? `${edge.endNode.space}:${edge.endNode.externalId}`
          : `${edge.startNode.space}:${edge.startNode.externalId}`;
      const nodeKey =
        edgeDirection === "inwards"
          ? `${edge.startNode.space}:${edge.startNode.externalId}`
          : `${edge.endNode.space}:${edge.endNode.externalId}`;

      const existingEdges = edgesResult.get(entryKey);
      if (existingEdges) existingEdges.push(edge);
      else edgesResult.set(entryKey, [edge]);

      const relatedNodes = nodes.get(nodeKey);
      if (relatedNodes) {
        const existingNodes = nodesResult.get(entryKey);
        if (existingNodes) existingNodes.push(...relatedNodes);
        else nodesResult.set(entryKey, relatedNodes.slice());
      }
    }

    return [nodesResult, edgesResult];
  }

  private nodeToDict(node: NodeDefinition): Record<string, unknown> {
    const { properties, ...rest } = node;
    const entry: Record<string, unknown> = { ...rest };

    for (const spaceProp of Object.values(properties ?? {})) {
      for (const viewProp of Object.values(spaceProp)) {
        Object.assign(entry, viewProp);
      }
    }

    return entry;
  }

  private edgeToDict(edge: EdgeDefinition): Record<string, unknown> {
    const { properties, ...rest } = edge;
    const entry: Record<string, unknown> = { ...rest };

    for (const spaceProp of Object.values(properties ?? {})) {
      for (const viewProp of Object.values(spaceProp)) {
        Object.assign(entry, viewProp);
      }
    }

    return entry;
  }
}
