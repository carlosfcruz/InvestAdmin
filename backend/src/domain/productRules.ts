import type { InvestmentIndexer } from "../models/investment";

export type SupportedProductType =
  | "CDB"
  | "LCI"
  | "LCA"
  | "TESOURO"
  | "LC"
  | "CRI"
  | "CRA"
  | "DEBENTURE"
  | "FUNDO";

const PRODUCT_INDEXER_RULES: Record<SupportedProductType, InvestmentIndexer[]> = {
  CDB: ["CDI", "PREFIXADO", "IPCA"],
  LCI: ["CDI", "PREFIXADO", "IPCA"],
  LCA: ["CDI", "PREFIXADO", "IPCA"],
  TESOURO: ["SELIC", "PREFIXADO", "IPCA"],
  LC: ["CDI", "PREFIXADO", "IPCA"],
  CRI: ["CDI", "PREFIXADO", "IPCA"],
  CRA: ["CDI", "PREFIXADO", "IPCA"],
  DEBENTURE: ["CDI", "PREFIXADO", "IPCA"],
  FUNDO: ["PREFIXADO"],
};

export function getAllowedIndexersForType(type: string): InvestmentIndexer[] {
  return PRODUCT_INDEXER_RULES[type as SupportedProductType] || ["CDI", "PREFIXADO", "IPCA"];
}

export function getDefaultIndexerForType(type: string): InvestmentIndexer {
  const allowedIndexers = getAllowedIndexersForType(type);
  return allowedIndexers[0] || "CDI";
}

export function isIndexerAllowedForType(type: string, indexer: string): boolean {
  return getAllowedIndexersForType(type).includes(indexer as InvestmentIndexer);
}
