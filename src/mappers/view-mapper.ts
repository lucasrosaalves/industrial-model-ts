import type { CognitePort, ViewDefinition } from "../cognite";
import type { DataModelId } from "../types";

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
    return views;
  }
}
