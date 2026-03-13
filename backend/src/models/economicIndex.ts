export type EconomicIndexType = "CDI" | "SELIC" | "IPCA";

export interface EconomicIndex {
  indexType: EconomicIndexType;
  date: string;
  rate: number;
}

