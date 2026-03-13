import { docClient } from "../src/services/dbClient";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

async function clearIndexes() {
    console.log("Fetching all EconomicIndexes...");
    try {
        const scan = new ScanCommand({ TableName: 'EconomicIndexes' });
        const response = await docClient.send(scan);

        if (!response.Items || response.Items.length === 0) {
            console.log("No items found.");
            return;
        }

        console.log(`Found ${response.Items.length} items. Deleting...`);

        for (const item of response.Items) {
            await docClient.send(new DeleteCommand({
                TableName: 'EconomicIndexes',
                Key: {
                    indexType: item.indexType,
                    date: item.date
                }
            }));
        }
        console.log("Successfully deleted all EconomicIndexes items.");
    } catch (error) {
        console.error("Error clearing indexes:", error);
    }
}

clearIndexes();
