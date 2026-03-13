import { PutCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dbClient";
import { EconomicIndex, EconomicIndexType } from "../models/economicIndex";

const TABLE_NAME = "EconomicIndexes";

let globalIndexCache: Record<EconomicIndexType, EconomicIndex[]> = {
  SELIC: [],
  CDI: [],
  IPCA: [],
};

let isCacheLoaded: Record<EconomicIndexType, boolean> = {
  SELIC: false,
  CDI: false,
  IPCA: false,
};

let cacheLoadPromises: Record<EconomicIndexType, Promise<void> | null> = {
  SELIC: null,
  CDI: null,
  IPCA: null,
};

export async function saveIndex(index: EconomicIndex): Promise<void> {
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: index,
  });
  await docClient.send(command);
}

export async function getLatestIndex(indexType: EconomicIndexType): Promise<EconomicIndex | null> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "indexType = :it",
    ExpressionAttributeValues: {
      ":it": indexType,
    },
    ScanIndexForward: false,
    Limit: 1,
  });

  const response = await docClient.send(command);
  if (response.Items && response.Items.length > 0) {
    return response.Items[0] as EconomicIndex;
  }

  return null;
}

export async function saveIndexes(indexes: EconomicIndex[]): Promise<void> {
  if (indexes.length === 0) return;

  const chunkSize = 25;
  for (let index = 0; index < indexes.length; index += chunkSize) {
    const chunk = indexes.slice(index, index + chunkSize);
    const putRequests = chunk.map((item) => ({
      PutRequest: { Item: item },
    }));

    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: putRequests,
      },
    });

    await docClient.send(command);
  }
}

async function loadHistoricalIndexesIntoCache(indexType: EconomicIndexType): Promise<void> {
  console.log(`[CACHE MISS] Fetching full history for ${indexType} from DynamoDB...`);
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "indexType = :it",
    ExpressionAttributeValues: {
      ":it": indexType,
    },
    ScanIndexForward: true,
  });

  const response = await docClient.send(command);
  let items = (response.Items as EconomicIndex[]) || [];

  const { HISTORICAL_CODES } = await import("./bcbService");
  const isSupported = indexType in HISTORICAL_CODES;

  if (items.length === 0 && isSupported) {
    console.log(`[BOOTSTRAP] missing ${indexType} history. Bootstrapping now...`);
    const { bootstrapHistoricalData } = await import("./indexes");

    try {
      await bootstrapHistoricalData(indexType, 2018);
    } catch (error) {
      console.warn(`[BOOTSTRAP] Failed for ${indexType}:`, error);
    }

    const retryResponse = await docClient.send(command);
    items = (retryResponse.Items as EconomicIndex[]) || [];
  }

  globalIndexCache[indexType] = items;
  isCacheLoaded[indexType] = true;
}

export async function getHistoricalIndexes(indexType: EconomicIndexType, startDate: string): Promise<EconomicIndex[]> {
  if (!isCacheLoaded[indexType]) {
    if (!cacheLoadPromises[indexType]) {
      cacheLoadPromises[indexType] = loadHistoricalIndexesIntoCache(indexType)
        .finally(() => {
          cacheLoadPromises[indexType] = null;
        });
    }

    await cacheLoadPromises[indexType];
  }

  return globalIndexCache[indexType].filter((index) => index.date >= startDate);
}

export function resetHistoricalIndexesCache(): void {
  globalIndexCache = {
    SELIC: [],
    CDI: [],
    IPCA: [],
  };

  isCacheLoaded = {
    SELIC: false,
    CDI: false,
    IPCA: false,
  };

  cacheLoadPromises = {
    SELIC: null,
    CDI: null,
    IPCA: null,
  };
}
