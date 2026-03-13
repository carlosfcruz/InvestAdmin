import type { Investment } from "../models/investment";
import { analyzeInvestmentOpportunities } from "./investmentOpportunities";
import type { InvestmentWithBenchmarkSummary } from "./portfolioAnalytics";

const fixedNow = "2026-03-10T12:00:00.000Z";

function buildInvestment(overrides: Partial<InvestmentWithBenchmarkSummary> = {}): InvestmentWithBenchmarkSummary {
  const base: Investment = {
    userId: "qa-user",
    investmentId: "inv-1",
    type: "CDB",
    indexer: "CDI",
    origin: "MANUAL",
    issuer: "Banco QA",
    productName: "Produto QA",
    rate: 95,
    applicationDate: "2025-03-10T12:00:00.000Z",
    maturityDate: "2027-03-10T12:00:00.000Z",
    amountInvested: 1000,
    liquidity: "D+0",
    incomeTaxRegime: "REGRESSIVE",
    hasFGC: true,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    portfolioStatus: "ACTIVE",
  };

  return {
    ...base,
    currentValue: 1095,
    grossReturn: 95,
    grossReturnPct: 0.095,
    netValue: 1078.38,
    netReturn: 78.38,
    netReturnPct: 0.07838,
    taxAmount: 16.62,
    taxRate: 0.175,
    daysElapsed: 365,
    yearsElapsed: 365 / 252,
    monthlyProjection: 10,
    yearlyProjection: 120,
    maturityProjection: 0,
    maturityValue: 0,
    maturityNetValue: 1180,
    iofAmount: 0,
    iofRate: 0,
    daysToMaturity: 365,
    maturityStatus: "ACTIVE",
    benchmarkAvailable: true,
    benchmarkLabel: "CDI",
    benchmarkComparatorLabel: "Pós-fixado",
    benchmarkCurrentValue: 1100,
    benchmarkProfit: 100,
    benchmarkReturnPct: 0.1,
    excessReturnPct: -0.005,
    benchmarkStartDate: "2025-03-10",
    benchmarkLastIndexDate: "2026-03-10",
    ...overrides,
  };
}

describe("analyzeInvestmentOpportunities", () => {
  it("flags post-fixed CDBs below the minimum rate threshold", () => {
    const result = analyzeInvestmentOpportunities([
      buildInvestment({
        type: "CDB",
        indexer: "CDI",
        rate: 92,
      }),
    ]);

    expect(result.summary.activeCount).toBe(1);
    expect(result.summary.analyzedCount).toBe(1);
    expect(result.summary.underperformingCount).toBe(1);
    expect(result.items[0]?.comparatorLabel).toBe("Régua Mínima");
    expect(result.items[0]?.targetRate).toBe(100);
    expect(result.items[0]?.severity).toBe("MEDIUM");
    expect(result.items[0]?.title).toBe("Abaixo da Régua Mínima");
  });

  it("uses the net-equivalent threshold for LCI/LCA", () => {
    const result = analyzeInvestmentOpportunities([
      buildInvestment({
        investmentId: "inv-lci",
        type: "LCI",
        indexer: "CDI",
        rate: 80,
        taxRate: 0,
        taxAmount: 0,
        netValue: 1095,
        netReturn: 95,
        netReturnPct: 0.095,
      }),
    ]);

    expect(result.summary.underperformingCount).toBe(1);
    expect(result.items[0]?.comparatorLabel).toBe("Equivalente Líquido");
    expect(result.items[0]?.targetRate).toBe(85);
    expect(result.items[0]?.reasonCode).toBe("BELOW_NET_EQUIVALENT_RATE");
    expect(result.items[0]?.title).toBe("Abaixo do Equivalente Líquido");
  });

  it("ignores investments outside the supported scope", () => {
    const result = analyzeInvestmentOpportunities([
      buildInvestment({
        investmentId: "inv-prefixado",
        type: "CDB",
        indexer: "PREFIXADO",
        rate: 11,
      }),
      buildInvestment({
        investmentId: "inv-matured",
        maturityStatus: "MATURED",
      }),
      buildInvestment({
        investmentId: "inv-redeemed",
        portfolioStatus: "REDEEMED",
      }),
    ]);

    expect(result.summary.activeCount).toBe(1);
    expect(result.summary.analyzedCount).toBe(0);
    expect(result.summary.underperformingCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("does not emit an opportunity when the rate is within tolerance", () => {
    const result = analyzeInvestmentOpportunities([
      buildInvestment({
        type: "CDB",
        indexer: "CDI",
        rate: 99.7,
      }),
    ]);

    expect(result.summary.analyzedCount).toBe(1);
    expect(result.summary.underperformingCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("normalizes legacy bank fixed-income products indexed to SELIC back to CDI in the explanation", () => {
    const result = analyzeInvestmentOpportunities([
      buildInvestment({
        type: "CDB",
        indexer: "SELIC",
        benchmarkLabel: "SELIC",
        rate: 91.17,
      }),
    ]);

    expect(result.summary.underperformingCount).toBe(1);
    expect(result.items[0]?.benchmarkLabel).toBe("CDI");
    expect(result.items[0]?.explanation).toContain("CDI");
    expect(result.items[0]?.recommendation).toContain("100% do CDI");
  });
});
