import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export type OpportunitySeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type OpportunityReasonCode = 'BELOW_MIN_POST_FIXED_RATE' | 'BELOW_NET_EQUIVALENT_RATE';

export interface InvestmentOpportunity {
    investmentId: string;
    productName: string;
    issuer: string;
    type: 'CDB' | 'TESOURO' | 'LCI' | 'LCA' | 'FUNDO';
    indexer: 'CDI' | 'SELIC' | 'IPCA' | 'PREFIXADO';
    severity: OpportunitySeverity;
    reasonCode: OpportunityReasonCode;
    benchmarkLabel: 'CDI' | 'SELIC';
    comparatorLabel: 'Régua Mínima' | 'Equivalente Líquido';
    currentRate: number;
    targetRate: number;
    rateGap: number;
    excessReturnPct: number | null;
    benchmarkStartDate: string | null;
    benchmarkLastIndexDate: string | null;
    title: string;
    explanation: string;
    recommendation: string;
}

export interface InvestmentOpportunitiesSummary {
    activeCount: number;
    analyzedCount: number;
    underperformingCount: number;
    highSeverityCount: number;
}

export interface InvestmentOpportunitiesResult {
    summary: InvestmentOpportunitiesSummary;
    items: InvestmentOpportunity[];
}

export function useInvestmentOpportunities(refreshKey = '') {
    const [opportunities, setOpportunities] = useState<InvestmentOpportunitiesResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isAuthenticated, logout } = useAuth();

    const fetchOpportunities = useCallback(async () => {
        if (!isAuthenticated) {
            return;
        }

        try {
            setLoading(true);
            const response = await api.get('/investments/opportunities');

            if (response.status === 401) {
                logout();
                return;
            }

            if (!response.ok) {
                throw new Error('Falha ao carregar as oportunidades da carteira');
            }

            const data = await response.json();
            setOpportunities({
                summary: data.summary || {
                    activeCount: 0,
                    analyzedCount: 0,
                    underperformingCount: 0,
                    highSeverityCount: 0,
                },
                items: data.items || [],
            });
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, logout]);

    useEffect(() => {
        fetchOpportunities();
    }, [fetchOpportunities, refreshKey]);

    return { opportunities, loading, error, refresh: fetchOpportunities };
}
