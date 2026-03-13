import { calculateHistoricalMetrics, calculateEvolution } from '../src/services/calculations';
import { docClient } from '../src/services/dbClient';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getLatestIndexes } from '../src/services/indexes';
import { getHistoricalIndexes } from '../src/services/indexRepository';

async function run() {
    const { Items } = await docClient.send(new ScanCommand({ TableName: 'Investments' }));
    const latestIndexes = await getLatestIndexes();

    for (const inv of Items || []) {
        if (inv.userId !== 'heavy@teste.com') continue;

        try {
            const metrics = await calculateHistoricalMetrics(inv as any, latestIndexes);

            const history = await getHistoricalIndexes("SELIC", inv.applicationDate);
            const evolution = calculateEvolution(inv as any, history);
            const maxVal = Math.max(...evolution.map(e => e.value));

            if (maxVal > 1e10 || metrics.maturityValue > 1e10) {
                console.log(`[BUG FOUND] Investment ${inv.productName} (${inv.type}/${inv.indexer}) Rate: ${inv.rate} Value: ${inv.amountInvested}`);
                console.log(` ---> Maturity value: ${metrics.maturityValue}`);
                console.log(` ---> Midpoint max value: ${maxVal}`);
            }
        } catch (e) {
            console.error(e);
        }
    }
}
run();
