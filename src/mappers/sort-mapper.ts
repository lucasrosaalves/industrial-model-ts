import type { PropertySort, ViewDefinition } from "../cognite";
import type { SortDirection } from "../types";
import { getPropertyRef, isDirectRelationWithSource } from "./utils";

export class SortMapper {
  map(sort: Record<string, SortDirection>, rootView: ViewDefinition): PropertySort[] {
    return Object.entries(sort).map(([property, direction]) => ({
      property: getPropertyRef(property, rootView),
      direction,
      nullsFirst: this.isNullsFirst(property, rootView, direction),
    }));
  }

  private isNullsFirst(property: string, view: ViewDefinition, direction: SortDirection): boolean {
    const prop = view.properties[property];
    if (prop && isDirectRelationWithSource(prop)) {
      return direction === "ascending";
    }
    return direction === "descending";
  }
}
