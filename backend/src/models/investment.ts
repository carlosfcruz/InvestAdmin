export type InvestmentType = "CDB" | "TESOURO" | "LCI" | "LCA" | "FUNDO";

export type InvestmentIndexer = "CDI" | "SELIC" | "IPCA" | "PREFIXADO";

export type InvestmentOrigin = "MANUAL" | "OCR";
export type InvestmentPortfolioStatus = "ACTIVE" | "REDEEMED";

export interface Investment {
  userId: string;
  investmentId: string;

  type: InvestmentType;
  indexer: InvestmentIndexer;
  origin: InvestmentOrigin;

  issuer: string;
  productName: string;

  rate: number;

  applicationDate: string;
  maturityDate: string | null;

  amountInvested: number;

  liquidity: string;
  incomeTaxRegime: string;
  hasFGC: boolean;
  portfolioStatus?: InvestmentPortfolioStatus;
  redeemedAt?: string | null;
  redeemedAmount?: number | null;

  riskNotes?: string;
  redemptionRules?: string;

  // Fund Specific Fields
  cnpj?: string;
  quantity?: number;
  purchaseQuoteValue?: number;
  lastQuoteValue?: number;
  lastQuoteDate?: string;

  createdAt: string;
  updatedAt: string;
}

