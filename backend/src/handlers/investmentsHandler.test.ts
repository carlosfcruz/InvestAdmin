import { validateInvestmentPayload } from "./investmentsHandler";

describe("validateInvestmentPayload", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("rejects application dates in the future", () => {
    const error = validateInvestmentPayload({
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-11",
    });

    expect(error).toBe("Application date cannot be in the future");
  });

  it("rejects unrealistic prefixado rates", () => {
    const error = validateInvestmentPayload({
      type: "CDB",
      indexer: "PREFIXADO",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-10",
    });

    expect(error).toBe("Prefixado must be informed as an annual rate up to 40% a.a.");
  });

  it("accepts a valid CDI investment", () => {
    const error = validateInvestmentPayload({
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-10",
      maturityDate: "2027-03-10",
    });

    expect(error).toBeNull();
  });

  it("rejects invalid CDB Selic combinations", () => {
    const error = validateInvestmentPayload({
      type: "CDB",
      indexer: "SELIC",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-10",
    });

    expect(error).toBe("Invalid combination: CDB does not support SELIC");
  });

  it("accepts LCI IPCA plus combinations", () => {
    const error = validateInvestmentPayload({
      type: "LCI",
      indexer: "IPCA",
      amountInvested: 1000,
      rate: 6.5,
      applicationDate: "2026-03-10",
      maturityDate: "2028-03-10",
    });

    expect(error).toBeNull();
  });

  it("accepts Tesouro Selic combinations", () => {
    const error = validateInvestmentPayload({
      type: "TESOURO",
      indexer: "SELIC",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-10",
    });

    expect(error).toBeNull();
  });

  it("accepts active portfolio status", () => {
    const error = validateInvestmentPayload({
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-10",
      portfolioStatus: "ACTIVE",
    });

    expect(error).toBeNull();
  });

  it("rejects invalid portfolio status", () => {
    const error = validateInvestmentPayload({
      type: "CDB",
      indexer: "CDI",
      amountInvested: 1000,
      rate: 100,
      applicationDate: "2026-03-10",
      portfolioStatus: "PENDING" as any,
    });

    expect(error).toBe("Invalid portfolio status: PENDING");
  });
});
