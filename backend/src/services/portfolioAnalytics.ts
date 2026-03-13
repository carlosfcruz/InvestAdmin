import type { Investment } from "../models/investment";
import {
  calculateEvolution,
  calculateReturnSnapshot,
  type EvolutionPoint,
  type InvestmentWithMetrics,
} from "./calculations";
import type { LatestIndexes } from "./indexes";
import { getHistoricalIndexes } from "./indexRepository";
import { getFundHistory } from "./fundQuoteRepository";
import { parseInvestmentDate, toDateKey } from "../utils/date";

const BENCHMARK_ELIGIBLE_TYPES = new Set<Investment["type"]>(["CDB", "LCI", "LCA", "TESOURO"]);
type BenchmarkLabel = "CDI" | "SELIC" | "IPCA";
type BenchmarkComparatorLabel = "P\u00f3s-fixado" | "Curva Contratada" | "Equivalente L\u00edquido";

interface BenchmarkDefinition {
  label: BenchmarkLabel;
  comparatorLabel: BenchmarkComparatorLabel;
  indexType: BenchmarkLabel;
  benchmarkRate: number;
}

interface FilledEvolutionPoint {
  date: string;
  value: number;
  applied: number;
}

export interface PortfolioEvolutionItem {
  date: string;
  value: number;
  applied: number;
  profit: number;
  benchmarkValue?: number;
  benchmarkProfit?: number;
  excessValue?: number;
}

export interface PortfolioBenchmarkSummary {
  hasData: boolean;
  label: "CDI";
  methodology: "TWR";
  periodLabel: "Desde o In\u00edcio";
  startDate: string | null;
  lastIndexDate: string | null;
  eligibleInvestedValue: number;
  eligibleCurrentValue: number;
  benchmarkCurrentValue: number;
  portfolioReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  benchmarkProfit: number;
}

export interface InvestmentBenchmarkSummary {
  benchmarkAvailable: boolean;
  benchmarkLabel: BenchmarkLabel | null;
  benchmarkComparatorLabel: BenchmarkComparatorLabel | null;
  benchmarkCurrentValue: number | null;
  benchmarkProfit: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  benchmarkStartDate: string | null;
  benchmarkLastIndexDate: string | null;
}

export type InvestmentWithBenchmarkSummary = InvestmentWithMetrics & InvestmentBenchmarkSummary;

export interface PortfolioSummary {
  totals: {
    activeInvestedValue: number;
    activeCurrentValue: number;
    activeOpenProfit: number;
    activeOpenProfitPct: number;
    pendingRedemptionValue: number;
    pendingRedemptionPrincipal: number;
    pendingRedemptionResult: number;
    consolidatedValue: number;
  };
  benchmark: PortfolioBenchmarkSummary;
}

function isRedeemed(investment: Pick<InvestmentWithMetrics, "portfolioStatus">): boolean {
  return investment.portfolioStatus === "REDEEMED";
}

function isPendingRedemption(investment: Pick<InvestmentWithMetrics, "maturityStatus" | "portfolioStatus">): boolean {
  return !isRedeemed(investment) && investment.maturityStatus === "MATURED";
}

function isActivePortfolioInvestment(investment: Pick<InvestmentWithMetrics, "maturityStatus" | "portfolioStatus">): boolean {
  return !isRedeemed(investment) && investment.maturityStatus !== "MATURED";
}

function isBenchmarkEligible(investment: InvestmentWithMetrics): boolean {
  return isActivePortfolioInvestment(investment) && BENCHMARK_ELIGIBLE_TYPES.has(investment.type);
}

function usesNetEquivalentBenchmark(investment: InvestmentWithMetrics): boolean {
  return investment.type === "LCI" || investment.type === "LCA";
}

function getBenchmarkDefinition(investment: InvestmentWithMetrics): BenchmarkDefinition | null {
  if (!isBenchmarkEligible(investment)) {
    return null;
  }

  const comparatorLabel: BenchmarkComparatorLabel = usesNetEquivalentBenchmark(investment)
    ? "Equivalente L\u00edquido"
    : "P\u00f3s-fixado";

  if (investment.indexer === "IPCA") {
    return {
      label: "IPCA",
      comparatorLabel: usesNetEquivalentBenchmark(investment) ? comparatorLabel : "Curva Contratada",
      indexType: "IPCA",
      benchmarkRate: 0,
    };
  }

  if (investment.indexer === "SELIC") {
    return {
      label: "SELIC",
      comparatorLabel,
      indexType: "SELIC",
      benchmarkRate: 100,
    };
  }

  if (investment.indexer === "PREFIXADO") {
    return {
      label: "CDI",
      comparatorLabel: usesNetEquivalentBenchmark(investment) ? comparatorLabel : "Curva Contratada",
      indexType: "CDI",
      benchmarkRate: 100,
    };
  }

  return {
    label: "CDI",
    comparatorLabel,
    indexType: "CDI",
    benchmarkRate: 100,
  };
}

function getCurrentBookValue(investment: InvestmentWithMetrics): number {
  return investment.currentValue || investment.amountInvested;
}

function getPendingRedemptionValue(investment: InvestmentWithMetrics): number {
  return investment.maturityNetValue
    || investment.netValue
    || investment.currentValue
    || investment.amountInvested;
}

function buildCashFlowMap(investments: InvestmentWithMetrics[]): Map<string, number> {
  const cashFlows = new Map<string, number>();

  investments.forEach((investment) => {
    const dateKey = toDateKey(parseInvestmentDate(investment.applicationDate));
    const previousValue = cashFlows.get(dateKey) || 0;
    cashFlows.set(dateKey, previousValue + investment.amountInvested);
  });

  return cashFlows;
}

function calculateTwr(points: FilledEvolutionPoint[], cashFlows: Map<string, number>): number {
  if (points.length <= 1) {
    return 0;
  }

  let cumulative = 1;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];

    if (!previousPoint || !currentPoint || previousPoint.value <= 0) {
      continue;
    }

    const cashFlow = cashFlows.get(currentPoint.date) || 0;
    const dailyReturn = ((currentPoint.value - cashFlow) / previousPoint.value) - 1;

    if (Number.isFinite(dailyReturn)) {
      cumulative *= 1 + dailyReturn;
    }
  }

  return cumulative - 1;
}

function getUnifiedDates(evolutions: EvolutionPoint[][]): string[] {
  const dates = new Set<string>();
  evolutions.forEach((evolution) => evolution.forEach((point) => dates.add(point.date)));
  return Array.from(dates).sort();
}

function fillEvolution(evolution: EvolutionPoint[], amountInvested: number, allDates: string[]): FilledEvolutionPoint[] {
  const valueMap = new Map<string, FilledEvolutionPoint>();
  evolution.forEach((point) => {
    valueMap.set(point.date, {
      date: point.date,
      value: point.value,
      applied: amountInvested,
    });
  });

  let lastValue = 0;
  let lastApplied = 0;
  const firstDate = allDates[0];

  if (firstDate) {
    const latestHistoricalPoint = evolution
      .filter((point) => point.date <= firstDate)
      .sort((left, right) => right.date.localeCompare(left.date))[0];

    if (latestHistoricalPoint) {
      lastValue = latestHistoricalPoint.value;
      lastApplied = amountInvested;
    }
  }

  return allDates.map((date) => {
    const existing = valueMap.get(date);
    if (existing) {
      lastValue = existing.value;
      lastApplied = existing.applied;
      return existing;
    }

    return {
      date,
      value: lastValue,
      applied: lastApplied,
    };
  });
}

function aggregateFilledEvolutions(evolutions: FilledEvolutionPoint[][], allDates: string[]): FilledEvolutionPoint[] {
  return allDates.map((date, index) => {
    let totalValue = 0;
    let totalApplied = 0;

    evolutions.forEach((evolution) => {
      const point = evolution[index];
      if (point) {
        totalValue += point.value;
        totalApplied += point.applied;
      }
    });

    return {
      date,
      value: Number(totalValue.toFixed(2)),
      applied: Number(totalApplied.toFixed(2)),
    };
  });
}

function ensureAtLeastTwoPoints(items: PortfolioEvolutionItem[]): PortfolioEvolutionItem[] {
  if (items.length !== 1 || !items[0]) {
    return items;
  }

  const firstPoint = items[0];
  const nextDay = new Date(`${firstPoint.date}T12:00:00Z`);
  nextDay.setDate(nextDay.getDate() + 1);

  return [
    firstPoint,
    {
      ...firstPoint,
      date: nextDay.toISOString().split("T")[0] || firstPoint.date,
    },
  ];
}

async function buildActualEvolution(investment: InvestmentWithMetrics): Promise<EvolutionPoint[]> {
  if (investment.type === "FUNDO") {
    const applicationDateKey = toDateKey(parseInvestmentDate(investment.applicationDate));

    if (investment.cnpj) {
      const fundHistory = await getFundHistory(investment.cnpj, applicationDateKey);
      const quoteHistory = fundHistory.map((quote) => ({
        date: quote.date,
        rate: quote.quoteValue,
      }));

      if (quoteHistory.length > 0) {
        return calculateEvolution(investment, quoteHistory);
      }
    }

    const currentValue = getCurrentBookValue(investment);
    if (currentValue <= 0) {
      return [];
    }

    const todayKey = toDateKey(new Date());
    const fallbackSeries: EvolutionPoint[] = [
      {
        date: applicationDateKey,
        value: Number(investment.amountInvested.toFixed(2)),
        yield: 0,
        dailyRate: 0,
      },
    ];

    if (todayKey !== applicationDateKey) {
      fallbackSeries.push({
        date: todayKey,
        value: Number(currentValue.toFixed(2)),
        yield: Number((currentValue - investment.amountInvested).toFixed(2)),
        dailyRate: 0,
      });
    }

    return fallbackSeries;
  }

  if (investment.indexer === "PREFIXADO") {
    return calculateEvolution(investment, []);
  }

  const applicationDateKey = toDateKey(parseInvestmentDate(investment.applicationDate));
  const history = await getHistoricalIndexes(investment.indexer as "CDI" | "SELIC" | "IPCA", investment.applicationDate);
  return calculateEvolution(investment, history.filter((point) => point.date >= applicationDateKey));
}

function buildBenchmarkBaseInvestment(
  investment: InvestmentWithMetrics,
  definition: BenchmarkDefinition
): Investment & { currentValue?: number } {
  const { currentValue: _currentValue, ...benchmarkBaseInvestment } = investment;

  return {
    ...benchmarkBaseInvestment,
    investmentId: `${investment.investmentId}-benchmark-${definition.indexType.toLowerCase()}`,
    indexer: definition.indexType,
    rate: definition.benchmarkRate,
  };
}

function applyNetEquivalentToEvolution(
  investment: InvestmentWithMetrics,
  definition: BenchmarkDefinition,
  evolution: EvolutionPoint[]
): EvolutionPoint[] {
  if (!usesNetEquivalentBenchmark(investment)) {
    return evolution;
  }

  const taxableEquivalentInvestment: Investment = {
    ...buildBenchmarkBaseInvestment(investment, definition),
    type: "CDB",
    incomeTaxRegime: "REGRESSIVE",
  };
  const applicationDate = parseInvestmentDate(taxableEquivalentInvestment.applicationDate);

  return evolution.map((point) => {
    const pointDate = parseInvestmentDate(point.date);
    const daysElapsed = Math.max(0, (pointDate.getTime() - applicationDate.getTime()) / (1000 * 60 * 60 * 24));
    const snapshot = calculateReturnSnapshot(taxableEquivalentInvestment, point.value, daysElapsed);

    return {
      ...point,
      value: Number(snapshot.netValue.toFixed(2)),
      yield: Number(snapshot.netReturn.toFixed(2)),
    };
  });
}

async function buildGrossBenchmarkEvolution(
  investment: InvestmentWithMetrics,
  definition: BenchmarkDefinition
): Promise<EvolutionPoint[]> {
  const applicationDateKey = toDateKey(parseInvestmentDate(investment.applicationDate));
  const benchmarkHistory = await getHistoricalIndexes(definition.indexType, investment.applicationDate);
  const benchmarkInvestment = buildBenchmarkBaseInvestment(investment, definition);

  return calculateEvolution(benchmarkInvestment, benchmarkHistory.filter((point) => point.date >= applicationDateKey));
}

async function buildComparableBenchmarkEvolution(
  investment: InvestmentWithMetrics,
  definition: BenchmarkDefinition
): Promise<EvolutionPoint[]> {
  const benchmarkEvolution = await buildGrossBenchmarkEvolution(investment, definition);
  return applyNetEquivalentToEvolution(investment, definition, benchmarkEvolution);
}

async function buildCdiBenchmarkEvolution(investment: InvestmentWithMetrics): Promise<EvolutionPoint[]> {
  return buildGrossBenchmarkEvolution(investment, {
    label: "CDI",
    comparatorLabel: "P\u00f3s-fixado",
    indexType: "CDI",
    benchmarkRate: 100,
  });
}

function buildEmptyBenchmarkSummary(lastIndexDate: string | null): PortfolioBenchmarkSummary {
  return {
    hasData: false,
    label: "CDI",
    methodology: "TWR",
    periodLabel: "Desde o In\u00edcio",
    startDate: null,
    lastIndexDate,
    eligibleInvestedValue: 0,
    eligibleCurrentValue: 0,
    benchmarkCurrentValue: 0,
    portfolioReturnPct: 0,
    benchmarkReturnPct: 0,
    excessReturnPct: 0,
    benchmarkProfit: 0,
  };
}

function buildEmptyInvestmentBenchmarkSummary(): InvestmentBenchmarkSummary {
  return {
    benchmarkAvailable: false,
    benchmarkLabel: null,
    benchmarkComparatorLabel: null,
    benchmarkCurrentValue: null,
    benchmarkProfit: null,
    benchmarkReturnPct: null,
    excessReturnPct: null,
    benchmarkStartDate: null,
    benchmarkLastIndexDate: null,
  };
}

export async function attachBenchmarkSummaries(
  investments: InvestmentWithMetrics[],
  latestIndexes: LatestIndexes
): Promise<InvestmentWithBenchmarkSummary[]> {
  return Promise.all(investments.map(async (investment) => {
    const definition = getBenchmarkDefinition(investment);

    if (!definition) {
      return {
        ...investment,
        ...buildEmptyInvestmentBenchmarkSummary(),
      };
    }

    const benchmarkEvolution = await buildComparableBenchmarkEvolution(investment, definition);
    const benchmarkCurrentValue = benchmarkEvolution[benchmarkEvolution.length - 1]?.value ?? investment.amountInvested;
    const benchmarkProfit = benchmarkCurrentValue - investment.amountInvested;
    const benchmarkReturnPct = investment.amountInvested > 0 ? benchmarkProfit / investment.amountInvested : 0;
    const comparableInvestmentReturnPct = usesNetEquivalentBenchmark(investment)
      ? investment.netReturnPct
      : investment.grossReturnPct;
    const lastIndexDate = latestIndexes[definition.label]?.date || null;

    return {
      ...investment,
      benchmarkAvailable: true,
      benchmarkLabel: definition.label,
      benchmarkComparatorLabel: definition.comparatorLabel,
      benchmarkCurrentValue: Number(benchmarkCurrentValue.toFixed(2)),
      benchmarkProfit: Number(benchmarkProfit.toFixed(2)),
      benchmarkReturnPct,
      excessReturnPct: comparableInvestmentReturnPct - benchmarkReturnPct,
      benchmarkStartDate: toDateKey(parseInvestmentDate(investment.applicationDate)),
      benchmarkLastIndexDate: lastIndexDate,
    };
  }));
}

export async function calculatePortfolioSummary(
  investments: InvestmentWithMetrics[],
  latestIndexes: LatestIndexes
): Promise<PortfolioSummary> {
  const activeInvestments = investments.filter(isActivePortfolioInvestment);
  const pendingRedemptionInvestments = investments.filter(isPendingRedemption);

  const activeInvestedValue = activeInvestments.reduce((acc, investment) => acc + investment.amountInvested, 0);
  const activeCurrentValue = activeInvestments.reduce((acc, investment) => acc + getCurrentBookValue(investment), 0);
  const activeOpenProfit = activeCurrentValue - activeInvestedValue;
  const activeOpenProfitPct = activeInvestedValue > 0 ? activeOpenProfit / activeInvestedValue : 0;

  const pendingRedemptionValue = pendingRedemptionInvestments.reduce((acc, investment) => acc + getPendingRedemptionValue(investment), 0);
  const pendingRedemptionPrincipal = pendingRedemptionInvestments.reduce((acc, investment) => acc + investment.amountInvested, 0);
  const pendingRedemptionResult = pendingRedemptionValue - pendingRedemptionPrincipal;
  const consolidatedValue = activeCurrentValue + pendingRedemptionValue;

  const benchmarkEligibleInvestments = activeInvestments.filter(isBenchmarkEligible);
  let benchmark = buildEmptyBenchmarkSummary(latestIndexes.CDI?.date || null);

  if (benchmarkEligibleInvestments.length > 0) {
    const [actualEvolutions, benchmarkEvolutions] = await Promise.all([
      Promise.all(benchmarkEligibleInvestments.map((investment) => buildActualEvolution(investment))),
      Promise.all(benchmarkEligibleInvestments.map((investment) => buildCdiBenchmarkEvolution(investment))),
    ]);

    const allDates = getUnifiedDates([...actualEvolutions, ...benchmarkEvolutions]);
    const filledActualEvolutions = actualEvolutions.map((evolution, index) => (
      fillEvolution(evolution, benchmarkEligibleInvestments[index]?.amountInvested || 0, allDates)
    ));
    const filledBenchmarkEvolutions = benchmarkEvolutions.map((evolution, index) => (
      fillEvolution(evolution, benchmarkEligibleInvestments[index]?.amountInvested || 0, allDates)
    ));

    const portfolioSeries = aggregateFilledEvolutions(filledActualEvolutions, allDates);
    const benchmarkSeries = aggregateFilledEvolutions(filledBenchmarkEvolutions, allDates);
    const cashFlows = buildCashFlowMap(benchmarkEligibleInvestments);

    const eligibleInvestedValue = benchmarkEligibleInvestments.reduce((acc, investment) => acc + investment.amountInvested, 0);
    const eligibleCurrentValue = benchmarkEligibleInvestments.reduce((acc, investment) => acc + getCurrentBookValue(investment), 0);
    const benchmarkCurrentValue = benchmarkSeries[benchmarkSeries.length - 1]?.value || 0;
    const portfolioReturnPct = calculateTwr(portfolioSeries, cashFlows);
    const benchmarkReturnPct = calculateTwr(benchmarkSeries, cashFlows);
    const benchmarkProfit = benchmarkCurrentValue - eligibleInvestedValue;
    const startDate = benchmarkEligibleInvestments
      .map((investment) => toDateKey(parseInvestmentDate(investment.applicationDate)))
      .sort()[0] || null;

    benchmark = {
      hasData: true,
      label: "CDI",
      methodology: "TWR",
      periodLabel: "Desde o In\u00edcio",
      startDate,
      lastIndexDate: latestIndexes.CDI?.date || null,
      eligibleInvestedValue,
      eligibleCurrentValue,
      benchmarkCurrentValue: Number(benchmarkCurrentValue.toFixed(2)),
      portfolioReturnPct,
      benchmarkReturnPct,
      excessReturnPct: portfolioReturnPct - benchmarkReturnPct,
      benchmarkProfit: Number(benchmarkProfit.toFixed(2)),
    };
  }

  return {
    totals: {
      activeInvestedValue: Number(activeInvestedValue.toFixed(2)),
      activeCurrentValue: Number(activeCurrentValue.toFixed(2)),
      activeOpenProfit: Number(activeOpenProfit.toFixed(2)),
      activeOpenProfitPct,
      pendingRedemptionValue: Number(pendingRedemptionValue.toFixed(2)),
      pendingRedemptionPrincipal: Number(pendingRedemptionPrincipal.toFixed(2)),
      pendingRedemptionResult: Number(pendingRedemptionResult.toFixed(2)),
      consolidatedValue: Number(consolidatedValue.toFixed(2)),
    },
    benchmark,
  };
}

export async function calculatePortfolioEvolutionSeries(
  investments: InvestmentWithMetrics[]
): Promise<PortfolioEvolutionItem[]> {
  if (investments.length === 0) {
    return [];
  }

  const actualEvolutions = await Promise.all(investments.map((investment) => buildActualEvolution(investment)));
  const allDates = getUnifiedDates(actualEvolutions);
  const filledActualEvolutions = actualEvolutions.map((evolution, index) => (
    fillEvolution(evolution, investments[index]?.amountInvested || 0, allDates)
  ));
  const actualSeries = aggregateFilledEvolutions(filledActualEvolutions, allDates);

  const benchmarkAvailable = investments.every((investment) => BENCHMARK_ELIGIBLE_TYPES.has(investment.type));
  let benchmarkSeries: FilledEvolutionPoint[] | null = null;

  if (benchmarkAvailable) {
    const benchmarkEvolutions = await Promise.all(investments.map((investment) => buildCdiBenchmarkEvolution(investment)));
    const filledBenchmarkEvolutions = benchmarkEvolutions.map((evolution, index) => (
      fillEvolution(evolution, investments[index]?.amountInvested || 0, allDates)
    ));
    benchmarkSeries = aggregateFilledEvolutions(filledBenchmarkEvolutions, allDates);
  }

  const items = actualSeries.map((point, index) => {
    const benchmarkPoint = benchmarkSeries?.[index];
    const benchmarkValue = benchmarkPoint?.value;

    return {
      date: point.date,
      value: Number(point.value.toFixed(2)),
      applied: Number(point.applied.toFixed(2)),
      profit: Number(Math.max(0, point.value - point.applied).toFixed(2)),
      ...(benchmarkValue !== undefined ? {
        benchmarkValue: Number(benchmarkValue.toFixed(2)),
        benchmarkProfit: Number(Math.max(0, benchmarkValue - point.applied).toFixed(2)),
        excessValue: Number((point.value - benchmarkValue).toFixed(2)),
      } : {}),
    };
  });

  return ensureAtLeastTwoPoints(items);
}

export async function calculateInvestmentEvolutionSeries(
  investment: InvestmentWithMetrics
): Promise<PortfolioEvolutionItem[]> {
  const actualEvolution = await buildActualEvolution(investment);
  if (actualEvolution.length === 0) {
    return [];
  }

  const allDates = getUnifiedDates([actualEvolution]);
  const filledActualEvolution = fillEvolution(actualEvolution, investment.amountInvested, allDates);
  const actualSeries = aggregateFilledEvolutions([filledActualEvolution], allDates);

  let benchmarkSeries: FilledEvolutionPoint[] | null = null;
  const benchmarkDefinition = getBenchmarkDefinition(investment);

  if (benchmarkDefinition) {
    const benchmarkEvolution = await buildComparableBenchmarkEvolution(investment, benchmarkDefinition);
    const filledBenchmarkEvolution = fillEvolution(benchmarkEvolution, investment.amountInvested, allDates);
    benchmarkSeries = aggregateFilledEvolutions([filledBenchmarkEvolution], allDates);
  }

  const items = actualSeries.map((point, index) => {
    const benchmarkPoint = benchmarkSeries?.[index];
    const benchmarkValue = benchmarkPoint?.value;
    const profit = point.value - point.applied;

    return {
      date: point.date,
      value: Number(point.value.toFixed(2)),
      applied: Number(point.applied.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      ...(benchmarkValue !== undefined ? {
        benchmarkValue: Number(benchmarkValue.toFixed(2)),
        benchmarkProfit: Number((benchmarkValue - point.applied).toFixed(2)),
        excessValue: Number((point.value - benchmarkValue).toFixed(2)),
      } : {}),
    };
  });

  return ensureAtLeastTwoPoints(items);
}
