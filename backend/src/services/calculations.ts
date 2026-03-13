import { Investment, InvestmentIndexer } from "../models/investment";
import Decimal from "decimal.js";
import { LatestIndexes } from "./indexes";
import { getHistoricalIndexes } from "./indexRepository";
import { parseInvestmentDate, toDateKey } from "../utils/date";

export type MaturityStatus = "NONE" | "ACTIVE" | "MATURES_TODAY" | "MATURED";

export interface InvestmentMetrics {
  currentValue: number;
  grossReturn: number;
  grossReturnPct: number;
  netValue: number;
  netReturn: number;
  netReturnPct: number;
  taxAmount: number;
  taxRate: number;
  daysElapsed: number;
  yearsElapsed: number;
  monthlyProjection: number;
  yearlyProjection: number;
  maturityProjection: number;
  maturityValue: number;
  maturityNetValue: number;
  iofAmount: number;
  iofRate: number;
  daysToMaturity: number | null;
  maturityStatus: MaturityStatus;
}

export type InvestmentWithMetrics = Investment & InvestmentMetrics;

export interface ReturnSnapshot {
  grossReturn: number;
  grossReturnPct: number;
  netValue: number;
  netReturn: number;
  netReturnPct: number;
  taxAmount: number;
  taxRate: number;
  iofAmount: number;
  iofRate: number;
  daysElapsed: number;
}

function getIOFRate(days: number): number {
  if (days <= 0) return 0.96;
  if (days >= 30) return 0;
  const iofTable = [
    0.96, 0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70, 0.66,
    0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36, 0.33,
    0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03
  ];
  return iofTable[days - 1] || 0;
}

export function calculateReturnSnapshot(
  investment: Pick<Investment, "type" | "amountInvested" | "incomeTaxRegime">,
  currentValue: number,
  daysElapsed: number
): ReturnSnapshot {
  const grossReturn = currentValue - investment.amountInvested;
  const grossReturnPct = investment.amountInvested > 0 ? grossReturn / investment.amountInvested : 0;
  const effectiveDaysElapsed = Math.max(0, Math.floor(daysElapsed));

  const iofRate = getIOFRate(effectiveDaysElapsed);
  const iofAmount = Math.max(0, grossReturn) * iofRate;

  let taxRate = 0;
  if (investment.incomeTaxRegime === "REGRESSIVE" && investment.type !== "LCI" && investment.type !== "LCA") {
    if (effectiveDaysElapsed <= 180) taxRate = 0.225;
    else if (effectiveDaysElapsed <= 360) taxRate = 0.20;
    else if (effectiveDaysElapsed <= 720) taxRate = 0.175;
    else taxRate = 0.15;
  }

  const taxableProfit = Math.max(0, grossReturn - iofAmount);
  const taxAmount = taxableProfit * taxRate;
  const netReturn = grossReturn - taxAmount - iofAmount;
  const netValue = investment.amountInvested + netReturn;
  const netReturnPct = investment.amountInvested > 0 ? netReturn / investment.amountInvested : 0;

  return {
    grossReturn,
    grossReturnPct,
    netValue,
    netReturn,
    netReturnPct,
    taxAmount,
    taxRate,
    iofAmount,
    iofRate,
    daysElapsed: effectiveDaysElapsed,
  };
}

export async function withMetrics(
  investment: Investment,
  latestIndexes: LatestIndexes
): Promise<InvestmentWithMetrics> {
  // If it's a Fund, we calculate based on shares/quotes
  if (investment.type === "FUNDO") {
    const qty = investment.quantity || 0;
    const lastQuote = investment.lastQuoteValue || investment.purchaseQuoteValue || 0;
    const currentValue = qty * lastQuote;
    const purchaseValue = qty * (investment.purchaseQuoteValue || 0);

    // For funds, we don't necessarily have a fixed annual rate, but we can't break finalizeMetrics
    // We'll calculate a 'lifetime annual equivalent' or use 0 for now
    const days = getDaysElapsed(investment.applicationDate);
    return finalizeMetrics(investment, currentValue, days, days / 365, 0);
  }

  // If it's SELIC or CDI, we use historical calculation for precision
  if (investment.indexer === "SELIC" || investment.indexer === "CDI" || investment.indexer === "IPCA") {
    return calculateHistoricalMetrics(investment, latestIndexes);
  }

  // Fallback for IPCA or PREFIXADO (simplified for now as per current phase)
  const maturityDateIso = investment.maturityDate;
  const nowRaw = new Date();
  const nowIso = nowRaw.toISOString();

  // Effective days for interest calculation: cap at maturity if passed
  const calculationEndDate = (maturityDateIso && maturityDateIso < nowIso) ? maturityDateIso : nowIso;
  const daysElapsedForInterest = getDaysElapsedBetween(investment.applicationDate, calculationEndDate);
  const yearsElapsedForInterest = daysElapsedForInterest / 365;

  const annualRate = getEffectiveAnnualRate(investment, latestIndexes);

  const currentValue = new Decimal(investment.amountInvested)
    .times(new Decimal(1).plus(annualRate).pow(Math.max(yearsElapsedForInterest, 0)))
    .toNumber();

  const realDaysElapsed = getDaysElapsed(investment.applicationDate);
  return finalizeMetrics(investment, currentValue, realDaysElapsed, realDaysElapsed / 365, annualRate);
}

function finalizeMetrics(
  investment: Investment,
  currentValue: number,
  daysElapsed: number,
  yearsElapsed: number,
  annualRate: number
): InvestmentWithMetrics {
  const effectiveAmountInvested = investment.type === "FUNDO"
    ? (investment.quantity || 0) * (investment.purchaseQuoteValue || 0)
    : investment.amountInvested;

  const snapshot = calculateReturnSnapshot(
    {
      type: investment.type,
      amountInvested: effectiveAmountInvested,
      incomeTaxRegime: investment.incomeTaxRegime,
    },
    currentValue,
    daysElapsed
  );
  const {
    grossReturn,
    grossReturnPct,
    netValue,
    netReturn,
    netReturnPct,
    taxAmount,
    taxRate,
    iofAmount,
    iofRate,
    daysElapsed: effectiveDaysElapsed,
  } = snapshot;

  // Projections using Compound Interest
  // Monthly: (1 + annualRate)^(1/12) - 1
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthlyProjection = currentValue * monthlyRate;
  const yearlyProjection = currentValue * annualRate;

  let maturityProjection = 0;
  let maturityValue = 0;
  let maturityNetValue = 0;
  let daysToMaturity: number | null = null;
  let maturityStatus: MaturityStatus = investment.maturityDate ? "ACTIVE" : "NONE";

  if (investment.maturityDate) {
    const maturityDateObj = parseInvestmentDate(investment.maturityDate);
    const applicationDateObj = parseInvestmentDate(investment.applicationDate);
    const now = new Date();
    const todayDateObj = parseInvestmentDate(toDateKey(now));

    if (!isNaN(maturityDateObj.getTime()) && !isNaN(applicationDateObj.getTime())) {
      const totalDays = Math.max(0, Math.floor((maturityDateObj.getTime() - applicationDateObj.getTime()) / (1000 * 3600 * 24)));
      const daysRemaining = (maturityDateObj.getTime() - now.getTime()) / (1000 * 3600 * 24);
      const totalYears = totalDays / 365;
      const yearsRemaining = Math.max(0, daysRemaining / 365);
      daysToMaturity = Math.floor((maturityDateObj.getTime() - todayDateObj.getTime()) / (1000 * 3600 * 24));

      if (daysToMaturity < 0) {
        maturityStatus = "MATURED";
      } else if (daysToMaturity === 0) {
        maturityStatus = "MATURES_TODAY";
      } else {
        maturityStatus = "ACTIVE";
      }

      // FV = PV * (1 + annualRate)^yearsRemaining
      maturityValue = Math.max(0, new Decimal(currentValue).times(new Decimal(1).plus(annualRate).pow(yearsRemaining)).toNumber());

      // Total projected gross return for IR calculation
      const totalProjectedGrossReturn = maturityValue - effectiveAmountInvested;

      // Project IR at Maturity based on total duration (Regressive Table)
      let maturityTaxRate = 0;
      if (investment.incomeTaxRegime === "REGRESSIVE" && investment.type !== "LCI" && investment.type !== "LCA") {
        if (totalDays <= 180) maturityTaxRate = 0.225;
        else if (totalDays <= 360) maturityTaxRate = 0.20;
        else if (totalDays <= 720) maturityTaxRate = 0.175;
        else maturityTaxRate = 0.15;
      }

      const maturityTaxAmount = Math.max(0, totalProjectedGrossReturn) * maturityTaxRate;
      maturityNetValue = maturityValue - maturityTaxAmount;
      maturityProjection = maturityNetValue - currentValue;

      console.log(`[DEBUG] OK: ${investment.productName} -> NetMaturity: ${maturityNetValue.toFixed(2)}`);
    } else {
      console.warn(`[WARN] Invalid dates for ${investment.productName}: app=${investment.applicationDate}, mat=${investment.maturityDate}`);
      maturityValue = currentValue;
      maturityNetValue = netValue;
      maturityProjection = 0;
      daysToMaturity = null;
      maturityStatus = "NONE";
    }
  }

  return {
    ...investment,
    amountInvested: effectiveAmountInvested,
    currentValue,
    grossReturn,
    grossReturnPct,
    netValue,
    netReturn,
    netReturnPct,
    taxAmount,
    taxRate,
    iofAmount,
    iofRate,
    daysElapsed: effectiveDaysElapsed,
    yearsElapsed,
    monthlyProjection,
    yearlyProjection,
    maturityProjection,
    maturityValue,
    maturityNetValue,
    daysToMaturity,
    maturityStatus
  };
}

export async function calculateHistoricalMetrics(investment: Investment, latestIndexes: LatestIndexes): Promise<InvestmentWithMetrics> {
  const history = await getHistoricalIndexes(investment.indexer as "SELIC" | "CDI" | "IPCA", investment.applicationDate);
  const evolution = calculateEvolution(investment, history);
  const lastPoint = evolution[evolution.length - 1];
  const currentValue = lastPoint ? lastPoint.value : investment.amountInvested;

  const annualRate = getEffectiveAnnualRate(investment, latestIndexes);
  const daysElapsed = getDaysElapsed(investment.applicationDate);
  // Historical SELIC/CDI use 252 business days base
  return finalizeMetrics(investment, currentValue, daysElapsed, daysElapsed / 252, annualRate);
}

export interface EvolutionPoint {
  date: string;
  value: number;
  yield: number;
  dailyRate: number;
}

export function calculateEvolution(investment: Investment & { currentValue?: number }, history: { date: string, rate: number }[]): EvolutionPoint[] {
  const result: EvolutionPoint[] = [];
  const rateMultiplier = investment.rate / 100;
  const historyMap = new Map<string, number>();

  // Filter out any corrupted DB data where annualized rate was saved instead of daily for SELIC/CDI
  const validHistory = history.filter(p => {
    if ((investment.indexer === "SELIC" || investment.indexer === "CDI") && p.rate > 0.05) {
      return false; // ignore rogue annualized data point (> 5% a day is impossible)
    }
    return true;
  });

  validHistory.forEach(p => {
    historyMap.set(p.date.slice(0, 10), p.rate);
  });

  const start = new Date(investment.applicationDate);
  if (isNaN(start.getTime())) {
    return result;
  }
  const end = new Date(); // Compounding up to today
  const maturityDateStr = investment.maturityDate?.split('T')[0];
  const startDateKey = toDateKey(parseInvestmentDate(investment.applicationDate));

  let currentBalance = investment.amountInvested;
  let lastKnownRate = 0;

  // For Prefixado we already know the rate
  if (investment.indexer === "PREFIXADO") {
    const annualFixedRate = investment.rate / 100;
    // We convert annual to daily base 252 business days
    lastKnownRate = Math.pow(1 + annualFixedRate, 1 / 252) - 1;
  } else if (validHistory.length > 0 && validHistory[0]) {
    lastKnownRate = validHistory[0].rate;
  } else {
    // Fallback if no history at all for dynamic indices
    lastKnownRate = (investment.indexer === "IPCA" ? 0.004 : 0.0004);
  }

  // To iterate correctly over dates in UTC/Local, use string manipulation or set hours to 12
  const currentDate = new Date(parseInvestmentDate(investment.applicationDate));
  currentDate.setUTCHours(12, 0, 0, 0);
  end.setUTCHours(12, 0, 0, 0);

  while (currentDate <= end) {
    const dateStr = toDateKey(currentDate);

    // Stop compounding/tracking after maturity
    if (maturityDateStr && dateStr > maturityDateStr) break;

    // Handle FUNDO type separately (Quota-based)
    if (investment.type === "FUNDO") {
      if (historyMap.has(dateStr)) {
        lastKnownRate = historyMap.get(dateStr)!;
      }
      const qty = investment.quantity || 0;
      currentBalance = qty * lastKnownRate;

      result.push({
        date: dateStr,
        value: Number(currentBalance.toFixed(2)),
        yield: Number((currentBalance - investment.amountInvested).toFixed(2)),
        dailyRate: lastKnownRate
      });
    } else {
      // Fixed Income Logic (Compounding)
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      let dailyFactor = 1;
      const shouldAccrue = dateStr !== startDateKey;

      // Update rate if available (only on business days for SELIC/CDI usually)
      if (investment.indexer !== "PREFIXADO" && historyMap.has(dateStr)) {
        lastKnownRate = historyMap.get(dateStr)!;
      }

      let dailyRate = lastKnownRate;

      if (investment.indexer === "IPCA") {
        // IPCA uses the monthly index plus the fixed annual spread.
        const inflationDailyRate = Math.pow(1 + lastKnownRate, 1 / 30) - 1;
        const spreadDailyRate = Math.pow(1 + rateMultiplier, 1 / 252) - 1;
        dailyFactor = shouldAccrue ? 1 + inflationDailyRate : 1;
        if (shouldAccrue && !isWeekend) {
          dailyFactor *= 1 + spreadDailyRate;
        }
        dailyRate = shouldAccrue ? dailyFactor - 1 : 0;
      } else if (investment.indexer === "PREFIXADO") {
        if (shouldAccrue && !isWeekend) {
          // Base 252, compounds only on business days. (Modifier is 1 here)
          dailyFactor = 1 + dailyRate;
        } else {
          dailyRate = 0;
        }
      } else {
        // SELIC or CDI
        if (shouldAccrue && !isWeekend) {
          dailyFactor = 1 + (dailyRate * rateMultiplier);
        } else {
          dailyRate = 0;
        }
      }

      currentBalance *= dailyFactor;

      result.push({
        date: dateStr,
        value: Number(currentBalance.toFixed(2)),
        yield: Number((currentBalance - investment.amountInvested).toFixed(2)),
        dailyRate
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Final Calibration: If we have a real currentValue, ensure the last point matches it
  const realizedValue = investment.currentValue;
  if (result.length > 0 && typeof realizedValue === "number" && realizedValue > 0 && investment.type !== "FUNDO") {
    const finalPoint = result[result.length - 1];
    if (finalPoint) {
      const diffRatio = realizedValue / (finalPoint.value || 1);
      // If the difference is significant (> 1%), apply a smooth correction factor
      if (Math.abs(diffRatio - 1) > 0.01) {
        result.forEach((p, idx) => {
          const progress = (idx + 1) / result.length;
          const correction = 1 + (diffRatio - 1) * progress;
          p.value = Number((p.value * correction).toFixed(2));
          p.yield = Number((p.value - investment.amountInvested).toFixed(2));
        });
      }
    }
  }

  return result;
}

function getDaysElapsedBetween(startIso: string, endIso: string): number {
  const start = parseInvestmentDate(startIso);
  const end = parseInvestmentDate(endIso);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 0 ? diffDays : 0;
}

function getDaysElapsed(applicationDateIso: string): number {
  return getDaysElapsedBetween(applicationDateIso, new Date().toISOString());
}

function getEffectiveAnnualRate(
  investment: Investment,
  latestIndexes: LatestIndexes
): number {
  const baseFromIndexer = (indexer: InvestmentIndexer): number => {
    switch (indexer) {
      case "CDI":
        // convert from daily base 252 to annual if it's a true daily rate
        return latestIndexes.CDI.rate > 0.05 ? latestIndexes.CDI.rate : Math.pow(1 + latestIndexes.CDI.rate, 252) - 1;
      case "SELIC":
        return latestIndexes.SELIC.rate > 0.05 ? latestIndexes.SELIC.rate : Math.pow(1 + latestIndexes.SELIC.rate, 252) - 1;
      case "IPCA":
        // IPCA is stored as a monthly rate or occasionally annual.
        // IPCA normal monthly is ~0.005. If > 0.02, treat as annual.
        return latestIndexes.IPCA.rate > 0.02 ? latestIndexes.IPCA.rate : Math.pow(1 + latestIndexes.IPCA.rate, 12) - 1;
      case "PREFIXADO":
      default:
        return 0;
    }
  };

  if (investment.indexer === "PREFIXADO") {
    return investment.rate / 100;
  }

  const base = baseFromIndexer(investment.indexer);

  // Math for different indexer types:
  // CDI/SELIC: rate is a percentage of the index (e.g. 110% of CDI)
  // IPCA: rate is a fixed spread over the index (e.g. IPCA + 6%)
  if (investment.indexer === "IPCA") {
    const ipcaAnnual = base;
    const spread = investment.rate / 100;
    return (1 + ipcaAnnual) * (1 + spread) - 1;
  }

  return base * (investment.rate / 100);
}


