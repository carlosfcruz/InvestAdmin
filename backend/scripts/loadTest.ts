import { requireSeedPassword } from "./devSecrets";

process.env.IS_OFFLINE = "true";
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";
process.env.JWT_SECRET = process.env.JWT_SECRET || "load-test-only-secret";

const TARGET_EMAIL = process.env.DEV_HEAVY_EMAIL || "heavy@teste.com";
const TARGET_PASSWORD = requireSeedPassword();
const TEST_DURATION_MS = 15000;
const REQUESTS_PER_SECOND = 50;

function createEvent(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return {
    body: body ? JSON.stringify(body) : null,
    headers,
    requestContext: {
      http: {
        method,
        path,
        sourceIp: "127.0.0.1",
      },
    },
    pathParameters: {},
    queryStringParameters: {},
  } as any;
}

async function run() {
  const [{ handler: authHandler }, { handler: investmentsHandler }] = await Promise.all([
    import("../src/handlers/authHandler"),
    import("../src/handlers/investmentsHandler"),
  ]);

  async function login() {
    const response = await authHandler(createEvent("POST", "/api/auth/login", { email: TARGET_EMAIL, password: TARGET_PASSWORD }));
    if (response.statusCode !== 200) {
      throw new Error(`Login failed: ${response.statusCode} ${response.body}`);
    }

    const rawCookie = response.headers?.["Set-Cookie"] || response.headers?.["set-cookie"] || "";
    const cookie = String(rawCookie);
    if (!cookie) {
      throw new Error("Login did not return an auth cookie.");
    }

    return cookie;
  }

  console.log("Starting direct-handler load test...");
  const cookie = await login();
  console.log(`Heavy user authenticated: ${TARGET_EMAIL}`);

  let totalRequests = 0;
  let successCount = 0;
  let errorCount = 0;
  const latencies: number[] = [];

  const startTime = Date.now();
  const delay = 1000 / REQUESTS_PER_SECOND;

  const interval = setInterval(async () => {
    if (Date.now() - startTime >= TEST_DURATION_MS) {
      clearInterval(interval);
      return;
    }

    totalRequests += 1;
    const requestStart = Date.now();

    try {
      const response = await investmentsHandler(createEvent("GET", "/api/investments/evolution", undefined, { cookie }));
      JSON.parse(response.body || "{}");

      if (response.statusCode === 200) {
        successCount += 1;
      } else {
        errorCount += 1;
      }
    } catch {
      errorCount += 1;
    } finally {
      latencies.push(Date.now() - requestStart);
    }
  }, delay);

  await new Promise((resolve) => setTimeout(resolve, TEST_DURATION_MS + 5000));

  latencies.sort((left, right) => left - right);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const avg = latencies.reduce((sum, value) => sum + value, 0) / (latencies.length || 1);

  console.log("\n============ LOAD TEST RESULTS ============");
  console.log("Target Flow: heavy login + GET /api/investments/evolution");
  console.log(`Total Requests Sent: ${totalRequests}`);
  console.log(`Successful Responses (200 OK): ${successCount}`);
  console.log(`Failed Responses: ${errorCount}`);
  console.log(`Average Latency: ${avg.toFixed(2)}ms`);
  console.log(`P95 Latency: ${p95}ms`);
  console.log(`Max Latency: ${max}ms`);
  console.log("===========================================");
}

run().catch((error) => {
  console.error("[load] Failure", error);
  process.exitCode = 1;
});
