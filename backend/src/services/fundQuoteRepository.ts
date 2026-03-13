import { PutCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dbClient";
import { FundQuote } from "../models/fundQuote";

const TABLE_NAME = "FundQuotes";

export async function saveFundQuote(quote: FundQuote): Promise<void> {
    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: quote,
    });
    await docClient.send(command);
}

export async function saveFundQuotes(quotes: FundQuote[]): Promise<void> {
    if (quotes.length === 0) return;

    const CHUNK_SIZE = 25;
    for (let i = 0; i < quotes.length; i += CHUNK_SIZE) {
        const chunk = quotes.slice(i, i + CHUNK_SIZE);
        const putRequests = chunk.map(quote => ({
            PutRequest: { Item: quote }
        }));

        const command = new BatchWriteCommand({
            RequestItems: {
                [TABLE_NAME]: putRequests
            }
        });
        await docClient.send(command);
    }
}

export async function getFundHistory(cnpj: string, startDate: string): Promise<FundQuote[]> {
    const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "cnpj = :c AND #d >= :s",
        ExpressionAttributeNames: {
            "#d": "date"
        },
        ExpressionAttributeValues: {
            ":c": cnpj,
            ":s": startDate
        },
        ScanIndexForward: true,
    });

    const response = await docClient.send(command);
    return (response.Items as FundQuote[]) || [];
}

export async function getLatestFundQuote(cnpj: string): Promise<FundQuote | null> {
    const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "cnpj = :c",
        ExpressionAttributeValues: {
            ":c": cnpj
        },
        ScanIndexForward: false,
        Limit: 1
    });

    const response = await docClient.send(command);
    if (response.Items && response.Items.length > 0) {
        return response.Items[0] as FundQuote;
    }
    return null;
}
