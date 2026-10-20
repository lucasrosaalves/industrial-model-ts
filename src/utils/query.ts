import type {
  InstancesQueryRequest,
  InstancesQueryResponse,
  QueryTableExpression,
} from "../cognite";
import { MAX_LIMIT } from "../constants";
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
  const { nodesParent, nodesChildren } = getParentAndChildrenNodes(query);

  const leafCursors = getLeafCursors(queryResult, viewExternalId, nodesParent, nodesChildren);

  if (Object.keys(leafCursors).length === 0) {
    return null;
  }

  return buildDependenciesQuery(query, nodesParent, nodesChildren, leafCursors);
}

/**
 * Ancestors and descendants of every table expression, following each expression's `from`.
 * Built from the query, not from the cursor keys: an ancestor with no next page has no cursor,
 * yet the follow-up query still needs it, or the API rejects the expressions that reference it.
 */
function getParentAndChildrenNodes(query: InstancesQueryRequest): {
  nodesParent: Map<string, Set<string>>;
  nodesChildren: Map<string, Set<string>>;
} {
  const nodesParent = new Map<string, Set<string>>();
  const nodesChildren = new Map<string, Set<string>>();

  for (const key of Object.keys(query.with)) {
    const ancestors = new Set<string>();
    let parent = getFrom(query.with[key]);

    while (parent !== undefined && parent in query.with && !ancestors.has(parent)) {
      ancestors.add(parent);
      const children = nodesChildren.get(parent) ?? new Set<string>();
      children.add(key);
      nodesChildren.set(parent, children);
      parent = getFrom(query.with[parent]);
    }

    nodesParent.set(key, ancestors);
  }

  return { nodesParent, nodesChildren };
}

function getFrom(expression: QueryTableExpression | undefined): string | undefined {
  if (!expression) return undefined;
  return "nodes" in expression ? expression.nodes.from : expression.edges.from;
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
    // Ancestors only scope the page: they run with the cursors of the current page and are not
    // selected again, so their rows are not returned twice.
    const selectedKeys = new Set([...children, cursorKey]);
    const validKeys = new Set([...parent, ...selectedKeys]);

    for (const [k, v] of Object.entries(previousQuery.with)) {
      if (validKeys.has(k)) withExprs[k] = v;
    }
    for (const [k, v] of Object.entries(previousQuery.select)) {
      if (selectedKeys.has(k)) selectExprs[k] = v;
    }
    for (const [k, v] of Object.entries(previousQuery.cursors ?? {})) {
      if (parent.has(k) && v) finalCursors[k] = v;
    }

    finalCursors[cursorKey] = cursorValue;
  }

  return { with: withExprs, select: selectExprs, cursors: finalCursors };
}
