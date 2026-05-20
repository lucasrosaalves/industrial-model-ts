import type {
  CognitePort,
  EdgeConnection,
  EdgeDefinition,
  InstancesApplyDelete,
  InstancesApplyEdgeWrite,
  InstancesApplyNodeWrite,
  InstancesApplyRequest,
  InstancesQueryRequest,
  ReverseDirectRelationConnection,
  ViewDefinition,
} from "../cognite";
import type { EdgeCreationCallbacks, EdgeMode, NodeId, UpsertOptions } from "../types";
import {
  isEdgeConnection,
  isReverseDirectRelation,
  isViewPropertyDefinition,
  toViewReference,
} from "../utils";
import { UpsertValidator } from "../validators";
import type { ViewMapper } from "./view-mapper";

const IDENTITY_KEYS = new Set(["space", "externalId"]);
const EDGE_QUERY_LIMIT = 1000;

interface MappedItem {
  writes: Array<InstancesApplyNodeWrite | InstancesApplyEdgeWrite>;
  edgeReplacements: EdgeReplacementPlan[];
}

interface EdgeReplacementPlan {
  rootNode: NodeId;
  propertyName: string;
  property: EdgeConnection;
  desiredEdges: InstancesApplyEdgeWrite[];
}

export class UpsertMapper {
  private readonly validator = new UpsertValidator();

  constructor(
    private readonly viewMapper: ViewMapper,
    private readonly cognite: CognitePort,
  ) {}

  async map<TModel>(options: UpsertOptions<TModel>): Promise<InstancesApplyRequest> {
    const rootView = await this.viewMapper.getView(options.viewExternalId);
    this.validator.validate(options, rootView);

    const edgeMode = options.edgeMode ?? "append";
    const mappedItems = options.items.map((item) =>
      this.mapItem(item as Record<string, unknown>, rootView, options.onEdgeCreation, edgeMode),
    );
    const items = mappedItems.flatMap((item) => item.writes);
    const edgeReplacements = mappedItems.flatMap((item) => item.edgeReplacements);
    const deleteItems =
      edgeMode === "replace" ? await this.mapEdgeReplacementDeletes(edgeReplacements) : [];

    return {
      items,
      ...(deleteItems.length > 0 ? { delete: deleteItems } : {}),
      ...(options.replace === true ? { replace: true } : {}),
    };
  }

  private mapItem(
    item: Record<string, unknown>,
    rootView: ViewDefinition,
    onEdgeCreation: EdgeCreationCallbacks | undefined,
    edgeMode: EdgeMode,
  ): MappedItem {
    const node: NodeId = { space: item.space as string, externalId: item.externalId as string };
    const nodeProperties: Record<string, unknown> = {};
    const inferredItems: Array<InstancesApplyNodeWrite | InstancesApplyEdgeWrite> = [];
    const edgeReplacements: EdgeReplacementPlan[] = [];

    for (const [name, value] of Object.entries(item)) {
      if (IDENTITY_KEYS.has(name)) continue;

      const property = rootView.properties[name];
      if (!property) continue;

      if (isViewPropertyDefinition(property)) {
        nodeProperties[name] = normalizeViewPropertyValue(value, property);
      } else if (isReverseDirectRelation(property)) {
        inferredItems.push(...this.mapReverseDirectRelation(node, value, property));
      } else if (isEdgeConnection(property)) {
        const desiredEdges = this.mapEdgeConnection(node, name, value, property, onEdgeCreation);
        inferredItems.push(...desiredEdges);
        if (edgeMode === "replace") {
          edgeReplacements.push({ rootNode: node, propertyName: name, property, desiredEdges });
        }
      }
    }

    const applyNode: InstancesApplyNodeWrite = {
      instanceType: "node",
      ...node,
    };

    if (Object.keys(nodeProperties).length > 0) {
      applyNode.sources = [{ source: toViewReference(rootView), properties: nodeProperties }];
    }

    return { writes: [applyNode, ...inferredItems], edgeReplacements };
  }

  private async mapEdgeReplacementDeletes(
    replacements: EdgeReplacementPlan[],
  ): Promise<InstancesApplyDelete[]> {
    const deletes = await Promise.all(
      replacements.map(async (replacement) => {
        const existingEdges = await this.queryExistingEdges(replacement);
        const desiredEdgeKeys = new Set(replacement.desiredEdges.map((edge) => instanceKey(edge)));
        return existingEdges
          .filter((edge) => !desiredEdgeKeys.has(instanceKey(edge)))
          .map((edge) => ({
            instanceType: "edge" as const,
            space: edge.space,
            externalId: edge.externalId,
          }));
      }),
    );

    return uniqueDeletes(deletes.flat());
  }

  private async queryExistingEdges(replacement: EdgeReplacementPlan): Promise<EdgeDefinition[]> {
    const rootKey = `${replacement.propertyName}Root`;
    const edgeKey = `${replacement.propertyName}Edges`;
    const direction = replacement.property.direction ?? "outwards";
    const query: InstancesQueryRequest = {
      with: {
        [rootKey]: {
          nodes: {
            filter: {
              instanceReferences: [replacement.rootNode],
            },
          },
          limit: 1,
        },
        [edgeKey]: {
          edges: {
            from: rootKey,
            maxDistance: 1,
            direction,
            filter: {
              equals: { property: ["edge", "type"], value: replacement.property.type },
            } as never,
          },
          limit: EDGE_QUERY_LIMIT,
        },
      },
      select: {
        [rootKey]: {},
        [edgeKey]: {},
      },
    };

    const edges: EdgeDefinition[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.cognite.queryInstances({
        ...query,
        ...(cursor ? { cursors: { [edgeKey]: cursor } } : {}),
      });
      edges.push(
        ...(response.items[edgeKey] ?? []).filter(
          (item): item is EdgeDefinition => item.instanceType === "edge",
        ),
      );
      cursor = response.nextCursor[edgeKey];
    } while (cursor);

    return edges;
  }

  private mapReverseDirectRelation(
    node: NodeId,
    value: unknown,
    property: ReverseDirectRelationConnection,
  ): InstancesApplyNodeWrite[] {
    const targets = asNodeIdArray(value);

    return targets.map((target) => ({
      instanceType: "node",
      ...target,
      sources: [
        {
          source: property.through.source,
          properties: {
            [property.through.identifier]: normalizeReverseDirectRelationValue(node, property),
          },
        },
      ],
    }));
  }

  private mapEdgeConnection(
    node: NodeId,
    propertyName: string,
    value: unknown,
    property: EdgeConnection,
    onEdgeCreation: EdgeCreationCallbacks | undefined,
  ): InstancesApplyEdgeWrite[] {
    const direction = property.direction ?? "outwards";

    return asNodeIdArray(value).map((target) => {
      const startNode = direction === "inwards" ? target : node;
      const endNode = direction === "inwards" ? node : target;
      const edgeType = toNodeId(property.type, `edge type for "${propertyName}"`);
      const createEdgeId = onEdgeCreation?.[propertyName];

      if (!createEdgeId) {
        throw new Error(
          `Invalid upsert options:\n- onEdgeCreation.${propertyName}: required when ingesting edge connection "${propertyName}"`,
        );
      }

      const edgeId = createEdgeId({
        startNode,
        endNode,
        edgeType,
      });

      assertNodeId(edgeId, `onEdgeCreation(${propertyName})`);

      return {
        instanceType: "edge",
        ...edgeId,
        type: property.type,
        startNode,
        endNode,
      };
    });
  }
}

function normalizeReverseDirectRelationValue(
  node: NodeId,
  property: ReverseDirectRelationConnection,
): NodeId | NodeId[] {
  return property.targetsList === true ? [node] : node;
}

function normalizeViewPropertyValue(
  value: unknown,
  property: { type: { type?: string } },
): unknown {
  if (property.type.type !== "direct") return normalizePropertyValue(value);
  if (Array.isArray(value)) return value.map((item) => toNodeId(item));
  return toNodeId(value);
}

function normalizePropertyValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizePropertyValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizePropertyValue(nestedValue)]),
    );
  }
  return value;
}

function asNodeIdArray(value: unknown): NodeId[] {
  return Array.isArray(value) ? value.map((item) => toNodeId(item)) : [toNodeId(value)];
}

function toNodeId(value: unknown, label = "relation reference"): NodeId {
  if (
    !isPlainObject(value) ||
    typeof value.space !== "string" ||
    typeof value.externalId !== "string"
  ) {
    throw new Error(`Invalid upsert options:\n- ${label}: expected a NodeId`);
  }
  return { space: value.space, externalId: value.externalId };
}

function instanceKey(instance: NodeId): string {
  return `${instance.space}\0${instance.externalId}`;
}

function uniqueDeletes(deletes: InstancesApplyDelete[]): InstancesApplyDelete[] {
  const seen = new Set<string>();
  return deletes.filter((item) => {
    const key = instanceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertNodeId(value: unknown, label: string): asserts value is NodeId {
  if (
    !isPlainObject(value) ||
    typeof value.space !== "string" ||
    typeof value.externalId !== "string"
  ) {
    throw new Error(`Invalid upsert options:\n- ${label}: expected a NodeId`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
