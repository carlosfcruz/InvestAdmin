import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export interface EconomicIndex {
    indexType: 'CDI' | 'SELIC' | 'IPCA';
    date: string;
    rate: number;
}

export type LatestIndexes = Record<'CDI' | 'SELIC' | 'IPCA', EconomicIndex>;
export type EconomicIndexDisplayBasis = 'annual' | 'trailing12m' | 'monthly';

export interface EconomicIndexDisplay {
    indexType: 'CDI' | 'SELIC' | 'IPCA';
    label: string;
    rate: number;
    basis: EconomicIndexDisplayBasis;
    date: string;
    sourceDate: string;
}

export type LatestIndexesDisplay = Record<'CDI' | 'SELIC' | 'IPCA', EconomicIndexDisplay>;

export function useIndexes() {
    const [indexes, setIndexes] = useState<LatestIndexes | null>(null);
    const [display, setDisplay] = useState<LatestIndexesDisplay | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isAuthenticated } = useAuth();

    const fetchIndexes = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/indexes');

            if (!res.ok) {
                throw new Error('Falha ao carregar índices');
            }

            const data = await res.json();
            setIndexes(data.latest);
            setDisplay(data.display ?? null);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            fetchIndexes();
        }
    }, [isAuthenticated, fetchIndexes]);

    return { indexes, display, loading, error, refresh: fetchIndexes };
}
