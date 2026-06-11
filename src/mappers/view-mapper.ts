import type {
  CognitePort,
  ViewDefinition,
  ViewDefinitionProperty,
  ViewReference,
} from "../cognite";
import type { DataModelId } from "../types";
import {
  getDirectRelationSource,
  isEdgeConnection,
  isReverseDirectRelation,
  isViewPropertyDefinition,
} from "../utils/view";

export class ViewMapper {
  private cachePromise: Promise<Map<string, ViewDefinition>> | null = null;

  constructor(
    private readonly cognite: CognitePort,
    private readonly dataModelId: DataModelId,
  ) {}

  async getView(externalId: string): Promise<ViewDefinition> {
    const views = await this.loadViews();
    const view = views.get(externalId);
    if (!view) {
      throw new Error(
        `View "${externalId}" not found in data model "${this.dataModelId.externalId}"`,
      );
    }
    return view;
  }

  async getViews(): Promise<ViewDefinition[]> {
    const views = await this.loadViews();
    return Array.from(views.values());
  }

  private loadViews(): Promise<Map<string, ViewDefinition>> {
    if (this.cachePromise == null) {
      this.cachePromise = this.fetchViews();
    }
    return this.cachePromise;
  }

  private async fetchViews(): Promise<Map<string, ViewDefinition>> {
    const response = await this.cognite.retrieveDataModels(
      [
        {
          space: this.dataModelId.space,
          externalId: this.dataModelId.externalId,
          version: this.dataModelId.version,
        },
      ],
      { inlineViews: true },
    );

    const dm = response.items.sort((a, b) => b.createdTime - a.createdTime)[0];
    if (!dm) {
      throw new Error(`Data model "${this.dataModelId.externalId}" not found`);
    }

    const views = new Map<string, ViewDefinition>();
    for (const view of dm.views ?? []) {
      views.set(view.externalId, view);
    }

    await this.loadDependencyViews(views);
    return views;
  }

  private async loadDependencyViews(views: Map<string, ViewDefinition>): Promise<void> {
    const pending = new Map<string, ViewReference>();

    for (const view of views.values()) {
      for (const property of Object.values(view.properties)) {
        for (const ref of collectPropertyRefs(property)) {
          if (!views.has(ref.externalId) && !pending.has(ref.externalId)) {
            pending.set(ref.externalId, ref);
          }
        }
      }
    }

    if (pending.size === 0) return;

    const sizeBefore = views.size;
    const fetched = await this.cognite.retrieveViews(Array.from(pending.values()));
    for (const view of fetched.items) {
      views.set(view.externalId, view);
    }

    if (views.size > sizeBefore) {
      await this.loadDependencyViews(views);
    }
  }
}

function collectPropertyRefs(property: ViewDefinitionProperty): ViewReference[] {
  if (isViewPropertyDefinition(property)) {
    const source = getDirectRelationSource(property);
    return source ? [source] : [];
  }
  if (isReverseDirectRelation(property)) {
    return [property.source, property.through.source];
  }
  if (isEdgeConnection(property)) {
    return [property.source];
  }
  return [];
}
