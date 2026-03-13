import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export interface Investment {
    userId: string;
    investmentId: string;
    type: 'CDB' | 'TESOURO' | 'LCI' | 'LCA' | 'FUNDO';
    indexer: 'CDI' | 'SELIC' | 'IPCA' | 'PREFIXADO';
    origin: 'MANUAL' | 'OCR';
    issuer: string;
    productName: string;
    rate: number;
    applicationDate: string;
    maturityDate: string | null;
    amountInvested: number;
    liquidity: string;
    incomeTaxRegime: string;
    hasFGC: boolean;
    portfolioStatus?: 'ACTIVE' | 'REDEEMED';
    redeemedAt?: string | null;
    redeemedAmount?: number | null;
    createdAt: string;
    updatedAt: string;
    riskNotes?: string;
    redemptionRules?: string;
    cnpj?: string;
    quantity?: number;
    purchaseQuoteValue?: number;
    lastQuoteValue?: number;
    lastQuoteDate?: string;
    currentValue?: number;
    netYield?: number;
    grossYield?: number;
    daysToMaturity?: number | null;
    maturityStatus?: 'NONE' | 'ACTIVE' | 'MATURES_TODAY' | 'MATURED';
    benchmarkAvailable?: boolean;
    benchmarkLabel?: 'CDI' | 'SELIC' | 'IPCA' | null;
    benchmarkComparatorLabel?: 'P\u00f3s-fixado' | 'Curva Contratada' | 'Equivalente L\u00edquido' | null;
    benchmarkCurrentValue?: number | null;
    benchmarkProfit?: number | null;
    benchmarkReturnPct?: number | null;
    excessReturnPct?: number | null;
    benchmarkStartDate?: string | null;
    benchmarkLastIndexDate?: string | null;
}

export function useInvestments() {
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isAuthenticated, logout } = useAuth();

    const fetchInvestments = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/investments');

            if (res.status === 401) {
                logout();
                return;
            }

            const data = await res.json();
            setInvestments(data.items || []);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [logout]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchInvestments();
        }
    }, [isAuthenticated, fetchInvestments]);

    const addInvestment = async (investment: Partial<Investment>) => {
        const res = await api.post('/investments', investment);
        if (!res.ok) throw new Error('Falha ao adicionar investimento');
        await fetchInvestments();
    };

    const updateInvestment = async (id: string, investment: Partial<Investment>) => {
        const res = await api.put(`/investments/${id}`, investment);
        if (!res.ok) throw new Error('Falha ao atualizar investimento');
        await fetchInvestments();
    };

    const deleteInvestment = async (id: string) => {
        const res = await api.delete(`/investments/${id}`);
        if (!res.ok) throw new Error('Falha ao excluir investimento');
        await fetchInvestments();
    };

    const redeemInvestments = async (investmentIds: string[]) => {
        const res = await api.post('/investments/redeem', { investmentIds });
        if (!res.ok) throw new Error('Falha ao marcar investimentos como resgatados');
        await fetchInvestments();
    };

    return { investments, loading, error, addInvestment, updateInvestment, deleteInvestment, redeemInvestments, refresh: fetchInvestments };
}
