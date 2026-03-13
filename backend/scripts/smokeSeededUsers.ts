import { requireSeedPassword } from "./devSecrets";

process.env.IS_OFFLINE = "true";
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";
process.env.JWT_SECRET = process.env.JWT_SECRET || "smoke-test-only-secret";

const sharedPassword = requireSeedPassword();
const users = [
  { email: "qa.user1@teste.com", password: sharedPassword, minInvestments: 12 },
  { email: "qa.user6@teste.com", password: sharedPassword, minInvestments: 12 },
  { email: "heavy@teste.com", password: sharedPassword, minInvestments: 1500 },
];

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
  const [{ handler: authHandler }, { handler: investmentsHandler }, { handler: indexesHandler }] = await Promise.all([
    import("../src/handlers/authHandler"),
    import("../src/handlers/investmentsHandler"),
    import("../src/handlers/indexesHandler"),
  ]);

  async function login(email: string, password: string) {
    const response = await authHandler(createEvent("POST", "/api/auth/login", { email, password }));
    const body = JSON.parse(response.body || "{}");
    const rawCookie = response.headers?.["Set-Cookie"] || response.headers?.["set-cookie"] || "";
    const cookie = String(rawCookie);
    return { response, body, cookie };
  }

  for (const user of users) {
    const loginResult = await login(user.email, user.password);
    if (loginResult.response.statusCode !== 200 || !loginResult.cookie) {
      throw new Error(`Login failed for ${user.email}: ${loginResult.response.statusCode}`);
    }

    const investmentsResponse = await investmentsHandler(createEvent("GET", "/api/investments", undefined, { cookie: loginResult.cookie }));
    const evolutionResponse = await investmentsHandler(createEvent("GET", "/api/investments/evolution", undefined, { cookie: loginResult.cookie }));
    const indexesResponse = await indexesHandler(createEvent("GET", "/api/indexes"));

    if (investmentsResponse.statusCode !== 200) {
      throw new Error(`Investments endpoint failed for ${user.email}: ${investmentsResponse.statusCode}`);
    }

    if (evolutionResponse.statusCode !== 200) {
      throw new Error(`Evolution endpoint failed for ${user.email}: ${evolutionResponse.statusCode}`);
    }

    if (indexesResponse.statusCode !== 200) {
      throw new Error(`Indexes endpoint failed: ${indexesResponse.statusCode}`);
    }

    const investmentsBody = JSON.parse(investmentsResponse.body || "{}");
    const evolutionBody = JSON.parse(evolutionResponse.body || "{}");
    const investmentCount = Array.isArray(investmentsBody.items) ? investmentsBody.items.length : 0;
    const evolutionCount = Array.isArray(evolutionBody.items) ? evolutionBody.items.length : 0;

    if (investmentCount < user.minInvestments) {
      throw new Error(`Unexpected investment count for ${user.email}: ${investmentCount}`);
    }

    if (evolutionCount === 0) {
      throw new Error(`Evolution returned no items for ${user.email}`);
    }

    console.log(`[smoke] ${user.email}: investments=${investmentCount}, evolution=${evolutionCount}`);
  }

  console.log("[smoke] Seeded-user smoke test passed.");
}

run().catch((error) => {
  console.error("[smoke] Failure", error);
  process.exitCode = 1;
});
