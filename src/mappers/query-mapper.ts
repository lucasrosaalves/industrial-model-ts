import type {
  FilterDefinition,
  InstancesQueryRequest,
  QueryNodeTableExpression,
  QuerySelectExpression,
  QueryTableExpression,
  TableExpressionFilter,
  ViewDefinition,
  ViewReference,
} from "../cognite";
import { DEFAULT_LIMIT, EDGE_MARKER, MAX_LIMIT, NESTED_SEP } from "../constants";
import type { QueryOptions, QuerySelect } from "../types";
import { FilterMapper } from "./filter-mapper";
import { QueryValidator } from "./query-validator";
import { SortMapper } from "./sort-mapper";
import {
  buildSelect,
  getDirectRelationSource,
  isEdgeConnection,
  isReverseDirectRelation,
  isViewPropertyDefinition,
  toViewReference,
} from "./utils";
import type { ViewMapper } from "./view-mapper";

export class QueryMapper {
  private readonly filterMapper: FilterMapper;
  private readonly sortMapper: SortMapper;
  private readonly validator: QueryValidator;

  constructor(private readonly viewMapper: ViewMapper) {
    this.filterMapper = new FilterMapper(viewMapper);
    this.sortMapper = new SortMapper();
    this.validator = new QueryValidator(viewMapper);
  }

  async map<TModel>(options: QueryOptions<TModel>): Promise<InstancesQueryRequest> {
    const {
      viewExternalId,
      select = { _all: true },
      filters,
      sort = {},
      limit: requestedLimit = DEFAULT_LIMIT,
      cursor = null,
    } = options;
    const limit = requestedLimit === -1 ? DEFAULT_LIMIT : requestedLimit;

    const rootView = await this.viewMapper.getView(viewExternalId);
    await this.validator.validate(options, rootView);
    const rootViewRef = toViewReference(rootView);

    const whereFilters = filters
      ? await this.filterMapper.map(filters as Record<string, unknown>, rootView)
      : [];

    const baseFilters: FilterDefinition[] = [{ hasData: [rootViewRef] }, ...whereFilters];

    const withExprs: Record<string, QueryTableExpression> = {
      [viewExternalId]: {
        nodes: {
          filter: { and: baseFilters } as TableExpressionFilter,
        },
        sort: this.sortMapper.map(sort, rootView),
        limit,
      },
    };
    const selectExprs: Record<string, QuerySelectExpression | Record<string, never>> = {};

    const properties = await this.includeStatements(
      viewExternalId,
      rootView,
      select,
      withExprs,
      selectExprs,
    );

    selectExprs[viewExternalId] = buildSelect(rootViewRef, properties);

    const cursors: Record<string, string> = {};
    if (cursor != null) cursors[viewExternalId] = cursor;

    return { with: withExprs, select: selectExprs, cursors };
  }

  private async includeStatements<TModel>(
    key: string,
    view: ViewDefinition,
    select: QuerySelect<TModel>,
    withExprs: Record<string, QueryTableExpression>,
    selectExprs: Record<string, QuerySelectExpression | Record<string, never>>,
  ): Promise<string[]> {
    const selectProperties: string[] = [];
    const selectRecord = select as Record<string, boolean | object | undefined>;
    for (const [propertyName, property] of Object.entries(view.properties)) {
      const propertyKey = `${key}${NESTED_SEP}${propertyName}`;

      const canIncludeProperty = select._all === true || propertyName in select;
      if (!canIncludeProperty) {
        continue;
      }

      const relationToInclude =
        propertyName in select &&
        selectRecord[propertyName] != null &&
        typeof selectRecord[propertyName] === "object"
          ? selectRecord[propertyName]
          : null;
      if (isViewPropertyDefinition(property)) {
        const relSource = getDirectRelationSource(property);
        if (!relSource) {
          selectProperties.push(propertyName);
        } else {
          selectProperties.push(propertyName);
          const nestedView = await this.viewMapper.getView(relSource.externalId);
          const props =
            relationToInclude != null
              ? await this.includeStatements(
                  propertyKey,
                  nestedView,
                  relationToInclude,
                  withExprs,
                  selectExprs,
                )
              : [];
          if (props.length > 0) {
            (withExprs[propertyKey] as QueryNodeTableExpression) = {
              nodes: {
                from: key,
                direction: "outwards",
                through: { view: toViewReference(view), identifier: propertyName },
              },
              limit: MAX_LIMIT,
            };
            selectExprs[propertyKey] = buildSelect(relSource, props);
          }
        }
      } else if (isReverseDirectRelation(property) && relationToInclude != null) {
        const nestedView = await this.viewMapper.getView(property.source.externalId);
        const props = await this.includeStatements(
          propertyKey,
          nestedView,
          relationToInclude,
          withExprs,
          selectExprs,
        );
        if (!props.includes(property.through.identifier)) {
          props.push(property.through.identifier);
        }
        (withExprs[propertyKey] as QueryNodeTableExpression) = {
          nodes: {
            from: key,
            direction: "inwards",
            through: {
              source: property.through.source as ViewReference,
              identifier: property.through.identifier,
            },
          },
          limit: MAX_LIMIT,
        };
        selectExprs[propertyKey] = buildSelect(property.source, props);
      } else if (isEdgeConnection(property) && relationToInclude != null) {
        const edgePropertyKey = `${propertyKey}${NESTED_SEP}${EDGE_MARKER}`;

        withExprs[edgePropertyKey] = {
          edges: {
            from: key,
            maxDistance: 1,
            filter: {
              equals: { property: ["edge", "type"], value: property.type },
            } as TableExpressionFilter,
            direction: property.direction ?? "outwards",
          },
          limit: MAX_LIMIT,
        };
        (withExprs[propertyKey] as QueryNodeTableExpression) = {
          nodes: { from: edgePropertyKey },
          limit: MAX_LIMIT,
        };
        selectExprs[edgePropertyKey] = {};

        const nestedView = await this.viewMapper.getView(property.source.externalId);
        const props = await this.includeStatements(
          propertyKey,
          nestedView,
          relationToInclude,
          withExprs,
          selectExprs,
        );
        selectExprs[propertyKey] = buildSelect(property.source, props);
      }
    }

    return selectProperties;
  }
}
