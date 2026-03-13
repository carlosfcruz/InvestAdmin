import { describe, expect, it } from 'vitest';
import {
    createDefaultOpportunityFilters,
    filterOpportunityItems,
    groupOpportunityItems,
    summarizeOpportunityItems,
} from './opportunityPageModel';

const items = [
    {
        investmentId: 'cdb-1',
        productName: 'CDB QA 92% CDI',
        issuer: 'Banco QA 01',
        type: 'CDB',
        indexer: 'CDI',
        severity: 'MEDIUM',
        reasonCode: 'BELOW_MIN_POST_FIXED_RATE',
        benchmarkLabel: 'CDI',
        comparatorLabel: 'Régua Mínima',
        currentRate: 92,
        targetRate: 100,
        rateGap: -8,
        excessReturnPct: -0.0433,
        benchmarkStartDate: '2025-03-10',
        benchmarkLastIndexDate: '2026-03-11',
        title: 'Abaixo da Régua Mínima',
        explanation: 'CDB a 92% do CDI está abaixo da régua mínima.',
        recommendation: 'Procure opções de CDB a partir de 100% do CDI.',
    },
    {
        investmentId: 'lci-1',
        productName: 'LCI QA 80% CDI',
        issuer: 'Banco QA 02',
        type: 'LCI',
        indexer: 'CDI',
        severity: 'HIGH',
        reasonCode: 'BELOW_NET_EQUIVALENT_RATE',
        benchmarkLabel: 'CDI',
        comparatorLabel: 'Equivalente Líquido',
        currentRate: 80,
        targetRate: 85,
        rateGap: -5,
        excessReturnPct: -0.0075,
        benchmarkStartDate: '2025-03-10',
        benchmarkLastIndexDate: '2026-03-11',
        title: 'Abaixo do Equivalente Líquido',
        explanation: 'LCI a 80% do CDI está abaixo do equivalente líquido.',
        recommendation: 'Procure opções de LCI a partir de 85% do CDI.',
    },
    {
        investmentId: 'cdb-legacy',
        productName: 'CDB QA Legado',
        issuer: 'Banco QA 03',
        type: 'CDB',
        indexer: 'SELIC',
        severity: 'LOW',
        reasonCode: 'BELOW_MIN_POST_FIXED_RATE',
        benchmarkLabel: 'SELIC',
        comparatorLabel: 'Régua Mínima',
        currentRate: 96,
        targetRate: 100,
        rateGap: -4,
        excessReturnPct: -0.011,
        benchmarkStartDate: '2025-03-10',
        benchmarkLastIndexDate: '2026-03-11',
        title: 'Abaixo da Régua Mínima',
        explanation: 'CDB legado ainda veio como SELIC.',
        recommendation: 'Procure opções de CDB a partir de 100% do CDI.',
    },
] as const;

describe('opportunityPageModel', () => {
    it('filters by type, comparator, benchmark and search term', () => {
        const filtered = filterOpportunityItems(items as any, {
            ...createDefaultOpportunityFilters(),
            type: 'LCI_LCA',
            comparator: 'NET_EQUIVALENT',
            benchmark: 'CDI',
            searchTerm: 'lci qa',
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].investmentId).toBe('lci-1');
    });

    it('normalizes legacy banking SELIC opportunities into CDI filters and grouping', () => {
        const filtered = filterOpportunityItems(items as any, {
            ...createDefaultOpportunityFilters(),
            benchmark: 'CDI',
        });

        expect(filtered.map((item) => item.investmentId)).toContain('cdb-legacy');

        const groups = groupOpportunityItems(filtered, 'WORST_GAP');
        expect(groups[0].title).toBe('CDB abaixo de 100% do CDI');
        expect(groups[0].count).toBe(2);
    });

    it('summarizes filtered items for lighter dashboard cards', () => {
        const summary = summarizeOpportunityItems(items as any);

        expect(summary.total).toBe(3);
        expect(summary.highPriority).toBe(1);
        expect(summary.minimumRule).toBe(2);
        expect(summary.netEquivalent).toBe(1);
    });
});
