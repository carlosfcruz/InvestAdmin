import type { InvestmentWithBenchmarkSummary } from "./portfolioAnalytics";
import { parseInvestmentDate } from "../utils/date";

export type OpportunitySeverity = "LOW" | "MEDIUM" | "HIGH";
export type OpportunityReasonCode =
  | "BELOW_MIN_POST_FIXED_RATE"
  | "BELOW_NET_EQUIVALENT_RATE";

export interface InvestmentOpportunityItem {
  investmentId: string;
  productName: string;
  issuer: string;
  type: InvestmentWithBenchmarkSummary["type"];
  indexer: InvestmentWithBenchmarkSummary["indexer"];
  severity: OpportunitySeverity;
  reasonCode: OpportunityReasonCode;
  benchmarkLabel: "CDI" | "SELIC";
  comparatorLabel: "Régua Mínima" | "Equivalente Líquido";
  currentRate: number;
  targetRate: number;
  rateGap: number;
  excessReturnPct: number | null;
  benchmarkStartDate: string | null;
  benchmarkLastIndexDate: string | null;
  title: string;
  explanation: string;
  recommendation: string;
}

export interface InvestmentOpportunitiesSummary {
  activeCount: number;
  analyzedCount: number;
  underperformingCount: number;
  highSeverityCount: number;
}

export interface InvestmentOpportunitiesResult {
  summary: InvestmentOpportunitiesSummary;
  items: InvestmentOpportunityItem[];
}

function getRegressiveTaxRate(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

function getComparableDurationDays(investment: InvestmentWithBenchmarkSummary): number | null {
  if (investment.maturityDate) {
    const applicationDate = parseInvestmentDate(investment.applicationDate);
    const maturityDate = parseInvestmentDate(investment.maturityDate);

    if (!Number.isNaN(applicationDate.getTime()) && !Number.isNaN(maturityDate.getTime())) {
      return Math.max(0, Math.floor((maturityDate.getTime() - applicationDate.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }

  if (typeof investment.daysElapsed === "number" && investment.daysElapsed > 30) {
    return Math.floor(investment.daysElapsed);
  }

  return null;
}

function getDisplayBenchmarkLabel(investment: InvestmentWithBenchmarkSummary): "CDI" | "SELIC" | null {
  if ((investment.type === "CDB" || investment.type === "LCI" || investment.type === "LCA") && investment.indexer === "SELIC") {
    return "CDI";
  }

  if (investment.benchmarkLabel === "CDI" || investment.benchmarkLabel === "SELIC") {
    return investment.benchmarkLabel;
  }

  return null;
}

function getMinimumTargetRate(
  investment: InvestmentWithBenchmarkSummary
): {
  targetRate: number;
  comparatorLabel: "Régua Mínima" | "Equivalente Líquido";
  reasonCode: OpportunityReasonCode;
} | null {
  if ((investment.indexer !== "CDI" && investment.indexer !== "SELIC") || !getDisplayBenchmarkLabel(investment)) {
    return null;
  }

  if (investment.type === "CDB" || investment.type === "TESOURO") {
    return {
      targetRate: 100,
      comparatorLabel: "Régua Mínima",
      reasonCode: "BELOW_MIN_POST_FIXED_RATE",
    };
  }

  if (investment.type === "LCI" || investment.type === "LCA") {
    const durationDays = getComparableDurationDays(investment);
    if (durationDays === null) {
      return null;
    }

    return {
      targetRate: Number(((1 - getRegressiveTaxRate(durationDays)) * 100).toFixed(2)),
      comparatorLabel: "Equivalente Líquido",
      reasonCode: "BELOW_NET_EQUIVALENT_RATE",
    };
  }

  return null;
}

function getSeverity(rateGap: number): OpportunitySeverity {
  const absoluteGap = Math.abs(rateGap);
  if (absoluteGap >= 10) return "HIGH";
  if (absoluteGap >= 5) return "MEDIUM";
  return "LOW";
}

function formatRate(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export function analyzeInvestmentOpportunities(
  investments: InvestmentWithBenchmarkSummary[]
): InvestmentOpportunitiesResult {
  const activeInvestments = investments.filter((investment) => (
    investment.portfolioStatus !== "REDEEMED" && investment.maturityStatus !== "MATURED"
  ));

  const items: InvestmentOpportunityItem[] = [];
  let analyzedCount = 0;

  for (const investment of activeInvestments) {
    const target = getMinimumTargetRate(investment);
    const displayBenchmarkLabel = getDisplayBenchmarkLabel(investment);
    if (!target || !displayBenchmarkLabel) {
      continue;
    }

    analyzedCount += 1;

    const rateGap = Number((investment.rate - target.targetRate).toFixed(2));
    if (rateGap >= -0.5) {
      continue;
    }

    const benchmarkBasis = displayBenchmarkLabel;
    const usesNetEquivalent = target.comparatorLabel === "Equivalente Líquido";
    const targetLabel = `${formatRate(target.targetRate)} do ${benchmarkBasis}`;

    items.push({
      investmentId: investment.investmentId,
      productName: investment.productName,
      issuer: investment.issuer,
      type: investment.type,
      indexer: investment.indexer,
      severity: getSeverity(rateGap),
      reasonCode: target.reasonCode,
      benchmarkLabel: benchmarkBasis,
      comparatorLabel: target.comparatorLabel,
      currentRate: investment.rate,
      targetRate: target.targetRate,
      rateGap,
      excessReturnPct: typeof investment.excessReturnPct === "number" ? investment.excessReturnPct : null,
      benchmarkStartDate: investment.benchmarkStartDate,
      benchmarkLastIndexDate: investment.benchmarkLastIndexDate,
      title: usesNetEquivalent
        ? "Abaixo do Equivalente Líquido"
        : "Abaixo da Régua Mínima",
      explanation: usesNetEquivalent
        ? `${investment.type} a ${formatRate(investment.rate)} do ${benchmarkBasis} está abaixo do equivalente líquido estimado de um produto tributado comparável.`
        : `${investment.type} a ${formatRate(investment.rate)} do ${benchmarkBasis} está abaixo da régua mínima automática adotada para esta categoria.`,
      recommendation: usesNetEquivalent
        ? `Para prazo comparável, procure opções de ${investment.type} a partir de ${targetLabel}.`
        : `Para prazo e liquidez comparáveis, procure opções de ${investment.type} a partir de ${targetLabel}.`,
    });
  }

  items.sort((left, right) => {
    const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const severityDiff = severityRank[left.severity] - severityRank[right.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return left.rateGap - right.rateGap;
  });

  return {
    summary: {
      activeCount: activeInvestments.length,
      analyzedCount,
      underperformingCount: items.length,
      highSeverityCount: items.filter((item) => item.severity === "HIGH").length,
    },
    items,
  };
}
