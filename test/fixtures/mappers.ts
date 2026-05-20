import { AggregateMapper } from "../../src/mappers/aggregate-mapper";
import { FilterMapper } from "../../src/mappers/filter-mapper";
import { QueryMapper } from "../../src/mappers/query-mapper";
import { QueryResultMapper } from "../../src/mappers/result-mapper";
import { UpsertMapper } from "../../src/mappers/upsert-mapper";
import { ViewMapper } from "../../src/mappers/view-mapper";
import {
  COGNITE_CORE_DATA_MODEL,
  makeCogniteMock,
  type RetrieveDataModelsResponse,
} from "./cognite-core.js";

export function createViewMapper(response?: RetrieveDataModelsResponse): ViewMapper {
  return new ViewMapper(makeCogniteMock(response), COGNITE_CORE_DATA_MODEL);
}

export function createFilterMapper(response?: RetrieveDataModelsResponse): FilterMapper {
  return new FilterMapper(createViewMapper(response), makeCogniteMock(response));
}

export function createQueryMapper(response?: RetrieveDataModelsResponse): QueryMapper {
  return new QueryMapper(createViewMapper(response), makeCogniteMock(response));
}

export function createAggregateMapper(response?: RetrieveDataModelsResponse): AggregateMapper {
  return new AggregateMapper(createViewMapper(response), makeCogniteMock(response));
}

export function createUpsertMapper(response?: RetrieveDataModelsResponse): UpsertMapper {
  const cognite = makeCogniteMock(response);
  return new UpsertMapper(new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL), cognite);
}

export function createResultMapper(response?: RetrieveDataModelsResponse): QueryResultMapper {
  return new QueryResultMapper(createViewMapper(response));
}
