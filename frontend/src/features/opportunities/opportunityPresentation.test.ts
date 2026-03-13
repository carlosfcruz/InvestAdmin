import { describe, expect, it } from 'vitest';
import {
    formatOpportunityPercentagePoints,
    formatOpportunityRate,
    getOpportunityCurrentRateLabel,
    getOpportunityDisplayBenchmarkLabel,
    getOpportunityGroupTitle,
    getOpportunityHomeBadge,
    getOpportunitySeverityClasses,
    getOpportunitySeverityLabel,
    getOpportunityTargetRateLabel,
    getOpportunityTypeGroup,
    getOpportunityTypeGroupLabel,
} from './opportunityPresentation';

const cdbOpportunity = {
    comparatorLabel: 'Régua Mínima',
    benchmarkLabel: 'CDI',
    type: 'CDB',
    currentRate: 92,
    targetRate: 100,
} as any;

describe('opportunityPresentation', () => {
    it('returns compact home badges for each comparator type', () => {
        expect(getOpportunityHomeBadge({ comparatorLabel: 'Régua Mínima' } as any)).toBe('Abaixo da Régua');
        expect(getOpportunityHomeBadge({ comparatorLabel: 'Equivalente Líquido' } as any)).toBe('Abaixo do Equivalente');
    });

    it('maps severity labels and classes for the detailed page', () => {
        expect(getOpportunitySeverityLabel('HIGH')).toBe('Alta Prioridade');
        expect(getOpportunitySeverityLabel('MEDIUM')).toBe('Revisar');
        expect(getOpportunitySeverityLabel('LOW')).toBe('Monitorar');
        expect(getOpportunitySeverityClasses('HIGH')).toContain('text-red-700');
    });

    it('formats opportunity metrics using pt-BR text', () => {
        expect(formatOpportunityRate(100)).toBe('100%');
        expect(formatOpportunityRate(82.5)).toBe('82,5%');
        expect(formatOpportunityPercentagePoints(0.0081)).toBe('+0.81 p.p.');
        expect(formatOpportunityPercentagePoints(null)).toBe('--');
    });

    it('normalizes legacy bank SELIC labels back to CDI for opportunities', () => {
        expect(getOpportunityDisplayBenchmarkLabel({
            ...cdbOpportunity,
            benchmarkLabel: 'SELIC',
            type: 'CDB',
        })).toBe('CDI');
    });

    it('builds grouped titles and rate labels for the opportunities page', () => {
        expect(getOpportunityGroupTitle(cdbOpportunity)).toBe('CDB abaixo de 100% do CDI');
        expect(getOpportunityCurrentRateLabel(cdbOpportunity)).toBe('92% do CDI');
        expect(getOpportunityTargetRateLabel(cdbOpportunity)).toBe('100% do CDI');
    });

    it('groups LCI and LCA together for lighter visual presentation', () => {
        expect(getOpportunityTypeGroup({ type: 'LCI' } as any)).toBe('LCI_LCA');
        expect(getOpportunityTypeGroupLabel('LCI_LCA')).toBe('LCI/LCA');
        expect(getOpportunityGroupTitle({
            type: 'LCI',
            comparatorLabel: 'Equivalente Líquido',
            benchmarkLabel: 'CDI',
            targetRate: 85,
        } as any)).toBe('LCI/LCA abaixo do equivalente líquido');
    });
});
