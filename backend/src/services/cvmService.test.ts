import { fetchFundQuote } from "./cvmService";
import { getLatestFundQuote, saveFundQuote } from "./fundQuoteRepository";

jest.mock("./fundQuoteRepository", () => ({
  getLatestFundQuote: jest.fn(),
  saveFundQuote: jest.fn(),
}));

const mockedGetLatestFundQuote = getLatestFundQuote as jest.MockedFunction<typeof getLatestFundQuote>;
const mockedSaveFundQuote = saveFundQuote as jest.MockedFunction<typeof saveFundQuote>;

describe("cvmService", () => {
  const originalFetch = global.fetch;
  const originalProviderUrl = process.env.FUND_QUOTE_API_URL;

  beforeEach(() => {
    mockedGetLatestFundQuote.mockReset();
    mockedSaveFundQuote.mockReset();
    delete process.env.FUND_QUOTE_API_URL;
    global.fetch = jest.fn() as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalProviderUrl) {
      process.env.FUND_QUOTE_API_URL = originalProviderUrl;
    } else {
      delete process.env.FUND_QUOTE_API_URL;
    }
  });

  it("returns the stored quote when the requested day is already cached", async () => {
    mockedGetLatestFundQuote.mockResolvedValue({
      cnpj: "12345678000199",
      date: "2026-03-10",
      quoteValue: 1.2345,
    });

    const result = await fetchFundQuote("12345678000199", "2026-03-10");

    expect(result).toEqual({
      cnpj: "12345678000199",
      date: "2026-03-10",
      quoteValue: 1.2345,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches the quote from the configured provider and persists it", async () => {
    process.env.FUND_QUOTE_API_URL = "https://quotes.example.test/funds";
    mockedGetLatestFundQuote.mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ quoteValue: 1.4567, date: "2026-03-10" }),
    });

    const result = await fetchFundQuote("12345678000199", "2026-03-10");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockedSaveFundQuote).toHaveBeenCalledWith({
      cnpj: "12345678000199",
      date: "2026-03-10",
      quoteValue: 1.4567,
    });
    expect(result).toEqual({
      cnpj: "12345678000199",
      date: "2026-03-10",
      quoteValue: 1.4567,
    });
  });

  it("falls back to the stored quote when the provider is unavailable", async () => {
    process.env.FUND_QUOTE_API_URL = "https://quotes.example.test/funds";
    mockedGetLatestFundQuote.mockResolvedValue({
      cnpj: "12345678000199",
      date: "2026-03-09",
      quoteValue: 1.2222,
    });
    (global.fetch as jest.Mock).mockRejectedValue(new Error("provider offline"));

    const result = await fetchFundQuote("12345678000199", "2026-03-10");

    expect(result).toEqual({
      cnpj: "12345678000199",
      date: "2026-03-09",
      quoteValue: 1.2222,
    });
    expect(mockedSaveFundQuote).not.toHaveBeenCalled();
  });

  it("returns null when there is no provider configured and no cached quote", async () => {
    mockedGetLatestFundQuote.mockResolvedValue(null);

    const result = await fetchFundQuote("12345678000199", "2026-03-10");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
