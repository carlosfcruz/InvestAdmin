import { getDynamoClientProps, getJwtSecret } from "./runtime";

describe("runtime helpers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns the configured JWT secret when present", () => {
    process.env.JWT_SECRET = "configured-secret";
    delete process.env.JEST_WORKER_ID;

    expect(getJwtSecret()).toBe("configured-secret");
  });

  it("falls back to a test-only secret during jest execution", () => {
    delete process.env.JWT_SECRET;
    process.env.JEST_WORKER_ID = "1";

    expect(getJwtSecret()).toBe("test-only-jwt-secret");
  });

  it("throws when JWT secret is missing outside tests", () => {
    delete process.env.JWT_SECRET;
    delete process.env.JEST_WORKER_ID;

    expect(() => getJwtSecret()).toThrow("JWT_SECRET");
  });

  it("prefers the local DynamoDB endpoint when configured", () => {
    process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";

    expect(getDynamoClientProps()).toMatchObject({
      region: "localhost",
      endpoint: "http://localhost:8000",
    });
  });
});
