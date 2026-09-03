import type { PropertySort, ViewDefinition } from "../cognite";
import type { SortDirection } from "../types";
import { getPropertyRef } from "../utils";

export class SortMapper {
  map(
    sort: Record<string, SortDirection>,
    rootView: ViewDefinition,
    instanceType: "node" | "edge" = "node",
  ): PropertySort[] {
    return Object.entries(sort).map(([property, direction]) => ({
      property: getPropertyRef(property, rootView, instanceType),
      direction,
      nullsFirst: direction === "descending",
    }));
  }
}
