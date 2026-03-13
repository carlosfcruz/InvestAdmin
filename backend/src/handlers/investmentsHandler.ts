import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { Investment } from "../models/investment";
import { docClient } from "../services/dbClient";
import { getLatestIndexes } from "../services/indexes";
import { withMetrics } from "../services/calculations";
import { PutCommand, QueryCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { sanitizeObject, withSecurityHeaders } from '../utils/security';
import { fetchFundQuote } from "../services/cvmService";
import { getTodayDateKey, parseInvestmentDate, toDateKey } from "../utils/date";
import { getDefaultIndexerForType, isIndexerAllowedForType } from "../domain/productRules";
import { attachBenchmarkSummaries } from "../services/portfolioAnalytics";
import { analyzeInvestmentOpportunities } from "../services/investmentOpportunities";
import { getJwtSecret } from "../utils/runtime";

const SECRET = getJwtSecret();

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS";

const evolutionCache = new Map<string, { data: any, timestamp: number }>();
const evolutionPromises = new Map<string, Promise<APIGatewayProxyStructuredResultV2>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes instead of 1 hour

function clearEvolutionCache(userId: string) {
  // Clear all cache entries for this user (different types)
  for (const key of evolutionCache.keys()) {
    if (key.startsWith(`${userId}_`)) {
      evolutionCache.delete(key);
    }
  }
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = (event.requestContext.http.method || "GET") as HttpMethod;

  if (method === "OPTIONS") {
    return buildResponse(200, { ok: true });
  }

  try {
    // In a real app we'd get this from a valid JWT authorizer context
    const userId = getUserIdFromMockToken(event);
    if (!userId) {
      return buildResponse(401, { message: "Unauthorized" });
    }

    switch (method) {
      case "GET":
        if (event.requestContext.http.path.endsWith('/summary')) {
          return handleGetPortfolioSummary(userId);
        }
        if (event.requestContext.http.path.endsWith('/opportunities')) {
          return handleGetInvestmentOpportunities(userId);
        }
        if (event.pathParameters?.id) {
          if (event.requestContext.http.path.endsWith('/evolution')) {
            return handleGetInvestmentEvolution(userId, event.pathParameters.id);
          }
          return handleGetInvestment(userId, event.pathParameters.id);
        }
        if (event.requestContext.http.path.endsWith('/evolution')) {
          return handleGetPortfolioEvolution(userId, event);
        }
        return handleListInvestments(userId);
      case "POST":
        clearEvolutionCache(userId);
        if (event.requestContext.http.path.endsWith('/redeem')) {
          return handleRedeemInvestments(userId, event);
        }
        return handleCreateInvestment(userId, event);
      case "PUT":
        clearEvolutionCache(userId);
        return handleUpdateInvestment(userId, event.pathParameters?.id || "", event);
      case "DELETE":
        if (event.pathParameters?.id) {
          clearEvolutionCache(userId);
          return handleDeleteInvestment(userId, event.pathParameters.id);
        }
        return buildResponse(400, { message: "Missing investment ID" });
      default:
        return buildResponse(405, { message: "Method not allowed" });
    }
  } catch (error) {
    console.error("Unhandled error in investmentsHandler", error);
    return buildResponse(500, { message: "Internal server error" });
  }
}

// Extract and verify token
function getUserIdFromMockToken(event: APIGatewayProxyEventV2): string | null {
  const cookiesStr = event.headers?.cookie || '';
  if (!cookiesStr) return null;

  try {
    const cookies = cookiesStr.split(';').reduce((acc, current) => {
      const parts = current.trim().split('=');
      if (parts[0]) acc[parts[0]] = parts[1] || '';
      return acc;
    }, {} as Record<string, string>);

    const token = cookies['token'];
    if (!token) return null;

    // Verify token signature and expiration
    const payload = jwt.verify(token, SECRET) as any;
    return payload.email || payload.userId; // We used email as pk
  } catch (e) {
    console.error("Token verification failed:", e);
    return null;
  }
}

async function handleListInvestments(
  userId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const itemsWithMetrics = await loadInvestmentsWithMetrics(userId, undefined, true);
  return buildResponse(200, { items: itemsWithMetrics });
}

async function loadInvestmentsWithMetrics(
  userId: string,
  latestIndexes?: Awaited<ReturnType<typeof getLatestIndexes>>,
  includeBenchmarks = false
) {
  const command = new QueryCommand({
    TableName: 'Investments',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  });

  const response = await docClient.send(command);
  const items = response.Items as Investment[] || [];

  // Update fund quotes if needed
  const itemsWithQuotes = await Promise.all(items.map(async inv => {
    if (inv.type === 'FUNDO' && inv.cnpj) {
      const q = await fetchFundQuote(inv.cnpj);
      if (q) {
        return { ...inv, lastQuoteValue: q.quoteValue, lastQuoteDate: q.date };
      }
    }
    return inv;
  }));

  const resolvedLatestIndexes = latestIndexes || await getLatestIndexes();
  const itemsWithMetrics = await Promise.all(itemsWithQuotes.map(inv => withMetrics(inv, resolvedLatestIndexes)));
  if (!includeBenchmarks) {
    return itemsWithMetrics;
  }

  return attachBenchmarkSummaries(itemsWithMetrics, resolvedLatestIndexes);
}

async function handleGetPortfolioSummary(
  userId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const latestIndexes = await getLatestIndexes();
  const itemsWithMetrics = await loadInvestmentsWithMetrics(userId, latestIndexes);
  const { calculatePortfolioSummary } = await import("../services/portfolioAnalytics");
  const summary = await calculatePortfolioSummary(itemsWithMetrics, latestIndexes);

  return buildResponse(200, { summary });
}

async function handleGetInvestmentOpportunities(
  userId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const latestIndexes = await getLatestIndexes();
  const itemsWithMetrics = await loadInvestmentsWithMetrics(userId, latestIndexes, true) as Awaited<ReturnType<typeof attachBenchmarkSummaries>>;
  const opportunities = analyzeInvestmentOpportunities(itemsWithMetrics);

  return buildResponse(200, opportunities);
}

async function handleGetInvestment(
  userId: string,
  investmentId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const command = new GetCommand({
    TableName: 'Investments',
    Key: { userId, investmentId }
  })
  const response = await docClient.send(command);
  let item = response.Item as Investment;

  // Update fund quote if needed
  if (item.type === 'FUNDO' && item.cnpj) {
    const q = await fetchFundQuote(item.cnpj);
    if (q) {
      item = { ...item, lastQuoteValue: q.quoteValue, lastQuoteDate: q.date };
    }
  }

  const latestIndexes = await getLatestIndexes();
  const itemWithMetrics = await withMetrics(item, latestIndexes);
  const [itemWithBenchmark] = await attachBenchmarkSummaries([itemWithMetrics], latestIndexes);

  return buildResponse(200, itemWithBenchmark);
}

async function handleCreateInvestment(
  userId: string,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return buildResponse(400, { message: "Missing request body" });
  }

  let payload: Partial<Investment>;
  try {
    payload = sanitizeObject(JSON.parse(event.body));
  } catch {
    return buildResponse(400, { message: "Invalid JSON body" });
  }

  const validationError = validateInvestmentPayload(payload);
  if (validationError) return buildResponse(422, { message: validationError });

  const now = new Date().toISOString();

  const created = {
    userId,
    investmentId: `inv_${crypto.randomUUID()}`,
    type: payload.type || "CDB",
    indexer: payload.indexer || getDefaultIndexerForType(payload.type || "CDB"),
    origin: payload.origin || "MANUAL",
    issuer: payload.issuer || "Unknown",
    productName: payload.productName || "Product",
    rate: payload.rate || 100,
    applicationDate: payload.applicationDate || now,
    maturityDate: payload.maturityDate || null,
    amountInvested: payload.amountInvested || 0,
    liquidity: payload.liquidity || "D+0",
    incomeTaxRegime: payload.incomeTaxRegime || "REGRESSIVE",
    hasFGC: payload.hasFGC ?? true,
    portfolioStatus: payload.portfolioStatus || "ACTIVE",
    redeemedAt: payload.redeemedAt || null,
    redeemedAmount: payload.redeemedAmount || null,
    createdAt: now,
    updatedAt: now,
    riskNotes: payload.riskNotes,
    redemptionRules: payload.redemptionRules
  };

  const command = new PutCommand({
    TableName: 'Investments',
    Item: created
  });

  await docClient.send(command);

  // Invalidate Cache
  evolutionCache.delete(userId);
  evolutionPromises.delete(userId);

  console.info(`[AUDIT] User ${userId} created investment ${created.investmentId}`);

  return buildResponse(201, created);
}

async function handleDeleteInvestment(
  userId: string,
  investmentId: string
): Promise<APIGatewayProxyStructuredResultV2> {
  const command = new DeleteCommand({
    TableName: 'Investments',
    Key: { userId, investmentId }
  });
  await docClient.send(command);

  // Invalidate Cache
  evolutionCache.delete(userId);
  evolutionPromises.delete(userId);

  console.info(`[AUDIT] User ${userId} deleted investment ${investmentId}`);
  return buildResponse(200, { message: "Deleted successfully" });
}

async function handleUpdateInvestment(
  userId: string,
  investmentId: string,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return buildResponse(400, { message: "Missing request body" });
  }

  let payload: Partial<Investment>;
  try {
    payload = sanitizeObject(JSON.parse(event.body));
  } catch {
    return buildResponse(400, { message: "Invalid JSON body" });
  }

  const validationError = validateInvestmentPayload(payload);
  if (validationError) return buildResponse(422, { message: validationError });

  const getCommand = new GetCommand({
    TableName: 'Investments',
    Key: { userId, investmentId }
  });
  const existing = await docClient.send(getCommand);
  if (!existing.Item) {
    return buildResponse(404, { message: "Investment not found" });
  }

  const updated = {
    ...existing.Item,
    ...payload,
    issuer: payload.issuer !== undefined ? payload.issuer : existing.Item?.issuer,
    productName: payload.productName !== undefined ? payload.productName : existing.Item?.productName,
    userId, // prevent overriding keys
    investmentId,
    updatedAt: new Date().toISOString()
  };

  const putCommand = new PutCommand({
    TableName: 'Investments',
    Item: updated
  });

  await docClient.send(putCommand);

  // Invalidate Cache
  evolutionCache.delete(userId);
  evolutionPromises.delete(userId);

  console.info(`[AUDIT] User ${userId} updated investment ${investmentId}`);
  return buildResponse(200, updated);
}

async function handleRedeemInvestments(
  userId: string,
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  if (!event.body) {
    return buildResponse(400, { message: "Missing request body" });
  }

  let payload: { investmentIds?: string[] };
  try {
    payload = sanitizeObject(JSON.parse(event.body));
  } catch {
    return buildResponse(400, { message: "Invalid JSON body" });
  }

  const investmentIds = Array.isArray(payload.investmentIds)
    ? payload.investmentIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (investmentIds.length === 0) {
    return buildResponse(422, { message: "At least one investment ID is required" });
  }

  const latestIndexes = await getLatestIndexes();
  const now = new Date().toISOString();
  const redeemedItems: Investment[] = [];

  for (const investmentId of investmentIds) {
    const getCommand = new GetCommand({
      TableName: "Investments",
      Key: { userId, investmentId }
    });

    const existing = await docClient.send(getCommand);
    if (!existing.Item) {
      continue;
    }

    const investment = existing.Item as Investment;
    const investmentWithMetrics = await withMetrics(investment, latestIndexes);
    const redeemedAmount = investmentWithMetrics.maturityNetValue
      || investmentWithMetrics.netValue
      || investmentWithMetrics.currentValue
      || investment.amountInvested;

    const updatedInvestment: Investment = {
      ...investment,
      portfolioStatus: "REDEEMED",
      redeemedAt: now,
      redeemedAmount,
      updatedAt: now,
    };

    const putCommand = new PutCommand({
      TableName: "Investments",
      Item: updatedInvestment,
    });

    await docClient.send(putCommand);
    redeemedItems.push(updatedInvestment);
  }

  return buildResponse(200, {
    redeemedCount: redeemedItems.length,
    items: redeemedItems,
  });
}

async function handleGetInvestmentEvolution(userId: string, investmentId: string): Promise<APIGatewayProxyStructuredResultV2> {
  const { withMetrics } = await import("../services/calculations");
  const { getLatestIndexes } = await import("../services/indexes");
  const { calculateInvestmentEvolutionSeries } = await import("../services/portfolioAnalytics");

  const getCommand = new GetCommand({
    TableName: 'Investments',
    Key: { userId, investmentId }
  });
  const response = await docClient.send(getCommand);
  if (!response.Item) return buildResponse(404, { message: "Investment not found" });

  const investment = response.Item as Investment;
  const latestIndexes = await getLatestIndexes();
  const investmentWithMetrics = await withMetrics(investment, latestIndexes);
  const evolution = await calculateInvestmentEvolutionSeries(investmentWithMetrics);

  return buildResponse(200, { items: evolution });
}

export async function handleGetPortfolioEvolution(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const assetType = event.queryStringParameters?.type || 'ALL';
  const cacheKey = `${userId}_${assetType}`;

  // 1. Check TTL Cache
  const now = Date.now();
  const cached = evolutionCache.get(cacheKey);
  // Ensure cached data is the expected format.
  if (cached && (now - cached.timestamp < CACHE_TTL_MS) && Array.isArray(cached.data) && (cached.data.length === 0 || cached.data[0].profit !== undefined)) {
    return buildResponse(200, { items: cached.data });
  }

  // 2. Cache Stampede Protection
  if (evolutionPromises.has(cacheKey)) {
    return evolutionPromises.get(cacheKey)!;
  }

  const calculationPromise = (async () => {
    const scanCommand = new QueryCommand({
      TableName: 'Investments',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId }
    });
    const response = await docClient.send(scanCommand);
    let investments = (response.Items || []) as Investment[];

    // Apply Category/Type Filter
    if (assetType !== 'ALL') {
      const typeMapping: Record<string, string[]> = {
        'TESOURO': ['TESOURO', 'Tesouro Direto', 'TESOURO_DIRETO'],
        'RENDA_FIXA': ['CDB', 'LCI', 'LCA', 'LC', 'DEBENTURE', 'RENDA_FIXA'],
        'VARIAVEL': ['ACAO', 'FII', 'STOCK', 'REIT', 'VARIAVEL', 'RENDA_VARIAVEL'],
        'FUNDOS': ['FUNDO', 'FUNDO_INVESTIMENTO', 'FUNDOS'],
        'OUTROS': ['CRIPTOMOEDA', 'OUTROS', 'CRIPTO_ZUMBI']
      };

      const allowedTypes = typeMapping[assetType] || [assetType];
      investments = investments.filter(inv =>
        allowedTypes.includes(inv.type.toUpperCase()) ||
        allowedTypes.includes(inv.type)
      );
    }

    if (investments.length === 0) {
      evolutionPromises.delete(cacheKey);
      return buildResponse(200, { items: [] });
    }

    const latestIndexes = await getLatestIndexes();
    const investmentsWithMetrics = await Promise.all(investments.map(inv => withMetrics(inv, latestIndexes)));
    const activeInvestments = investmentsWithMetrics.filter((investment) => (
      investment.portfolioStatus !== "REDEEMED" && investment.maturityStatus !== "MATURED"
    ));

    if (activeInvestments.length === 0) {
      evolutionPromises.delete(cacheKey);
      return buildResponse(200, { items: [] });
    }

    const { calculatePortfolioEvolutionSeries } = await import("../services/portfolioAnalytics");
    const items = await calculatePortfolioEvolutionSeries(activeInvestments);

    // Save to Cache
    evolutionCache.set(cacheKey, { data: items, timestamp: Date.now() });
    evolutionPromises.delete(cacheKey);

    console.log(`[EVOLUTION] Returning ${items.length} items for ${userId}. Sample:`, items[0]);

    return buildResponse(200, { items });
  })();

  evolutionPromises.set(cacheKey, calculationPromise);
  return calculationPromise;
}

function validateRateByIndexer(payload: Partial<Investment>): string | null {
  if (payload.type === "FUNDO" || payload.rate === undefined) {
    return null;
  }

  if (typeof payload.rate !== "number" || payload.rate <= 0 || payload.rate > 10000) {
    return "Rate must be a positive number and within a reasonable range";
  }

  switch (payload.indexer) {
    case "PREFIXADO":
      if (payload.rate > 40) {
        return "Prefixado must be informed as an annual rate up to 40% a.a.";
      }
      return null;
    case "IPCA":
      if (payload.rate > 30) {
        return "IPCA spread must be informed as annual spread up to 30%.";
      }
      return null;
    case "CDI":
    case "SELIC":
      if (payload.rate > 300) {
        return "CDI/SELIC products must be informed as a percentage of the index up to 300%.";
      }
      return null;
    default:
      return null;
  }
}

export function validateInvestmentPayload(payload: Partial<Investment>): string | null {
  if (payload.type && !["CDB", "LCI", "LCA", "TESOURO", "CRI", "CRA", "DEBENTURE", "LC", "FUNDO"].includes(payload.type)) {
    return `Invalid investment type: ${payload.type}`;
  }
  if (payload.indexer && !["CDI", "SELIC", "IPCA", "PREFIXADO", "IGP-M"].includes(payload.indexer)) {
    return `Invalid indexer: ${payload.indexer}`;
  }
  if (payload.portfolioStatus && !["ACTIVE", "REDEEMED"].includes(payload.portfolioStatus)) {
    return `Invalid portfolio status: ${payload.portfolioStatus}`;
  }
  if (payload.type && payload.indexer && !isIndexerAllowedForType(payload.type, payload.indexer)) {
    return `Invalid combination: ${payload.type} does not support ${payload.indexer}`;
  }

  if (payload.type !== 'FUNDO') {
    if (payload.amountInvested !== undefined && (typeof payload.amountInvested !== 'number' || payload.amountInvested <= 0)) {
      return "Amount invested must be a positive number";
    }
    const rateValidationError = validateRateByIndexer(payload);
    if (rateValidationError) {
      return rateValidationError;
    }
  } else {
    if (payload.quantity !== undefined && (typeof payload.quantity !== 'number' || payload.quantity <= 0)) {
      return "Quantity must be a positive number for funds";
    }
    if (payload.purchaseQuoteValue !== undefined && (typeof payload.purchaseQuoteValue !== 'number' || payload.purchaseQuoteValue <= 0)) {
      return "Purchase quote value must be a positive number for funds";
    }
  }
  if (payload.applicationDate && payload.maturityDate) {
    if (toDateKey(parseInvestmentDate(payload.applicationDate)) >= toDateKey(parseInvestmentDate(payload.maturityDate))) {
      return "Maturity date must be strictly after the application date";
    }
  }
  if (payload.applicationDate) {
    const applicationDate = parseInvestmentDate(payload.applicationDate);
    if (isNaN(applicationDate.getTime())) {
      return "Application date is invalid";
    }

    if (toDateKey(applicationDate) > getTodayDateKey()) {
      return "Application date cannot be in the future";
    }
  }
  return null;
}

function sanitizeString(str?: string): string {
  if (!str) return '';
  return str.replace(/[&<"'>]/g, (m) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[m] || m;
  });
}

function buildResponse(
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 {
  return withSecurityHeaders({
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}  


