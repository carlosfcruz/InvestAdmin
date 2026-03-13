import type { EconomicIndex, EconomicIndexType } from "../models/economicIndex";
import { buildIpcaDisplayItem, getLatestIndexes, getLatestIndexesDisplay, resetLatestIndexesCache, updateAllIndexesFromBcb } from "./indexes";
import { fetchHistoricalData, fetchIndexFromBcb } from "./bcbService";
import { getHistoricalIndexes, getLatestIndex, saveIndex } from "./indexRepository";

jest.mock("./indexRepository", () => ({
  getLatestIndex: jest.fn(),
  getHistoricalIndexes: jest.fn(),
  saveIndex: jest.fn(),
  saveIndexes: jest.fn(),
}));

jest.mock("./bcbService", () => ({
  fetchIndexFromBcb: jest.fn(),
  fetchHistoricalData: jest.fn(),
}));

const mockedGetLatestIndex = getLatestIndex as jest.MockedFunction<typeof getLatestIndex>;
const mockedGetHistoricalIndexes = getHistoricalIndexes as jest.MockedFunction<typeof getHistoricalIndexes>;
const mockedSaveIndex = saveIndex as jest.MockedFunction<typeof saveIndex>;
const mockedFetchIndexFromBcb = fetchIndexFromBcb as jest.MockedFunction<typeof fetchIndexFromBcb>;
const mockedFetchHistoricalData = fetchHistoricalData as jest.MockedFunction<typeof fetchHistoricalData>;
const fixedNow = new Date("2026-03-10T12:00:00.000Z");

function makeIndex(indexType: EconomicIndexType, date: string, rate: number): EconomicIndex {
  return { indexType, date, rate };
}

describe("indexes service", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    resetLatestIndexesCache();
    mockedGetLatestIndex.mockReset();
    mockedGetHistoricalIndexes.mockReset();
    mockedSaveIndex.mockReset();
    mockedFetchIndexFromBcb.mockReset();
    mockedFetchHistoricalData.mockReset();
  });

  it("uses fresh DB values without hitting the API", async () => {
    const dbByType: Record<EconomicIndexType, EconomicIndex> = {
      SELIC: makeIndex("SELIC", "2026-03-10", 0.0007),
      CDI: makeIndex("CDI", "2026-03-10", 0.0006),
      IPCA: makeIndex("IPCA", "2026-02-28", 0.005),
    };

    mockedGetLatestIndex.mockImplementation(async (indexType) => dbByType[indexType] ?? null);

    const result = await getLatestIndexes();

    expect(result).toEqual(dbByType);
    expect(mockedFetchIndexFromBcb).not.toHaveBeenCalled();
  });

  it("refreshes stale or missing values from the API and saves them to DB", async () => {
    mockedGetLatestIndex.mockImplementation(async (indexType) => {
      if (indexType === "SELIC") {
        return makeIndex("SELIC", "2026-03-01", 0.0005);
      }

      return null;
    });

    mockedFetchIndexFromBcb.mockImplementation(async (indexType) => {
      if (indexType === "SELIC") return makeIndex("SELIC", "2026-03-10", 0.0007);
      if (indexType === "CDI") return makeIndex("CDI", "2026-03-10", 0.0006);
      return makeIndex("IPCA", "2026-03-10", 0.005);
    });

    const result = await getLatestIndexes();

    expect(result.SELIC.date).toBe("2026-03-10");
    expect(result.CDI.date).toBe("2026-03-10");
    expect(result.IPCA.date).toBe("2026-03-10");
    expect(mockedSaveIndex).toHaveBeenCalledTimes(3);
  });

  it("falls back to the DB if refresh fails but cached data exists", async () => {
    const staleSelic = makeIndex("SELIC", "2026-03-01", 0.0005);
    const freshCdi = makeIndex("CDI", "2026-03-10", 0.0006);
    const freshIpca = makeIndex("IPCA", "2026-02-28", 0.005);

    mockedGetLatestIndex.mockImplementation(async (indexType) => {
      if (indexType === "SELIC") return staleSelic;
      if (indexType === "CDI") return freshCdi;
      return freshIpca;
    });

    mockedFetchIndexFromBcb.mockRejectedValue(new Error("BCB unavailable"));

    const result = await getLatestIndexes();

    expect(result.SELIC).toEqual(staleSelic);
    expect(result.CDI).toEqual(freshCdi);
    expect(result.IPCA).toEqual(freshIpca);
  });

  it("throws when neither API nor DB can supply an index", async () => {
    mockedGetLatestIndex.mockResolvedValue(null);
    mockedFetchIndexFromBcb.mockRejectedValue(new Error("BCB unavailable"));

    await expect(getLatestIndexes()).rejects.toThrow("Unable to load SELIC from API or database.");
  });

  it("caches the latest indexes in memory to avoid repeated DB or API reads", async () => {
    const dbByType: Record<EconomicIndexType, EconomicIndex> = {
      SELIC: makeIndex("SELIC", "2026-03-10", 0.0007),
      CDI: makeIndex("CDI", "2026-03-10", 0.0006),
      IPCA: makeIndex("IPCA", "2026-02-28", 0.005),
    };

    mockedGetLatestIndex.mockImplementation(async (indexType) => dbByType[indexType] ?? null);

    const first = await getLatestIndexes();
    const second = await getLatestIndexes();

    expect(first).toEqual(second);
    expect(mockedGetLatestIndex).toHaveBeenCalledTimes(3);
    expect(mockedFetchIndexFromBcb).not.toHaveBeenCalled();
  });

  it("refresh endpoint uses DB values if the API fails during update", async () => {
    mockedFetchIndexFromBcb.mockRejectedValue(new Error("BCB unavailable"));
    mockedGetLatestIndex.mockImplementation(async (indexType) => {
      if (indexType === "IPCA") return makeIndex("IPCA", "2026-02-28", 0.005);
      if (indexType === "SELIC") return makeIndex("SELIC", "2026-03-10", 0.0007);
      return makeIndex("CDI", "2026-03-10", 0.0006);
    });

    const result = await updateAllIndexesFromBcb();

    expect(result.SELIC.rate).toBe(0.0007);
    expect(result.CDI.rate).toBe(0.0006);
    expect(result.IPCA.rate).toBe(0.005);
  });

  it("builds IPCA display as trailing 12 months when enough monthly history exists", () => {
    const latest = makeIndex("IPCA", "2026-02-01", 0.007);
    const history = [
      makeIndex("IPCA", "2025-03-01", 0.003),
      makeIndex("IPCA", "2025-04-01", 0.004),
      makeIndex("IPCA", "2025-05-01", 0.005),
      makeIndex("IPCA", "2025-06-01", 0.006),
      makeIndex("IPCA", "2025-07-01", 0.002),
      makeIndex("IPCA", "2025-08-01", 0.004),
      makeIndex("IPCA", "2025-09-01", 0.005),
      makeIndex("IPCA", "2025-10-01", 0.006),
      makeIndex("IPCA", "2025-11-01", 0.004),
      makeIndex("IPCA", "2025-12-01", 0.005),
      makeIndex("IPCA", "2026-01-01", 0.006),
      latest,
    ];

    const result = buildIpcaDisplayItem(latest, history);

    expect(result.label).toBe("IPCA (12m)");
    expect(result.basis).toBe("trailing12m");
    expect(result.rate).toBeCloseTo(0.0585, 3);
  });

  it("falls back to the latest monthly IPCA when there is not enough history", () => {
    const latest = makeIndex("IPCA", "2026-02-01", 0.007);

    const result = buildIpcaDisplayItem(latest, [latest]);

    expect(result.label).toBe("IPCA do Mês");
    expect(result.basis).toBe("monthly");
    expect(result.rate).toBe(0.007);
  });

  it("returns display metadata for CDI, SELIC and IPCA", async () => {
    const latestByType: Record<EconomicIndexType, EconomicIndex> = {
      SELIC: makeIndex("SELIC", "2026-03-10", 0.00055131),
      CDI: makeIndex("CDI", "2026-03-10", 0.00055131),
      IPCA: makeIndex("IPCA", "2026-02-01", 0.007),
    };

    mockedGetLatestIndex.mockImplementation(async (indexType) => latestByType[indexType] ?? null);
    mockedGetHistoricalIndexes.mockResolvedValue([
      makeIndex("IPCA", "2025-03-01", 0.003),
      makeIndex("IPCA", "2025-04-01", 0.004),
      makeIndex("IPCA", "2025-05-01", 0.005),
      makeIndex("IPCA", "2025-06-01", 0.006),
      makeIndex("IPCA", "2025-07-01", 0.002),
      makeIndex("IPCA", "2025-08-01", 0.004),
      makeIndex("IPCA", "2025-09-01", 0.005),
      makeIndex("IPCA", "2025-10-01", 0.006),
      makeIndex("IPCA", "2025-11-01", 0.004),
      makeIndex("IPCA", "2025-12-01", 0.005),
      makeIndex("IPCA", "2026-01-01", 0.006),
      makeIndex("IPCA", "2026-02-01", 0.007),
    ]);

    const result = await getLatestIndexesDisplay();

    expect(result.CDI.label).toBe("CDI Hoje");
    expect(result.CDI.basis).toBe("annual");
    expect(result.CDI.rate).toBeCloseTo(0.149, 2);
    expect(result.SELIC.label).toBe("SELIC");
    expect(result.IPCA.label).toBe("IPCA (12m)");
    expect(result.IPCA.basis).toBe("trailing12m");
  });
});
