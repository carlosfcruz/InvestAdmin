import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { getLatestIndexes, getLatestIndexesDisplay } from "../services/indexes";
import { withSecurityHeaders } from "../utils/security";

export async function handler(
  _event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const latestByType = await getLatestIndexes();
  const displayByType = await getLatestIndexesDisplay(latestByType);
  const indexes = Object.values(latestByType);

  return withSecurityHeaders({
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ latest: latestByType, items: indexes, display: displayByType }),
  });
}
