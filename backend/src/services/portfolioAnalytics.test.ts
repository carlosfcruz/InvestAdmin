import type { Investment } from "../models/investment";
import type { InvestmentWithMetrics } from "./calculations";
import {
  attachBenchmarkSummaries,
  calculateInvestmentEvolutionSeries,
  calculatePortfolioEvolutionSeries,
  calculatePortfolioSummary,
} from "./portfolioAnalytics";
import type { LatestIndexes } from "./indexes";
import { getHistoricalIndexes } from "./indexRepository";
import { getFundHistory } from "./fundQuoteRepository";

jest.mock("./indexRepository", () => ({
  getHistoricalIndexes: jest.fn(),
}));

jest.mock("./fundQuoteRepository", () => ({
  getFundHistory: jest.fn(),
}));

const mockedGetHistoricalIndexes = getHistoricalIndexes as jest.MockedFunction<typeof getHistoricalIndexes>;
const mockedGetFundHistory = getFundHistory as jest.MockedFunction<typeof getFundHistory>;
const fixedNow = new Date("2026-03-10T12:00:00.000Z");

const latestIndexes: LatestIndexes = {
  CDI: { indexType: "CDI", date: "2026-03-10", rate: 0.0006 },
  SELIC: { indexType: "SELIC", date: "2026-03-10", rate: 0.0007 },
  IPCA: { indexType: "IPCA", date: "2026-03-10", rate: 0.005 },
};

function buildInvestment(overrides: Partial<InvestmentWithMetrics> = {}): InvestmentWithMetrics {
  const baseInvestment: Investment = {
    userId: "qa-user",
    investmentId: "inv-1",
    type: "CDB",
    indexer: "CDI",
    origin: "MANUAL",
    issuer: "Banco QA",
    productName: "CDB QA",
    rate: 120,
    applicationDate: "2026-03-09T12:00:00.000Z",
    maturityDate: "2028-03-10T12:00:00.000Z",
    amountInvested: 1000,
    liquidity: "D+0",
    incomeTaxRegime: "REGRESSIVE",
    hasFGC: true,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
  };

  return {
    ...baseInvestment,
    currentValue: 1000.72,
    grossReturn: 0.72,
    grossReturnPct: 0.00072,
    netValue: 1000.56,
    netReturn: 0.56,
    netReturnPct: 0.00056,
    taxAmount: 0.16,
    taxRate: 0.225,
    daysElapsed: 1,
    yearsElapsed: 1 / 252,
    monthlyProjection: 7.2,
    yearlyProjection: 87.2,
    maturityProjection: 0,
    maturityValue: 0,
    maturityNetValue: 0,
    iofAmount: 0,
    iofRate: 0.93,
    daysToMaturity: 730,
    maturityStatus: "ACTIVE",
    ...overrides,
  };
}

describe("portfolio analytics", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockedGetHistoricalIndexes.mockReset();
    mockedGetFundHistory.mockReset();
  });

  it("calculates consolidated totals and the CDI benchmark summary for renda fixa", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType, applicationDate) => {
      const start = applicationDate.startsWith("2026-03-10")
        ? [{ indexType, date: "2026-03-10", rate: 0.0006 }]
        : [
            { indexType, date: "2026-03-09", rate: 0.0006 },
            { indexType, date: "2026-03-10", rate: 0.0006 },
          ];

      return start as any;
    });

    const activeCdb = buildInvestment({
      investmentId: "inv-cdb",
      productName: "CDB CDI",
      type: "CDB",
      indexer: "CDI",
      rate: 120,
      amountInvested: 1000,
      currentValue: 1000.72,
      grossReturn: 0.72,
      grossReturnPct: 0.00072,
    });

    const activePrefixado = buildInvestment({
      investmentId: "inv-prefixado",
      productName: "Tesouro Prefixado",
      type: "TESOURO",
      indexer: "PREFIXADO",
      rate: 10,
      applicationDate: "2026-03-10T12:00:00.000Z",
      amountInvested: 2000,
      currentValue: 2000,
      grossReturn: 0,
      grossReturnPct: 0,
    });

    const pendingLci = buildInvestment({
      investmentId: "inv-pending",
      productName: "LCI Vencida",
      type: "LCI",
      amountInvested: 500,
      currentValue: 550,
      netValue: 550,
      maturityNetValue: 550,
      grossReturn: 50,
      grossReturnPct: 0.1,
      maturityStatus: "MATURED",
      daysToMaturity: -1,
    });

    const summary = await calculatePortfolioSummary([activeCdb, activePrefixado, pendingLci], latestIndexes);

    expect(summary.totals.activeInvestedValue).toBeCloseTo(3000, 2);
    expect(summary.totals.activeCurrentValue).toBeCloseTo(3000.72, 2);
    expect(summary.totals.activeOpenProfit).toBeCloseTo(0.72, 2);
    expect(summary.totals.pendingRedemptionValue).toBeCloseTo(550, 2);
    expect(summary.totals.pendingRedemptionResult).toBeCloseTo(50, 2);
    expect(summary.totals.consolidatedValue).toBeCloseTo(3550.72, 2);

    expect(summary.benchmark.hasData).toBe(true);
    expect(summary.benchmark.label).toBe("CDI");
    expect(summary.benchmark.methodology).toBe("TWR");
    expect(summary.benchmark.periodLabel).toBe("Desde o Início");
    expect(summary.benchmark.eligibleInvestedValue).toBeCloseTo(3000, 2);
    expect(summary.benchmark.eligibleCurrentValue).toBeCloseTo(3000.72, 2);
    expect(summary.benchmark.benchmarkCurrentValue).toBeCloseTo(3000.6, 2);
    expect(summary.benchmark.portfolioReturnPct).toBeCloseTo(0.00072, 6);
    expect(summary.benchmark.benchmarkReturnPct).toBeCloseTo(0.0006, 6);
    expect(summary.benchmark.excessReturnPct).toBeCloseTo(0.00012, 6);
    expect(summary.benchmark.benchmarkProfit).toBeCloseTo(0.6, 2);
    expect(summary.benchmark.startDate).toBe("2026-03-09");
    expect(summary.benchmark.lastIndexDate).toBe("2026-03-10");
  });

  it("returns an empty benchmark block when there is no renda fixa elegível", async () => {
    const fund = buildInvestment({
      investmentId: "fund-1",
      type: "FUNDO",
      indexer: "PREFIXADO",
      amountInvested: 1000,
      currentValue: 1200,
      grossReturn: 200,
      grossReturnPct: 0.2,
    });

    const summary = await calculatePortfolioSummary([fund], latestIndexes);

    expect(summary.totals.activeInvestedValue).toBe(1000);
    expect(summary.totals.activeCurrentValue).toBe(1200);
    expect(summary.benchmark.hasData).toBe(false);
    expect(summary.benchmark.label).toBe("CDI");
    expect(summary.benchmark.eligibleInvestedValue).toBe(0);
    expect(summary.benchmark.benchmarkCurrentValue).toBe(0);
    expect(mockedGetHistoricalIndexes).not.toHaveBeenCalled();
  });

  it("adds a CDI benchmark series when the filtered carteira is fully comparable", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType) => {
      return [
        { indexType, date: "2026-03-09", rate: 0.0006 },
        { indexType, date: "2026-03-10", rate: 0.0006 },
      ] as any;
    });

    const activeCdb = buildInvestment({
      investmentId: "inv-cdb",
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      currentValue: 1000.72,
    });

    const activeLci = buildInvestment({
      investmentId: "inv-lci",
      type: "LCI",
      indexer: "CDI",
      amountInvested: 500,
      currentValue: 500.36,
    });

    const series = await calculatePortfolioEvolutionSeries([activeCdb, activeLci]);
    const lastPoint = series[series.length - 1];

    expect(series).toHaveLength(2);
    expect(lastPoint?.value).toBeCloseTo(1501.08, 2);
    expect(lastPoint?.applied).toBeCloseTo(1500, 2);
    expect(lastPoint?.profit).toBeCloseTo(1.08, 2);
    expect(lastPoint?.benchmarkValue).toBeCloseTo(1500.9, 2);
    expect(lastPoint?.benchmarkProfit).toBeCloseTo(0.9, 2);
    expect(lastPoint?.excessValue).toBeCloseTo(0.18, 2);
  });

  it("omits the benchmark series when the filtered carteira mixes unsupported types", async () => {
    mockedGetHistoricalIndexes.mockResolvedValue([
      { indexType: "CDI", date: "2026-03-09", rate: 0.0006 },
      { indexType: "CDI", date: "2026-03-10", rate: 0.0006 },
    ] as any);
    mockedGetFundHistory.mockResolvedValue([]);

    const activeCdb = buildInvestment({
      investmentId: "inv-cdb",
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      currentValue: 1000.72,
    });

    const fund = buildInvestment({
      investmentId: "inv-fund",
      type: "FUNDO",
      indexer: "PREFIXADO",
      cnpj: "00.000.000/0001-91",
      applicationDate: "2026-03-09T12:00:00.000Z",
      amountInvested: 700,
      currentValue: 710,
    });

    const series = await calculatePortfolioEvolutionSeries([activeCdb, fund]);
    const lastPoint = series[series.length - 1];

    expect(lastPoint?.value).toBeCloseTo(1710.72, 2);
    expect(lastPoint?.benchmarkValue).toBeUndefined();
    expect(lastPoint?.benchmarkProfit).toBeUndefined();
    expect(lastPoint?.excessValue).toBeUndefined();
    expect(mockedGetFundHistory).toHaveBeenCalledWith("00.000.000/0001-91", "2026-03-09");
  });

  it("attaches benchmark summaries by investment with the right base comparator", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType) => {
      return [
        { indexType, date: "2026-03-09", rate: indexType === "IPCA" ? 0.004 : 0.0006 },
        { indexType, date: "2026-03-10", rate: indexType === "IPCA" ? 0.004 : 0.0006 },
      ] as any;
    });

    const cdbCdi = buildInvestment({
      investmentId: "inv-cdb-cdi",
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      currentValue: 1000.72,
      grossReturn: 0.72,
      grossReturnPct: 0.00072,
    });

    const cdbPrefixado = buildInvestment({
      investmentId: "inv-cdb-prefixado",
      type: "CDB",
      indexer: "PREFIXADO",
      rate: 10,
      amountInvested: 1000,
      currentValue: 1010,
      grossReturn: 10,
      grossReturnPct: 0.01,
    });

    const cdbIpca = buildInvestment({
      investmentId: "inv-cdb-ipca",
      type: "CDB",
      indexer: "IPCA",
      rate: 6.5,
      amountInvested: 1000,
      currentValue: 1012,
      grossReturn: 12,
      grossReturnPct: 0.012,
    });

    const fund = buildInvestment({
      investmentId: "inv-fund",
      type: "FUNDO",
      indexer: "PREFIXADO",
      amountInvested: 1000,
      currentValue: 1200,
      grossReturn: 200,
      grossReturnPct: 0.2,
    });

    const [cdiBenchmark, prefixadoBenchmark, ipcaBenchmark, fundBenchmark] = await attachBenchmarkSummaries(
      [cdbCdi, cdbPrefixado, cdbIpca, fund],
      latestIndexes
    );

    expect(cdiBenchmark?.benchmarkAvailable).toBe(true);
    expect(cdiBenchmark?.benchmarkLabel).toBe("CDI");
    expect(cdiBenchmark?.benchmarkComparatorLabel).toBe("Pós-fixado");
    expect(cdiBenchmark?.benchmarkCurrentValue).toBeCloseTo(1000.6, 2);
    expect(cdiBenchmark?.excessReturnPct).toBeCloseTo(0.00012, 6);

    expect(prefixadoBenchmark?.benchmarkAvailable).toBe(true);
    expect(prefixadoBenchmark?.benchmarkLabel).toBe("CDI");
    expect(prefixadoBenchmark?.benchmarkComparatorLabel).toBe("Curva Contratada");
    expect(prefixadoBenchmark?.benchmarkCurrentValue).toBeCloseTo(1000.6, 2);
    expect(prefixadoBenchmark?.excessReturnPct).toBeCloseTo(0.0094, 6);

    expect(ipcaBenchmark?.benchmarkAvailable).toBe(true);
    expect(ipcaBenchmark?.benchmarkLabel).toBe("IPCA");
    expect(ipcaBenchmark?.benchmarkComparatorLabel).toBe("Curva Contratada");
    expect(ipcaBenchmark?.benchmarkCurrentValue).toBeCloseTo(1000.13, 2);
    expect(ipcaBenchmark?.excessReturnPct).toBeGreaterThan(0);

    expect(fundBenchmark?.benchmarkAvailable).toBe(false);
    expect(fundBenchmark?.benchmarkLabel).toBeNull();
    expect(fundBenchmark?.excessReturnPct).toBeNull();
  });

  it("uses a net-equivalent benchmark for tax-exempt fixed income products", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType) => {
      return [
        { indexType, date: "2025-03-10", rate: 0.0006 },
        { indexType, date: "2026-03-10", rate: 0.0006 },
      ] as any;
    });

    const grossComparableCdb = buildInvestment({
      investmentId: "inv-cdb-compare",
      type: "CDB",
      indexer: "CDI",
      rate: 83,
      applicationDate: "2025-03-10T12:00:00.000Z",
      amountInvested: 1000,
      currentValue: 1141.5,
      grossReturn: 141.5,
      grossReturnPct: 0.1415,
      netValue: 1116.74,
      netReturn: 116.74,
      netReturnPct: 0.11674,
      taxAmount: 24.76,
      taxRate: 0.175,
      daysElapsed: 365,
      yearsElapsed: 365 / 252,
      iofAmount: 0,
      iofRate: 0,
    });

    const taxExemptLci = buildInvestment({
      investmentId: "inv-lci-compare",
      type: "LCI",
      indexer: "CDI",
      rate: 83,
      applicationDate: "2025-03-10T12:00:00.000Z",
      amountInvested: 1000,
      currentValue: 1141.5,
      grossReturn: 141.5,
      grossReturnPct: 0.1415,
      netValue: 1141.5,
      netReturn: 141.5,
      netReturnPct: 0.1415,
      taxAmount: 0,
      taxRate: 0,
      daysElapsed: 365,
      yearsElapsed: 365 / 252,
      iofAmount: 0,
      iofRate: 0,
    });

    const [cdbBenchmark, lciBenchmark] = await attachBenchmarkSummaries(
      [grossComparableCdb, taxExemptLci],
      latestIndexes
    );

    expect(cdbBenchmark?.benchmarkComparatorLabel).toBe("Pós-fixado");
    expect(lciBenchmark?.benchmarkComparatorLabel).toBe("Equivalente Líquido");
    expect(lciBenchmark?.benchmarkCurrentValue || 0).toBeLessThan(cdbBenchmark?.benchmarkCurrentValue || 0);
    expect(lciBenchmark?.excessReturnPct || 0).toBeGreaterThan(0);
    expect(lciBenchmark?.excessReturnPct || 0).toBeGreaterThan(cdbBenchmark?.excessReturnPct || 0);
  });

  it("adds benchmark values to the individual investment evolution when the asset is comparable", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType) => {
      return [
        { indexType, date: "2026-03-09", rate: indexType === "IPCA" ? 0.004 : 0.0006 },
        { indexType, date: "2026-03-10", rate: indexType === "IPCA" ? 0.004 : 0.0006 },
      ] as any;
    });

    const cdbCdi = buildInvestment({
      investmentId: "inv-detail-benchmark",
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      currentValue: 1000.72,
      grossReturn: 0.72,
      grossReturnPct: 0.00072,
    });

    const series = await calculateInvestmentEvolutionSeries(cdbCdi);
    const lastPoint = series[series.length - 1];

    expect(series).toHaveLength(2);
    expect(lastPoint?.value).toBeCloseTo(1000.72, 2);
    expect(lastPoint?.benchmarkValue).toBeCloseTo(1000.6, 2);
    expect(lastPoint?.benchmarkProfit).toBeCloseTo(0.6, 2);
    expect(lastPoint?.excessValue).toBeCloseTo(0.12, 2);
  });

  it("uses the net-equivalent benchmark in the individual evolution of LCI/LCA", async () => {
    mockedGetHistoricalIndexes.mockImplementation(async (indexType) => {
      return [
        { indexType, date: "2025-03-10", rate: 0.0006 },
        { indexType, date: "2026-03-10", rate: 0.0006 },
      ] as any;
    });

    const cdbCdi = buildInvestment({
      investmentId: "inv-detail-cdb",
      type: "CDB",
      indexer: "CDI",
      rate: 83,
      applicationDate: "2025-03-10T12:00:00.000Z",
      amountInvested: 1000,
      currentValue: 1141.5,
      grossReturn: 141.5,
      grossReturnPct: 0.1415,
      netValue: 1116.74,
      netReturn: 116.74,
      netReturnPct: 0.11674,
      taxAmount: 24.76,
      taxRate: 0.175,
      daysElapsed: 365,
      yearsElapsed: 365 / 252,
      iofAmount: 0,
      iofRate: 0,
    });

    const lciCdi = buildInvestment({
      investmentId: "inv-detail-lci",
      type: "LCI",
      indexer: "CDI",
      rate: 83,
      applicationDate: "2025-03-10T12:00:00.000Z",
      amountInvested: 1000,
      currentValue: 1141.5,
      grossReturn: 141.5,
      grossReturnPct: 0.1415,
      netValue: 1141.5,
      netReturn: 141.5,
      netReturnPct: 0.1415,
      taxAmount: 0,
      taxRate: 0,
      daysElapsed: 365,
      yearsElapsed: 365 / 252,
      iofAmount: 0,
      iofRate: 0,
    });

    const [cdbSeries, lciSeries] = await Promise.all([
      calculateInvestmentEvolutionSeries(cdbCdi),
      calculateInvestmentEvolutionSeries(lciCdi),
    ]);
    const cdbLastPoint = cdbSeries[cdbSeries.length - 1];
    const lciLastPoint = lciSeries[lciSeries.length - 1];

    expect(lciLastPoint?.benchmarkValue || 0).toBeLessThan(cdbLastPoint?.benchmarkValue || 0);
    expect(lciLastPoint?.excessValue || 0).toBeGreaterThan(cdbLastPoint?.excessValue || 0);
    expect(Math.abs(lciLastPoint?.excessValue || 0)).toBeLessThan(Math.abs(cdbLastPoint?.excessValue || 0));
  });
});
