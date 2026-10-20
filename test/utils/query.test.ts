import { describe, expect, it } from "vitest";
import type { InstancesQueryRequest, InstancesQueryResponse, NodeOrEdge } from "../../src/cognite";
import { MAX_LIMIT } from "../../src/constants";
import { getQueryForDependenciesPagination } from "../../src/utils/query";

const view = { type: "view", space: "sp", externalId: "Ticket", version: "v1" } as const;
const through = (identifier: string) => ({ source: view, identifier });

/** Ticket → membershipRequests (list direct relation) → person / group, like a nested select. */
const query: InstancesQueryRequest = {
  with: {
    Ticket: { nodes: { filter: { hasData: [view] } }, limit: 1000 },
    "Ticket|membershipRequests": {
      nodes: { from: "Ticket", through: through("membershipRequests") },
      limit: MAX_LIMIT,
    },
    "Ticket|membershipRequests|person": {
      nodes: { from: "Ticket|membershipRequests", through: through("person") },
      limit: MAX_LIMIT,
    },
    "Ticket|membershipRequests|group": {
      nodes: { from: "Ticket|membershipRequests", through: through("group") },
      limit: MAX_LIMIT,
    },
    "Ticket|requestedBy": {
      nodes: { from: "Ticket", through: through("requestedBy") },
      limit: MAX_LIMIT,
    },
  },
  select: {
    Ticket: {},
    "Ticket|membershipRequests": {},
    "Ticket|membershipRequests|person": {},
    "Ticket|membershipRequests|group": {},
    "Ticket|requestedBy": {},
  },
  cursors: { Ticket: "ticket-page-1" },
};

function rows(count: number): NodeOrEdge[] {
  return Array.from({ length: count }, () => ({}) as NodeOrEdge);
}

describe("getQueryForDependenciesPagination", () => {
  it("returns null when no nested expression filled a page", () => {
    const result: InstancesQueryResponse = {
      items: { Ticket: rows(394), "Ticket|membershipRequests": rows(20) },
      nextCursor: { "Ticket|membershipRequests": "mr-2" },
    };

    expect(getQueryForDependenciesPagination(query, result, "Ticket")).toBeNull();
  });

  it("keeps the root expression when only a nested expression has a next page", () => {
    // The root returned its last page, so it has no cursor: it must still be in `with`,
    // or the API rejects `Ticket|membershipRequests` ("undefined table expression 'Ticket'").
    const result: InstancesQueryResponse = {
      items: {
        Ticket: rows(394),
        "Ticket|membershipRequests": rows(MAX_LIMIT),
        "Ticket|membershipRequests|person": rows(40),
        "Ticket|membershipRequests|group": rows(30),
        "Ticket|requestedBy": rows(12),
      },
      nextCursor: { "Ticket|membershipRequests": "mr-2" },
    };

    const next = getQueryForDependenciesPagination(query, result, "Ticket");

    expect(Object.keys(next?.with ?? {}).sort()).toEqual([
      "Ticket",
      "Ticket|membershipRequests",
      "Ticket|membershipRequests|group",
      "Ticket|membershipRequests|person",
    ]);
    // The root only scopes the page; its rows were already returned.
    expect(Object.keys(next?.select ?? {}).sort()).toEqual([
      "Ticket|membershipRequests",
      "Ticket|membershipRequests|group",
      "Ticket|membershipRequests|person",
    ]);
    expect(next?.cursors).toEqual({
      Ticket: "ticket-page-1",
      "Ticket|membershipRequests": "mr-2",
    });
  });

  it("pages the deepest full expression and keeps every ancestor", () => {
    const result: InstancesQueryResponse = {
      items: {
        Ticket: rows(1000),
        "Ticket|membershipRequests": rows(MAX_LIMIT),
        "Ticket|membershipRequests|person": rows(MAX_LIMIT),
      },
      nextCursor: {
        Ticket: "ticket-page-2",
        "Ticket|membershipRequests": "mr-2",
        "Ticket|membershipRequests|person": "person-2",
      },
    };

    const next = getQueryForDependenciesPagination(query, result, "Ticket");

    expect(Object.keys(next?.with ?? {}).sort()).toEqual([
      "Ticket",
      "Ticket|membershipRequests",
      "Ticket|membershipRequests|person",
    ]);
    expect(Object.keys(next?.select ?? {})).toEqual(["Ticket|membershipRequests|person"]);
    expect(next?.cursors).toEqual({
      Ticket: "ticket-page-1",
      "Ticket|membershipRequests|person": "person-2",
    });
  });
});
