import { EconomicIndex, EconomicIndexType } from "../models/economicIndex";
import { getHistoricalIndexes, getLatestIndex, resetHistoricalIndexesCache, saveIndex, saveIndexes } from "./indexRepository";
import { fetchHistoricalData, fetchIndexFromBcb } from "./bcbService";

export type LatestIndexes = Record<EconomicIndexType, EconomicIndex>;
export type IndexDisplayBasis = "annual" | "trailing12m" | "monthly";

export interface IndexDisplayItem {
  indexType: EconomicIndexType;
  label: string;
  rate: number;
  basis: IndexDisplayBasis;
  date: string;
  sourceDate: string;
}

export type LatestIndexesDisplay = Record<EconomicIndexType, IndexDisplayItem>;

const INDEX_TYPES: EconomicIndexType[] = ["SELIC", "CDI", "IPCA"];
const MEMORY_CACHE_TTL_MS = 15 * 60 * 1000;

let latestIndexesCache: { value: LatestIndexes | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

function sortByDateAscending(left: EconomicIndex, right: EconomicIndex): number {
  return left.date.localeCompare(right.date);
}

function getMonthStartOffset(date: string, monthsBack: number): string {
  const [yearPart, monthPart] = date.split("-");
  const year = Number(yearPart || 1970);
  const month = Number(monthPart || 1);
  const target = new Date(Date.UTC(year, month - 1, 1));
  target.setUTCMonth(target.getUTCMonth() - monthsBack);
  return target.toISOString().split("T")[0] || date;
}

export function annualizeBusinessDailyRate(rate: number): number {
  return Math.pow(1 + rate, 252) - 1;
}

export function compoundIndexRates(rates: number[]): number {
  return rates.reduce((accumulator, currentRate) => accumulator * (1 + currentRate), 1) - 1;
}

function toBcbDate(date: string): string {
  const [yearPart, monthPart, dayPart] = date.split("-");
  return `${dayPart}/${monthPart}/${yearPart}`;
}

export function buildIpcaDisplayItem(latest: EconomicIndex, history: EconomicIndex[]): IndexDisplayItem {
  const trailingStartDate = getMonthStartOffset(latest.date, 11);
  const trailingMonths = history
    .filter((item) => item.date >= trailingStartDate && item.date <= latest.date)
    .sort(sortByDateAscending)
    .slice(-12);

  if (trailingMonths.length === 12) {
    return {
      indexType: "IPCA",
      label: "IPCA (12m)",
      rate: compoundIndexRates(trailingMonths.map((item) => item.rate)),
      basis: "trailing12m",
      date: latest.date,
      sourceDate: latest.date,
    };
  }

  return {
    indexType: "IPCA",
    label: "IPCA do Mês",
    rate: latest.rate,
    basis: "monthly",
    date: latest.date,
    sourceDate: latest.date,
  };
}

function getFreshnessWindowDays(indexType: EconomicIndexType): number {
  return indexType === "IPCA" ? 45 : 3;
}

function isIndexFresh(index: EconomicIndex, now: Date = new Date()): boolean {
  const indexDate = new Date(`${index.date}T00:00:00.000Z`);
  if (isNaN(indexDate.getTime())) {
    return false;
  }

  const diffMs = now.getTime() - indexDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= getFreshnessWindowDays(index.indexType);
}

function readMemoryCache(now: number = Date.now()): LatestIndexes | null {
  if (latestIndexesCache.value && latestIndexesCache.expiresAt > now) {
    return latestIndexesCache.value;
  }

  return null;
}

function writeMemoryCache(indexes: LatestIndexes, now: number = Date.now()) {
  latestIndexesCache = {
    value: indexes,
    expiresAt: now + MEMORY_CACHE_TTL_MS,
  };
}

async function loadLatestIndex(indexType: EconomicIndexType): Promise<EconomicIndex> {
  const dbIndex = await getLatestIndex(indexType);
  if (dbIndex && isIndexFresh(dbIndex)) {
    return dbIndex;
  }

  try {
    const freshIndex = await fetchIndexFromBcb(indexType);
    await saveIndex(freshIndex);
    return freshIndex;
  } catch (error) {
    if (dbIndex) {
      console.warn(`[INDEXES] Falling back to cached DB value for ${indexType}.`, error);
      return dbIndex;
    }

    throw new Error(`Unable to load ${indexType} from API or database.`);
  }
}

export async function updateAllIndexesFromBcb(): Promise<LatestIndexes> {
  const results = {} as LatestIndexes;

  for (const type of INDEX_TYPES) {
    try {
      const indexObj = await fetchIndexFromBcb(type);
      await saveIndex(indexObj);
      results[type] = indexObj;
    } catch (error) {
      const dbIndex = await getLatestIndex(type);
      if (!dbIndex) {
        throw new Error(`Failed to refresh ${type} and no cached DB value is available.`);
      }

      console.warn(`[INDEXES] Using cached DB value for ${type} after refresh failure.`, error);
      results[type] = dbIndex;
    }
  }

  writeMemoryCache(results);
  return results;
}

export async function getLatestIndexes(): Promise<LatestIndexes> {
  const cached = readMemoryCache();
  if (cached) {
    return cached;
  }

  const results = {} as LatestIndexes;
  for (const type of INDEX_TYPES) {
    results[type] = await loadLatestIndex(type);
  }

  writeMemoryCache(results);
  return results;
}

export async function getLatestIndexesDisplay(latestIndexes?: LatestIndexes): Promise<LatestIndexesDisplay> {
  const latest = latestIndexes ?? await getLatestIndexes();
  const ipcaHistoryStartDate = getMonthStartOffset(latest.IPCA.date, 11);
  let ipcaHistory = await getHistoricalIndexes("IPCA", ipcaHistoryStartDate);

  if (ipcaHistory.length < 12) {
    try {
      const missingHistory = await fetchHistoricalData(
        "IPCA",
        toBcbDate(ipcaHistoryStartDate),
        toBcbDate(latest.IPCA.date),
      );
      await saveIndexes(missingHistory);
      resetHistoricalIndexesCache();
      ipcaHistory = await getHistoricalIndexes("IPCA", ipcaHistoryStartDate);
    } catch (error) {
      console.warn("[INDEXES] Unable to bootstrap enough IPCA history for 12m display.", error);
    }
  }

  return {
    CDI: {
      indexType: "CDI",
      label: "CDI Hoje",
      rate: annualizeBusinessDailyRate(latest.CDI.rate),
      basis: "annual",
      date: latest.CDI.date,
      sourceDate: latest.CDI.date,
    },
    SELIC: {
      indexType: "SELIC",
      label: "SELIC",
      rate: annualizeBusinessDailyRate(latest.SELIC.rate),
      basis: "annual",
      date: latest.SELIC.date,
      sourceDate: latest.SELIC.date,
    },
    IPCA: buildIpcaDisplayItem(latest.IPCA, ipcaHistory),
  };
}

export async function bootstrapHistoricalData(indexType: EconomicIndexType, sinceYear: number = 2010): Promise<number> {
  const { fetchHistoricalData } = await import("./bcbService");
  const latest = await getLatestIndex(indexType);
  let startDateStr = `01/01/${sinceYear}`;

  if (latest && latest.date) {
    const latestDate = new Date(latest.date);
    latestDate.setDate(latestDate.getDate() + 1);

    const todayDate = new Date();
    if (latestDate > todayDate) return 0;

    startDateStr = `${String(latestDate.getDate()).padStart(2, "0")}/${String(latestDate.getMonth() + 1).padStart(2, "0")}/${latestDate.getFullYear()}`;
  }

  const today = new Date();
  const endDateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  console.log(`[BOOTSTRAP] Fetching ${indexType} from ${startDateStr} to ${endDateStr}...`);
  const data = await fetchHistoricalData(indexType, startDateStr, endDateStr);
  if (data && data.length > 0) {
    await saveIndexes(data);
  }
  return data ? data.length : 0;
}

export async function bootstrapHistoricalSelic(sinceYear: number = 2010): Promise<number> {
  return bootstrapHistoricalData("SELIC", sinceYear);
}

export function resetLatestIndexesCache() {
  latestIndexesCache = {
    value: null,
    expiresAt: 0,
  };
}
