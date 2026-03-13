import { FundQuote } from "../models/fundQuote";
import { getLatestFundQuote, saveFundQuote } from "./fundQuoteRepository";

interface FundQuoteApiResponse {
  cnpj?: string;
  date?: string;
  quoteValue?: number;
  value?: number;
  price?: number;
}

function getTargetDate(date?: string): string {
  return (date || new Date().toISOString()).split("T")[0] || "";
}

function getFundQuoteApiUrl(): string | null {
  const rawUrl = process.env.FUND_QUOTE_API_URL?.trim();
  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace(/\/+$/, "");
}

async function fetchFundQuoteFromApi(cnpj: string, targetDate: string): Promise<FundQuote | null> {
  const baseUrl = getFundQuoteApiUrl();
  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  url.searchParams.set("cnpj", cnpj);
  url.searchParams.set("date", targetDate);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Fund quote provider returned status ${response.status}`);
  }

  const payload = await response.json() as FundQuoteApiResponse;
  const quoteValue = payload.quoteValue ?? payload.value ?? payload.price;
  const responseDate = payload.date || targetDate;

  if (typeof quoteValue !== "number" || Number.isNaN(quoteValue)) {
    return null;
  }

  return {
    cnpj,
    date: responseDate,
    quoteValue,
  };
}

export async function fetchFundQuote(cnpj: string, date?: string): Promise<FundQuote | null> {
  if (!cnpj) {
    return null;
  }

  const targetDate = getTargetDate(date);
  if (!targetDate) {
    return null;
  }

  const storedQuote = await getLatestFundQuote(cnpj);
  if (storedQuote?.date === targetDate) {
    return storedQuote;
  }

  try {
    const remoteQuote = await fetchFundQuoteFromApi(cnpj, targetDate);
    if (remoteQuote) {
      await saveFundQuote(remoteQuote);
      return remoteQuote;
    }
  } catch (error) {
    console.error(`[CVM Service] Error fetching quote for ${cnpj}:`, error);
  }

  return storedQuote;
}

export async function updateAllFundQuotes(cnpjs: string[]): Promise<void> {
  for (const cnpj of cnpjs) {
    await fetchFundQuote(cnpj);
  }
}
