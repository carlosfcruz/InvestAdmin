import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { updateAllIndexesFromBcb, bootstrapHistoricalSelic } from "../services/indexes";
import { withSecurityHeaders } from "../utils/security";

export async function handler(
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
    try {
        let body: any = {};
        if (event.body) {
            console.log("Raw event.body:", event.body);
            try {
                body = JSON.parse(event.body);
                console.log("Parsed body:", body);
            } catch (e) {
                console.error("JSON parse error:", e);
            }
        }

        if (body.bootstrapHistorical) {
            const sinceYear = body.sinceYear || 2010;
            const count = await bootstrapHistoricalSelic(sinceYear);
            return withSecurityHeaders({
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: `Historical SELIC data synced from ${sinceYear}`, count }),
            });
        }

        const result = await updateAllIndexesFromBcb();
        return withSecurityHeaders({
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message: "Indexes updated successfully", data: result }),
        });
    } catch (e: any) {
        return withSecurityHeaders({
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message: "Failed to update indexes", error: e.message }),
        });
    }
}
