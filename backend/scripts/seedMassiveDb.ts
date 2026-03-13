import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";

const isOffline = process.env.IS_OFFLINE !== "false";
const clientProps = isOffline
  ? {
      region: "localhost",
      endpoint: "http://localhost:8000",
      credentials: { accessKeyId: "MockAccessKeyId", secretAccessKey: "MockSecretAccessKey" },
    }
  : {
      region: process.env.AWS_REGION || "us-east-1",
    };

const client = new DynamoDBClient(clientProps);
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const USERS_TABLE = "Users";
const INVESTMENTS_TABLE = "Investments";
const FUND_QUOTES_TABLE = "FundQuotes";
const BATCH_SIZE = 25;
const COMMON_PASSWORD = "Senha123!";
const HEAVY_USER_EMAIL = "heavy@teste.com";
const HEAVY_USER_INVESTMENTS = 1500;
const STANDARD_USER_COUNT = 12;
const STANDARD_INVESTMENTS_PER_USER = 12;
const FUND_CNPJS = [
  "11111111000191",
  "22222222000191",
  "33333333000191",
  "44444444000191",
];

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const rng = createRng(20260310);

function randomBetween(min: number, max: number) {
  return min + (max - min) * rng();
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1));
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0] || "";
}

function toIsoDateTime(date: Date) {
  return date.toISOString();
}

async function clearTable(tableName: string, keyAttributes: string[]) {
  console.log(`[seed] Clearing ${tableName}...`);
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let removed = 0;

  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    const items = response.Items || [];
    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;

    for (let index = 0; index < items.length; index += BATCH_SIZE) {
      const chunk = items.slice(index, index + BATCH_SIZE);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            DeleteRequest: {
              Key: keyAttributes.reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = item[key];
                return acc;
              }, {}),
            },
          })),
        },
      }));
      removed += chunk.length;
    }
  } while (lastEvaluatedKey);

  console.log(`[seed] ${tableName} cleared (${removed} items removed).`);
}

async function batchWrite(tableName: string, items: Record<string, unknown>[]) {
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    const chunk = items.slice(index, index + BATCH_SIZE);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((item) => ({
          PutRequest: { Item: item },
        })),
      },
    }));
  }
}

function buildUser(email: string, passwordHash: string) {
  return {
    userId: email,
    id: crypto.randomUUID(),
    passwordHash,
    createdAt: toIsoDateTime(new Date()),
  };
}

function buildFixedIncomeInvestment(userId: string, index: number) {
  const type = pickOne(["CDB", "TESOURO", "LCI", "LCA"] as const);
  const indexer = pickOne(["CDI", "SELIC", "IPCA", "PREFIXADO"] as const);
  const applicationDate = addDays(new Date("2019-01-01T12:00:00.000Z"), randomInt(0, 2550));
  const hasMaturity = rng() > 0.15;
  const maturityDate = hasMaturity ? addDays(applicationDate, randomInt(180, 2200)) : null;
  const baseRate = indexer === "CDI" || indexer === "SELIC"
    ? Number(randomBetween(90, 130).toFixed(2))
    : Number(randomBetween(5.2, 13.5).toFixed(2));
  const amountInvested = Number(randomBetween(500, 125000).toFixed(2));
  const issuerPrefix = type === "TESOURO" ? "Tesouro Nacional" : "Banco QA";

  return {
    userId,
    investmentId: crypto.randomUUID(),
    type,
    indexer,
    origin: "MANUAL",
    issuer: `${issuerPrefix} ${((index % 17) + 1).toString().padStart(2, "0")}`,
    productName: `${type} ${indexer} QA ${index.toString().padStart(4, "0")}`,
    rate: baseRate,
    applicationDate: toIsoDateTime(applicationDate),
    maturityDate: maturityDate ? toIsoDateTime(maturityDate) : null,
    amountInvested,
    liquidity: type === "TESOURO" ? "D+1" : "D+0",
    incomeTaxRegime: "REGRESSIVE",
    hasFGC: type !== "TESOURO",
    createdAt: toIsoDateTime(new Date()),
    updatedAt: toIsoDateTime(new Date()),
  };
}

function buildFundInvestment(userId: string, index: number) {
  const cnpj = pickOne(FUND_CNPJS);
  const applicationDate = addDays(new Date("2024-01-01T12:00:00.000Z"), randomInt(0, 780));
  const purchaseQuoteValue = Number(randomBetween(0.95, 1.45).toFixed(4));
  const quantity = Number(randomBetween(1000, 25000).toFixed(4));

  return {
    userId,
    investmentId: crypto.randomUUID(),
    type: "FUNDO",
    indexer: "PREFIXADO",
    origin: "MANUAL",
    issuer: `Gestora QA ${(index % 5) + 1}`,
    productName: `Fundo QA ${(index % FUND_CNPJS.length) + 1}`,
    rate: 0,
    applicationDate: toIsoDateTime(applicationDate),
    maturityDate: null,
    amountInvested: Number((quantity * purchaseQuoteValue).toFixed(2)),
    liquidity: "D+30",
    incomeTaxRegime: "REGRESSIVE",
    hasFGC: false,
    cnpj,
    quantity,
    purchaseQuoteValue,
    createdAt: toIsoDateTime(new Date()),
    updatedAt: toIsoDateTime(new Date()),
  };
}

function buildFundQuotes() {
  const items: Record<string, unknown>[] = [];
  const today = new Date("2026-03-10T12:00:00.000Z");
  const totalDays = 200;

  FUND_CNPJS.forEach((cnpj, fundIndex) => {
    let quoteValue = 1 + fundIndex * 0.12;
    for (let offset = totalDays; offset >= 0; offset -= 1) {
      const date = addDays(today, -offset);
      const day = date.getUTCDay();
      if (day === 0 || day === 6) {
        continue;
      }

      const drift = 0.0005 + (fundIndex * 0.00008);
      const wave = Math.sin((totalDays - offset) / 9) * 0.0009;
      quoteValue = Number((quoteValue * (1 + drift + wave)).toFixed(4));

      items.push({
        cnpj,
        date: toIsoDate(date),
        quoteValue,
      });
    }
  });

  return items;
}

function buildUsers(passwordHash: string) {
  const users = [buildUser(HEAVY_USER_EMAIL, passwordHash)];

  for (let index = 1; index <= STANDARD_USER_COUNT; index += 1) {
    users.push(buildUser(`qa.user${index}@teste.com`, passwordHash));
  }

  return users;
}

function buildInvestments() {
  const investments: Record<string, unknown>[] = [];

  for (let index = 0; index < HEAVY_USER_INVESTMENTS; index += 1) {
    const isFund = index % 11 === 0;
    investments.push(isFund ? buildFundInvestment(HEAVY_USER_EMAIL, index) : buildFixedIncomeInvestment(HEAVY_USER_EMAIL, index));
  }

  for (let userIndex = 1; userIndex <= STANDARD_USER_COUNT; userIndex += 1) {
    const userId = `qa.user${userIndex}@teste.com`;
    for (let investmentIndex = 0; investmentIndex < STANDARD_INVESTMENTS_PER_USER; investmentIndex += 1) {
      const globalIndex = userIndex * 100 + investmentIndex;
      const isFund = investmentIndex % 5 === 0;
      investments.push(isFund ? buildFundInvestment(userId, globalIndex) : buildFixedIncomeInvestment(userId, globalIndex));
    }
  }

  return investments;
}

async function seedDatabase() {
  console.log("[seed] Starting deterministic reset and reseed...");
  await clearTable(INVESTMENTS_TABLE, ["userId", "investmentId"]);
  await clearTable(USERS_TABLE, ["userId"]);
  await clearTable(FUND_QUOTES_TABLE, ["cnpj", "date"]);

  const passwordHash = await bcrypt.hash(COMMON_PASSWORD, 10);
  const users = buildUsers(passwordHash);
  const investments = buildInvestments();
  const fundQuotes = buildFundQuotes();

  console.log(`[seed] Writing ${users.length} users...`);
  await batchWrite(USERS_TABLE, users);

  console.log(`[seed] Writing ${investments.length} investments...`);
  await batchWrite(INVESTMENTS_TABLE, investments);

  console.log(`[seed] Writing ${fundQuotes.length} fund quotes...`);
  await batchWrite(FUND_QUOTES_TABLE, fundQuotes);

  console.log("[seed] Database seeding complete.");
  console.log("[seed] Credentials:");
  console.log(`  heavy: ${HEAVY_USER_EMAIL} / ${COMMON_PASSWORD}`);
  console.log(`  standard: qa.user1@teste.com..qa.user${STANDARD_USER_COUNT}@teste.com / ${COMMON_PASSWORD}`);
  console.log(`[seed] Heavy user investments: ${HEAVY_USER_INVESTMENTS}`);
  console.log(`[seed] Total investments: ${investments.length}`);
}

seedDatabase().catch((error) => {
  console.error("[seed] Failed to seed database", error);
  process.exitCode = 1;
});
