import type { Investment } from "../models/investment";
import { calculateEvolution, withMetrics } from "./calculations";
import type { LatestIndexes } from "./indexes";
import { getHistoricalIndexes } from "./indexRepository";

jest.mock("./indexRepository", () => ({
  getHistoricalIndexes: jest.fn(),
}));

const mockedGetHistoricalIndexes = getHistoricalIndexes as jest.MockedFunction<typeof getHistoricalIndexes>;
const fixedNow = new Date("2026-03-10T12:00:00.000Z");

const latestIndexes: LatestIndexes = {
  CDI: { indexType: "CDI", date: "2026-03-10", rate: 0.0006 },
  SELIC: { indexType: "SELIC", date: "2026-03-10", rate: 0.0007 },
  IPCA: { indexType: "IPCA", date: "2026-03-10", rate: 0.005 },
};

function buildInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    userId: "u1",
    investmentId: "inv-1",
    type: "CDB",
    indexer: "PREFIXADO",
    origin: "MANUAL",
    issuer: "Banco QA",
    productName: "Produto QA",
    rate: 10,
    applicationDate: "2026-03-10T12:00:00.000Z",
    maturityDate: null,
    amountInvested: 1000,
    liquidity: "D+0",
    incomeTaxRegime: "REGRESSIVE",
    hasFGC: true,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
    ...overrides,
  };
}

describe("calculations regressions", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockedGetHistoricalIndexes.mockReset();
  });

  it("uses CDI history for CDI investments", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType) => {
      if (indexType === "CDI") {
        return [
          { indexType: "CDI", date: "2026-03-09", rate: 0.0005 },
          { indexType: "CDI", date: "2026-03-10", rate: 0.0005 },
        ];
      }

      return [
        { indexType: indexType as any, date: "2026-03-09", rate: 0.0009 },
        { indexType: indexType as any, date: "2026-03-10", rate: 0.0009 },
      ];
    });

    const investment = buildInvestment({
      indexer: "CDI",
      rate: 120,
      applicationDate: "2026-03-09T12:00:00.000Z",
    });

    const result = await withMetrics(investment, latestIndexes);
    const expectedCdiValue = 1000 * Math.pow(1 + 0.0005 * 1.2, 1);
    const wrongSelicValue = 1000 * Math.pow(1 + 0.0009 * 1.2, 1);

    expect(mockedGetHistoricalIndexes).toHaveBeenCalledWith("CDI", investment.applicationDate);
    expect(result.currentValue).toBeCloseTo(expectedCdiValue, 2);
    expect(result.currentValue).not.toBeCloseTo(wrongSelicValue, 2);
  });

  it("compounds IPCA monthly inflation with the fixed annual spread", () => {
    const investment = buildInvestment({
      indexer: "IPCA",
      rate: 6,
      applicationDate: "2026-03-09T12:00:00.000Z",
    });

    const evolution = calculateEvolution(investment, [
      { date: "2026-03-10", rate: 0.005 },
    ]);

    const lastPoint = evolution[evolution.length - 1];
    const inflationDailyRate = Math.pow(1 + 0.005, 1 / 30) - 1;
    const spreadDailyRate = Math.pow(1 + 0.06, 1 / 252) - 1;
    const expected = 1000 * (1 + inflationDailyRate) * (1 + spreadDailyRate);

    expect(lastPoint?.value).toBeCloseTo(expected, 2);
  });

  it("keeps the 180-day tax bracket when elapsed days floor to 180", async () => {
    const investment = buildInvestment({
      applicationDate: "2025-09-11T11:00:00.000Z",
    });

    const result = await withMetrics(investment, latestIndexes);

    expect(result.daysElapsed).toBe(180);
    expect(result.taxRate).toBe(0.225);
  });

  it("does not flatten prefixado evolution back to principal without a realized current value", () => {
    const investment = buildInvestment({
      applicationDate: "2025-03-10T12:00:00.000Z",
      rate: 10,
    });

    const evolution = calculateEvolution(investment, []);
    const lastPoint = evolution[evolution.length - 1];

    expect(lastPoint).toBeDefined();
    expect(lastPoint?.value).toBeGreaterThan(investment.amountInvested);
  });

  it("does not accrue yield on the application date itself", async () => {
    mockedGetHistoricalIndexes.mockResolvedValue([
      { indexType: "CDI", date: "2026-03-10", rate: 0.0006 },
    ]);

    const investment = buildInvestment({
      indexer: "CDI",
      rate: 100,
      applicationDate: "2026-03-10",
    });

    const result = await withMetrics(investment, latestIndexes);
    const evolution = calculateEvolution(investment, [
      { date: "2026-03-10", rate: 0.0006 },
    ]);

    expect(result.currentValue).toBe(1000);
    expect(result.grossReturn).toBe(0);
    expect(evolution[0]?.date).toBe("2026-03-10");
    expect(evolution[0]?.value).toBe(1000);
    expect(evolution[0]?.yield).toBe(0);
  });

  it("keeps date-only inputs on the same calendar day", () => {
    const investment = buildInvestment({
      applicationDate: "2026-03-09",
      rate: 10,
    });

    const evolution = calculateEvolution(investment, []);

    expect(evolution[0]?.date).toBe("2026-03-09");
  });

  it("keeps LCI tax exempt", async () => {
    const investment = buildInvestment({
      type: "LCI",
      amountInvested: 1000,
      applicationDate: "2025-03-10T12:00:00.000Z",
      rate: 10,
    });

    const result = await withMetrics(investment, latestIndexes);

    expect(result.taxRate).toBe(0);
    expect(result.taxAmount).toBe(0);
  });

  it("keeps LCA CDI tax exempt while compounding by CDI history", async () => {
    mockedGetHistoricalIndexes.mockResolvedValue([
      { indexType: "CDI", date: "2026-03-09", rate: 0.0006 },
      { indexType: "CDI", date: "2026-03-10", rate: 0.0006 },
    ]);

    const investment = buildInvestment({
      type: "LCA",
      indexer: "CDI",
      rate: 95,
      applicationDate: "2026-03-09T12:00:00.000Z",
      amountInvested: 1000,
    });

    const result = await withMetrics(investment, latestIndexes);
    const expectedValue = 1000 * Math.pow(1 + 0.0006 * 0.95, 1);

    expect(result.currentValue).toBeCloseTo(expectedValue, 2);
    expect(result.taxRate).toBe(0);
    expect(result.taxAmount).toBe(0);
  });

  it("compounds CDB IPCA plus using inflation plus fixed spread", async () => {
    mockedGetHistoricalIndexes.mockResolvedValue([
      { indexType: "IPCA", date: "2026-03-10", rate: 0.005 },
    ]);

    const investment = buildInvestment({
      type: "CDB",
      indexer: "IPCA",
      rate: 6.5,
      applicationDate: "2026-03-09T12:00:00.000Z",
      amountInvested: 1000,
    });

    const result = await withMetrics(investment, latestIndexes);
    const inflationDailyRate = Math.pow(1 + 0.005, 1 / 30) - 1;
    const spreadDailyRate = Math.pow(1 + 0.065, 1 / 252) - 1;
    const expectedValue = 1000 * (1 + inflationDailyRate) * (1 + spreadDailyRate);

    expect(result.currentValue).toBeCloseTo(expectedValue, 2);
    expect(result.taxRate).toBe(0.225);
  });

  it("applies 15 percent IR on maturity projections above 720 days", async () => {
    const investment = buildInvestment({
      applicationDate: "2026-03-10T12:00:00.000Z",
      maturityDate: "2030-03-10T12:00:00.000Z",
      rate: 10,
    });

    const result = await withMetrics(investment, latestIndexes);
    const maturityYears = 1461 / 365;
    const grossMaturityValue = 1000 * Math.pow(1.1, maturityYears);
    const expectedNetMaturityValue = grossMaturityValue - ((grossMaturityValue - 1000) * 0.15);

    expect(result.maturityNetValue).toBeCloseTo(expectedNetMaturityValue, 2);
  });

  it("flags investments that mature today", async () => {
    const investment = buildInvestment({
      applicationDate: "2025-03-10T12:00:00.000Z",
      maturityDate: "2026-03-10",
      rate: 10,
    });

    const result = await withMetrics(investment, latestIndexes);

    expect(result.maturityStatus).toBe("MATURES_TODAY");
    expect(result.daysToMaturity).toBe(0);
  });

  it("flags investments already matured", async () => {
    const investment = buildInvestment({
      applicationDate: "2025-03-10T12:00:00.000Z",
      maturityDate: "2026-03-09",
      rate: 10,
    });

    const result = await withMetrics(investment, latestIndexes);

    expect(result.maturityStatus).toBe("MATURED");
    expect(result.daysToMaturity).toBe(-1);
  });
});
