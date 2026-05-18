import type { InstancesQueryRequest, InstancesQueryResponse } from "../cognite";
import { EDGE_MARKER, MAX_LIMIT, NESTED_SEP } from "../constants";
import type { QueryResultMap } from "../types";

export function mapNodesAndEdges(
  queryResult: InstancesQueryResponse,
  _query: InstancesQueryRequest,
): QueryResultMap {
  return queryResult.items;
}

export function appendNodesAndEdges(
  initial: QueryResultMap,
  additional: QueryResultMap | null,
): QueryResultMap {
  if (!additional) return initial;

  for (const [key, items] of Object.entries(additional)) {
    const existing = initial[key];
    if (existing) {
      existing.push(...items);
    } else {
      initial[key] = [...items];
    }
  }

  return initial;
}

export function getQueryForDependenciesPagination(
  query: InstancesQueryRequest,
  queryResult: InstancesQueryResponse,
  viewExternalId: string,
): InstancesQueryRequest | null {
  const cursorKeys = new Set(Object.keys(queryResult.nextCursor));
  const { nodesParent, nodesChildren } = getParentAndChildrenNodes(cursorKeys);

  const leafCursors = getLeafCursors(queryResult, viewExternalId, nodesParent, nodesChildren);

  if (Object.keys(leafCursors).length === 0) {
    return null;
  }

  return buildDependenciesQuery(query, nodesParent, nodesChildren, leafCursors);
}

function getParentAndChildrenNodes(keys: Set<string>): {
  nodesParent: Map<string, Set<string>>;
  nodesChildren: Map<string, Set<string>>;
} {
  const nodesParent = new Map<string, Set<string>>();
  const nodesChildren = new Map<string, Set<string>>();

  for (const key of keys) {
    const keyParts = key.split(NESTED_SEP);
    const validParents = new Set<string>();

    for (let i = keyParts.length - 1; i > 0; i--) {
      const parentPath = keyParts.slice(0, i).join(NESTED_SEP);
      const parentWithEdgeMarker = `${parentPath}${NESTED_SEP}${EDGE_MARKER}`;

      if (keys.has(parentWithEdgeMarker)) {
        validParents.add(parentWithEdgeMarker);
        const children = nodesChildren.get(parentWithEdgeMarker) ?? new Set<string>();
        children.add(key);
        nodesChildren.set(parentWithEdgeMarker, children);
      }
      if (keys.has(parentPath)) {
        validParents.add(parentPath);
        const children = nodesChildren.get(parentPath) ?? new Set<string>();
        children.add(key);
        nodesChildren.set(parentPath, children);
      }
    }

    nodesParent.set(key, validParents);
  }

  return { nodesParent, nodesChildren };
}

function getLeafCursors(
  queryResult: InstancesQueryResponse,
  viewExternalId: string,
  nodesParent: Map<string, Set<string>>,
  nodesChildren: Map<string, Set<string>>,
): Record<string, string> {
  const targetCursors: Record<string, string> = {};
  const targetCursorKeys = new Set<string>();

  for (const [cursorKey, cursorValue] of Object.entries(queryResult.nextCursor)) {
    if (
      cursorKey === viewExternalId ||
      !cursorValue ||
      (queryResult.items[cursorKey]?.length ?? 0) !== MAX_LIMIT
    ) {
      continue;
    }

    const children = nodesChildren.get(cursorKey) ?? new Set<string>();
    let skipDueToChild = false;
    for (const c of children) {
      if (targetCursorKeys.has(c)) {
        skipDueToChild = true;
        break;
      }
    }
    if (skipDueToChild) continue;

    const parent = nodesParent.get(cursorKey) ?? new Set<string>();
    for (const key of parent) {
      if (targetCursorKeys.has(key)) {
        delete targetCursors[key];
        targetCursorKeys.delete(key);
      }
    }

    targetCursors[cursorKey] = cursorValue;
    targetCursorKeys.add(cursorKey);
  }

  return targetCursors;
}

function buildDependenciesQuery(
  previousQuery: InstancesQueryRequest,
  nodesParent: Map<string, Set<string>>,
  nodesChildren: Map<string, Set<string>>,
  leafCursors: Record<string, string>,
): InstancesQueryRequest {
  const withExprs: InstancesQueryRequest["with"] = {};
  const selectExprs: InstancesQueryRequest["select"] = {};
  const finalCursors: Record<string, string> = {};

  for (const [cursorKey, cursorValue] of Object.entries(leafCursors)) {
    const children = nodesChildren.get(cursorKey) ?? new Set<string>();
    const parent = nodesParent.get(cursorKey) ?? new Set<string>();
    const validKeys = new Set([...parent, ...children, cursorKey]);

    for (const [k, v] of Object.entries(previousQuery.with)) {
      if (validKeys.has(k)) withExprs[k] = v;
    }
    for (const [k, v] of Object.entries(previousQuery.select)) {
      if (validKeys.has(k)) selectExprs[k] = v;
    }
    for (const [k, v] of Object.entries(previousQuery.cursors ?? {})) {
      if (parent.has(k) && v) finalCursors[k] = v;
    }

    finalCursors[cursorKey] = cursorValue;
  }

  return { with: withExprs, select: selectExprs, cursors: finalCursors };
}
