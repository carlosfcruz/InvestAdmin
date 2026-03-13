import { EconomicIndex, EconomicIndexType } from "../models/economicIndex";

const BCB_SGS_API_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

// Codes for BCB SGS API
export const INDEX_CODES: Record<EconomicIndexType, number> = {
    // We now fetch the daily rate for all of them to avoid mixing annualized and daily 
    // in the same DynamoDB table partition.
    SELIC: 11, // SELIC diária (SGS 11)
    CDI: 12,   // CDI diário (SGS 12)
    IPCA: 433, // Índice nacional de preços ao consumidor-amplo (IPCA) variação mensal % a.m.
};

export const HISTORICAL_CODES: Record<EconomicIndexType, number> = {
    SELIC: 11, // SELIC diária
    CDI: 12,   // CDI diário
    IPCA: 433  // IPCA mensal
};

interface BcbSgsResponse {
    data: string;
    valor: string;
}

export async function fetchIndexFromBcb(indexType: EconomicIndexType): Promise<EconomicIndex> {
    const code = INDEX_CODES[indexType];
    const url = `${BCB_SGS_API_URL}.${code}/dados/ultimos/1?formato=json`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${indexType} from BCB. Status: ${response.status}`);
        }
        const data: BcbSgsResponse[] = await response.json();

        if (data && data.length > 0) {
            const first = data[0];
            if (!first) throw new Error("Empty data");
            const { data: dateStr, valor } = first;
            // dateStr is 'dd/MM/yyyy'
            const parts = dateStr.split('/');
            const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            // store rate as decimal
            const ratePercent = parseFloat(valor);
            const rateDecimal = ratePercent / 100;

            return {
                indexType,
                date: isoDate,
                rate: rateDecimal
            };
        }
        throw new Error(`BCB returned empty data for ${indexType}`);
    } catch (error) {
        console.error(`Error fetching index ${indexType}:`, error);
        throw error;
    }
}

export async function fetchHistoricalData(indexType: EconomicIndexType, startDateStr: string, endDateStr: string): Promise<EconomicIndex[]> {
    const code = HISTORICAL_CODES[indexType];
    const url = `${BCB_SGS_API_URL}.${code}/dados?formato=json&dataInicial=${startDateStr}&dataFinal=${endDateStr}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch historical ${indexType} from BCB. Status: ${response.status}`);
        }
        const data: BcbSgsResponse[] = await response.json();

        if (data && data.length > 0) {
            return data.map(item => {
                const parts = item.data.split('/');
                const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                const ratePercent = parseFloat(item.valor);
                const rateDecimal = ratePercent / 100;

                return {
                    indexType,
                    date: isoDate,
                    rate: rateDecimal
                };
            });
        }
        return [];
    } catch (error) {
        console.error(`Error fetching historical ${indexType}:`, error);
        throw error;
    }
}

// Keep for backward compatibility if needed, though replaced by generic
export async function fetchHistoricalSelic(startDateStr: string, endDateStr: string): Promise<EconomicIndex[]> {
    return fetchHistoricalData("SELIC", startDateStr, endDateStr);
}
