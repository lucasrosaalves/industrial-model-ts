import { describe, expect, it, vi } from "vitest";
import type { CognitePort } from "../src/cognite";
import { DatapointsMapper } from "../src/mappers/datapoints-mapper";
import { makeCogniteMock } from "./fixtures/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TS_A = { space: "ts-space", externalId: "temperature" };
const TS_B = { space: "ts-space", externalId: "pressure" };

function makeDatapointResponse(
  timeSeries: { space: string; externalId: string },
  overrides: Partial<{
    isString: boolean;
    datapoints: unknown[];
    nextCursor: string;
    unit: string;
  }> = {},
) {
  return {
    space: timeSeries.space,
    externalId: timeSeries.externalId,
    isString: overrides.isString ?? false,
    datapoints: overrides.datapoints ?? [],
    ...(overrides.nextCursor !== undefined ? { nextCursor: overrides.nextCursor } : {}),
    ...(overrides.unit !== undefined ? { unit: overrides.unit } : {}),
  };
}

function makeCogniteWithRetrieve(
  responses: unknown[],
  additionalResponses: unknown[][] = [],
): CognitePort {
  const mock = makeCogniteMock();
  const retrieveMock = vi.fn();
  retrieveMock.mockResolvedValueOnce({ items: responses });
  for (const next of additionalResponses) {
    retrieveMock.mockResolvedValueOnce({ items: next });
  }
  mock.retrieveDatapoints = retrieveMock;
  return mock;
}

function makeCogniteWithLatest(responses: unknown[]): CognitePort {
  const mock = makeCogniteMock();
  mock.retrieveLatestDatapoints = vi.fn().mockResolvedValue({ items: responses });
  return mock;
}

function makeMapper(cognite: CognitePort): DatapointsMapper {
  return new DatapointsMapper(cognite);
}

// ─── retrieve ────────────────────────────────────────────────────────────────

describe("DatapointsMapper.retrieve", () => {
  it("returns a single numeric series with datapoints and null cursor", async () => {
    const cognite = makeCogniteWithRetrieve([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 42 }],
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A] });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      timeSeries: TS_A,
      datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 42 }],
      cursor: null,
    });
  });

  it("returns multiple numeric series in one call", async () => {
    const cognite = makeCogniteWithRetrieve([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 10 }],
      }),
      makeDatapointResponse(TS_B, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 20 }],
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A, TS_B] });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.timeSeries).toEqual(TS_A);
    expect(result.items[0]?.datapoints[0]?.value).toBe(10);
    expect(result.items[1]?.timeSeries).toEqual(TS_B);
    expect(result.items[1]?.datapoints[0]?.value).toBe(20);
  });

  it("forwards cursor when response includes nextCursor", async () => {
    const cognite = makeCogniteWithRetrieve([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 1 }],
        nextCursor: "next-token",
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A] });

    expect(result.items[0]?.cursor).toBe("next-token");
  });

  it("includes unit in result when present in the response", async () => {
    const cognite = makeCogniteWithRetrieve([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 37.5 }],
        unit: "°C",
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A] });

    expect(result.items[0]?.unit).toBe("°C");
  });

  it("omits unit from result when not present in the response", async () => {
    const cognite = makeCogniteWithRetrieve([makeDatapointResponse(TS_A)]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A] });

    expect(result.items[0]).not.toHaveProperty("unit");
  });

  it("returns empty items list when response has no series", async () => {
    const cognite = makeCogniteWithRetrieve([]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [] });

    expect(result.items).toHaveLength(0);
  });

  it("excludes string time series from results", async () => {
    const cognite = makeCogniteWithRetrieve([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 10 }],
      }),
      makeDatapointResponse(TS_B, { isString: true }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A, TS_B] });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.timeSeries.externalId).toBe("temperature");
  });

  it("maps aggregate datapoints using each supported aggregate type", async () => {
    const aggregates = [
      "max",
      "min",
      "sum",
      "count",
      "interpolation",
      "stepInterpolation",
    ] as const;

    for (const agg of aggregates) {
      const cognite = makeCogniteWithRetrieve([
        {
          ...makeDatapointResponse(TS_A),
          datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), [agg]: 55 }],
        },
      ]);
      const mapper = makeMapper(cognite);

      const result = await mapper.retrieve({
        timeSeries: [TS_A],
        aggregate: agg,
        granularity: "1h",
      });

      expect(result.items[0]?.datapoints[0]?.value).toBe(55);
    }
  });

  it("defaults aggregate value to 0 when the aggregate field is absent in the response", async () => {
    const cognite = makeCogniteWithRetrieve([
      {
        ...makeDatapointResponse(TS_A),
        // no "average" field → should default to 0
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z") }],
      },
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({
      timeSeries: [TS_A],
      aggregate: "average",
      granularity: "1h",
    });

    expect(result.items[0]?.datapoints[0]?.value).toBe(0);
  });

  it("forwards start, end, limit, granularity, includeOutsidePoints, ignoreUnknownIds, timeZone to Cognite", async () => {
    const cognite = makeCogniteWithRetrieve([]);
    const mapper = makeMapper(cognite);

    const options = {
      timeSeries: [TS_A],
      start: new Date("2024-01-01T00:00:00.000Z"),
      end: new Date("2024-01-02T00:00:00.000Z"),
      limit: 500,
      aggregate: "average" as const,
      granularity: "5m",
      includeOutsidePoints: true,
      ignoreUnknownIds: true,
      timeZone: "Europe/Oslo",
    };
    await mapper.retrieve(options);

    expect(cognite.retrieveDatapoints).toHaveBeenCalledWith(
      expect.objectContaining({
        start: options.start,
        end: options.end,
        limit: 500,
        aggregates: ["average"],
        granularity: "5m",
        includeOutsidePoints: true,
        ignoreUnknownIds: true,
        timeZone: "Europe/Oslo",
        items: [{ space: TS_A.space, externalId: TS_A.externalId }],
      }),
    );
  });

  it("does not include aggregates in the Cognite call when no aggregate is specified", async () => {
    const cognite = makeCogniteWithRetrieve([]);
    const mapper = makeMapper(cognite);

    await mapper.retrieve({ timeSeries: [TS_A] });

    const call = vi.mocked(cognite.retrieveDatapoints).mock.calls[0]?.[0];
    expect(call).not.toHaveProperty("aggregates");
  });

  it("throws on invalid start date before calling Cognite", async () => {
    const cognite = makeCogniteMock();
    const mapper = makeMapper(cognite);

    await expect(
      mapper.retrieve({ timeSeries: [TS_A], start: new Date("not-a-date") }),
    ).rejects.toThrow(/Invalid datapoints options.*\bstart\b/s);

    expect(cognite.retrieveDatapoints).not.toHaveBeenCalled();
  });

  it("throws on invalid end date before calling Cognite", async () => {
    const cognite = makeCogniteMock();
    const mapper = makeMapper(cognite);

    await expect(mapper.retrieve({ timeSeries: [TS_A], end: new Date("invalid") })).rejects.toThrow(
      /Invalid datapoints options.*\bend\b/s,
    );

    expect(cognite.retrieveDatapoints).not.toHaveBeenCalled();
  });
});

// ─── auto-pagination (limit: -1) ─────────────────────────────────────────────

describe("DatapointsMapper.retrieve (auto-pagination)", () => {
  it("makes a single call when no series returns a nextCursor", async () => {
    const cognite = makeCogniteWithRetrieve([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 1 }],
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A], limit: -1 });

    expect(cognite.retrieveDatapoints).toHaveBeenCalledTimes(1);
    expect(result.items[0]?.cursor).toBeNull();
  });

  it("accumulates datapoints across all pages until cursors are exhausted", async () => {
    const cognite = makeCogniteWithRetrieve(
      [
        makeDatapointResponse(TS_A, {
          datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 1 }],
          nextCursor: "page-2",
        }),
      ],
      [
        [
          makeDatapointResponse(TS_A, {
            datapoints: [{ timestamp: new Date("2024-01-01T01:00:00.000Z"), value: 2 }],
            nextCursor: "page-3",
          }),
        ],
        [
          makeDatapointResponse(TS_A, {
            datapoints: [{ timestamp: new Date("2024-01-01T02:00:00.000Z"), value: 3 }],
          }),
        ],
      ],
    );
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A], limit: -1 });

    expect(cognite.retrieveDatapoints).toHaveBeenCalledTimes(3);
    expect(result.items[0]?.datapoints).toEqual([
      { timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 1 },
      { timestamp: new Date("2024-01-01T01:00:00.000Z"), value: 2 },
      { timestamp: new Date("2024-01-01T02:00:00.000Z"), value: 3 },
    ]);
    expect(result.items[0]?.cursor).toBeNull();
  });

  it("continues paginating only series that still have a cursor", async () => {
    // TS_A finishes on page 1, TS_B needs page 2
    const cognite = makeCogniteWithRetrieve(
      [
        makeDatapointResponse(TS_A, {
          datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 10 }],
        }),
        makeDatapointResponse(TS_B, {
          datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 20 }],
          nextCursor: "ts-b-page-2",
        }),
      ],
      [
        [
          makeDatapointResponse(TS_B, {
            datapoints: [{ timestamp: new Date("2024-01-01T01:00:00.000Z"), value: 21 }],
          }),
        ],
      ],
    );
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieve({ timeSeries: [TS_A, TS_B], limit: -1 });

    expect(cognite.retrieveDatapoints).toHaveBeenCalledTimes(2);
    // Second call should only include TS_B with its cursor
    expect(vi.mocked(cognite.retrieveDatapoints).mock.calls[1]?.[0].items).toEqual([
      expect.objectContaining({ externalId: "pressure", cursor: "ts-b-page-2" }),
    ]);

    const tsA = result.items.find((i) => i.timeSeries.externalId === "temperature");
    const tsB = result.items.find((i) => i.timeSeries.externalId === "pressure");
    expect(tsA?.datapoints).toHaveLength(1);
    expect(tsB?.datapoints).toHaveLength(2);
    expect(tsB?.cursor).toBeNull();
  });
});

// ─── retrieveLatest ───────────────────────────────────────────────────────────

describe("DatapointsMapper.retrieveLatest", () => {
  it("maps a single series with a before date", async () => {
    const before = new Date("2024-01-02T00:00:00.000Z");
    const cognite = makeCogniteWithLatest([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T23:59:59.000Z"), value: 99 }],
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieveLatest({
      timeSeries: [{ ...TS_A, before }],
    });

    expect(cognite.retrieveLatestDatapoints).toHaveBeenCalledWith(
      [{ space: TS_A.space, externalId: TS_A.externalId, before }],
      undefined,
    );
    expect(result.items[0]).toEqual({
      timeSeries: TS_A,
      datapoints: [{ timestamp: new Date("2024-01-01T23:59:59.000Z"), value: 99 }],
      cursor: null,
    });
  });

  it("omits before when not specified", async () => {
    const cognite = makeCogniteWithLatest([makeDatapointResponse(TS_A)]);
    const mapper = makeMapper(cognite);

    await mapper.retrieveLatest({ timeSeries: [TS_A] });

    const items = vi.mocked(cognite.retrieveLatestDatapoints).mock.calls[0]?.[0];
    expect(items?.[0]).not.toHaveProperty("before");
  });

  it("passes ignoreUnknownIds to the Cognite call", async () => {
    const cognite = makeCogniteWithLatest([makeDatapointResponse(TS_A)]);
    const mapper = makeMapper(cognite);

    await mapper.retrieveLatest({ timeSeries: [TS_A], ignoreUnknownIds: true });

    expect(cognite.retrieveLatestDatapoints).toHaveBeenCalledWith(expect.any(Array), {
      ignoreUnknownIds: true,
    });
  });

  it("passes undefined as second argument when ignoreUnknownIds is not set", async () => {
    const cognite = makeCogniteWithLatest([makeDatapointResponse(TS_A)]);
    const mapper = makeMapper(cognite);

    await mapper.retrieveLatest({ timeSeries: [TS_A] });

    expect(cognite.retrieveLatestDatapoints).toHaveBeenCalledWith(expect.any(Array), undefined);
  });

  it("excludes string series from latest results", async () => {
    const cognite = makeCogniteWithLatest([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 42 }],
      }),
      makeDatapointResponse(TS_B, { isString: true }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieveLatest({ timeSeries: [TS_A, TS_B] });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.timeSeries.externalId).toBe("temperature");
  });

  it("returns an empty list when no series are found", async () => {
    const cognite = makeCogniteWithLatest([]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieveLatest({ timeSeries: [] });

    expect(result.items).toHaveLength(0);
  });

  it("maps multiple series correctly", async () => {
    const cognite = makeCogniteWithLatest([
      makeDatapointResponse(TS_A, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 10 }],
      }),
      makeDatapointResponse(TS_B, {
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 20 }],
      }),
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.retrieveLatest({ timeSeries: [TS_A, TS_B] });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.datapoints[0]?.value).toBe(10);
    expect(result.items[1]?.datapoints[0]?.value).toBe(20);
  });
});

// ─── insert ───────────────────────────────────────────────────────────────────

describe("DatapointsMapper.insert", () => {
  it("inserts a single time series in one call", async () => {
    const cognite = makeCogniteMock();
    cognite.insertDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    await mapper.insert([
      {
        timeSeries: TS_A,
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 42 }],
      },
    ]);

    expect(cognite.insertDatapoints).toHaveBeenCalledOnce();
    expect(cognite.insertDatapoints).toHaveBeenCalledWith([
      {
        space: TS_A.space,
        externalId: TS_A.externalId,
        datapoints: [{ timestamp: new Date("2024-01-01T00:00:00.000Z"), value: 42 }],
      },
    ]);
  });

  it("does not call Cognite when the insert list is empty", async () => {
    const cognite = makeCogniteMock();
    cognite.insertDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    await mapper.insert([]);

    expect(cognite.insertDatapoints).not.toHaveBeenCalled();
  });

  it("chunks inserts into multiple calls when items exceed 100", async () => {
    const cognite = makeCogniteMock();
    cognite.insertDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    const items = Array.from({ length: 101 }, (_, i) => ({
      timeSeries: { space: "ts-space", externalId: `ts-${i}` },
      datapoints: [{ timestamp: new Date(), value: i }],
    }));
    await mapper.insert(items);

    expect(cognite.insertDatapoints).toHaveBeenCalledTimes(2);
    expect(vi.mocked(cognite.insertDatapoints).mock.calls[0]?.[0]).toHaveLength(100);
    expect(vi.mocked(cognite.insertDatapoints).mock.calls[1]?.[0]).toHaveLength(1);
  });

  it("handles exactly 100 items in a single call (boundary)", async () => {
    const cognite = makeCogniteMock();
    cognite.insertDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    const items = Array.from({ length: 100 }, (_, i) => ({
      timeSeries: { space: "ts-space", externalId: `ts-${i}` },
      datapoints: [],
    }));
    await mapper.insert(items);

    expect(cognite.insertDatapoints).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cognite.insertDatapoints).mock.calls[0]?.[0]).toHaveLength(100);
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("DatapointsMapper.delete", () => {
  it("deletes a range with start and end", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    const start = new Date("2024-01-01T00:00:00.000Z");
    const end = new Date("2024-01-02T00:00:00.000Z");
    await mapper.delete([{ timeSeries: TS_A, start, end }]);

    expect(cognite.deleteDatapoints).toHaveBeenCalledWith([
      {
        space: TS_A.space,
        externalId: TS_A.externalId,
        inclusiveBegin: start,
        exclusiveEnd: end,
      },
    ]);
  });

  it("deletes an open-ended range (no end date)", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    const start = new Date("2024-01-01T00:00:00.000Z");
    await mapper.delete([{ timeSeries: TS_A, start }]);

    const callItems = vi.mocked(cognite.deleteDatapoints).mock.calls[0]?.[0];
    expect(callItems?.[0]).toMatchObject({ inclusiveBegin: start });
    expect(callItems?.[0]).not.toHaveProperty("exclusiveEnd");
  });

  it("does not call Cognite when delete list is empty", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    await mapper.delete([]);

    expect(cognite.deleteDatapoints).not.toHaveBeenCalled();
  });

  it("chunks delete ranges into multiple calls when items exceed 100", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    const ranges = Array.from({ length: 101 }, (_, i) => ({
      timeSeries: { space: "ts-space", externalId: `ts-${i}` },
      start: new Date("2024-01-01T00:00:00.000Z"),
      end: new Date("2024-01-02T00:00:00.000Z"),
    }));
    await mapper.delete(ranges);

    expect(cognite.deleteDatapoints).toHaveBeenCalledTimes(2);
    expect(vi.mocked(cognite.deleteDatapoints).mock.calls[0]?.[0]).toHaveLength(100);
    expect(vi.mocked(cognite.deleteDatapoints).mock.calls[1]?.[0]).toHaveLength(1);
  });

  it("throws on invalid start date before calling Cognite", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn();
    const mapper = makeMapper(cognite);

    await expect(
      mapper.delete([
        {
          timeSeries: TS_A,
          start: new Date("not-a-date"),
          end: new Date("2024-01-02T00:00:00.000Z"),
        },
      ]),
    ).rejects.toThrow(/Invalid datapoints options.*ranges\.0\.start/s);

    expect(cognite.deleteDatapoints).not.toHaveBeenCalled();
  });

  it("throws on invalid end date before calling Cognite", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn();
    const mapper = makeMapper(cognite);

    await expect(
      mapper.delete([
        {
          timeSeries: TS_A,
          start: new Date("2024-01-01T00:00:00.000Z"),
          end: new Date("not-a-date"),
        },
      ]),
    ).rejects.toThrow(/Invalid datapoints options.*ranges\.0\.end/s);

    expect(cognite.deleteDatapoints).not.toHaveBeenCalled();
  });

  it("handles exactly 100 ranges in a single call (boundary)", async () => {
    const cognite = makeCogniteMock();
    cognite.deleteDatapoints = vi.fn().mockResolvedValue(undefined);
    const mapper = makeMapper(cognite);

    const ranges = Array.from({ length: 100 }, (_, i) => ({
      timeSeries: { space: "ts-space", externalId: `ts-${i}` },
      start: new Date("2024-01-01T00:00:00.000Z"),
    }));
    await mapper.delete(ranges);

    expect(cognite.deleteDatapoints).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cognite.deleteDatapoints).mock.calls[0]?.[0]).toHaveLength(100);
  });
});
