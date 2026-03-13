import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export interface PortfolioSummary {
    totals: {
        activeInvestedValue: number;
        activeCurrentValue: number;
        activeOpenProfit: number;
        activeOpenProfitPct: number;
        pendingRedemptionValue: number;
        pendingRedemptionPrincipal: number;
        pendingRedemptionResult: number;
        consolidatedValue: number;
    };
    benchmark: {
        hasData: boolean;
        label: 'CDI';
        methodology: 'TWR';
        periodLabel: 'Desde o Início';
        startDate: string | null;
        lastIndexDate: string | null;
        eligibleInvestedValue: number;
        eligibleCurrentValue: number;
        benchmarkCurrentValue: number;
        portfolioReturnPct: number;
        benchmarkReturnPct: number;
        excessReturnPct: number;
        benchmarkProfit: number;
    };
}

export function usePortfolioSummary(refreshKey: string) {
    const [summary, setSummary] = useState<PortfolioSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isAuthenticated, logout } = useAuth();

    const fetchSummary = useCallback(async () => {
        if (!isAuthenticated) {
            return;
        }

        try {
            setLoading(true);
            const res = await api.get('/investments/summary');

            if (res.status === 401) {
                logout();
                return;
            }

            if (!res.ok) {
                throw new Error('Falha ao carregar o resumo da carteira');
            }

            const data = await res.json();
            setSummary(data.summary || null);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, logout]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary, refreshKey]);

    return { summary, loading, error, refresh: fetchSummary };
}
