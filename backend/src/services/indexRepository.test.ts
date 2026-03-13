import { getHistoricalIndexes, resetHistoricalIndexesCache } from "./indexRepository";
import { docClient } from "./dbClient";

jest.mock("./dbClient", () => ({
  docClient: {
    send: jest.fn(),
  },
}));

const mockedSend = docClient.send as jest.MockedFunction<typeof docClient.send>;

describe("indexRepository concurrency", () => {
  beforeEach(() => {
    resetHistoricalIndexesCache();
    mockedSend.mockReset();
  });

  it("reuses the same in-flight cache load for concurrent requests", async () => {
    mockedSend.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        Items: [
          { indexType: "CDI", date: "2026-03-01", rate: 0.0006 },
          { indexType: "CDI", date: "2026-03-10", rate: 0.0006 },
        ],
      } as any;
    });

    const [first, second] = await Promise.all([
      getHistoricalIndexes("CDI", "2026-03-01"),
      getHistoricalIndexes("CDI", "2026-03-05"),
    ]);

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
  });
});
