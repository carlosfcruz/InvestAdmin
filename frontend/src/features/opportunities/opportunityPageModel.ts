import type { InvestmentOpportunity, OpportunitySeverity } from '../../hooks/useInvestmentOpportunities';
import {
    getOpportunityDisplayBenchmarkLabel,
    getOpportunityGroupTitle,
    getOpportunityTargetRateLabel,
    getOpportunityTypeGroup,
    getOpportunityTypeGroupLabel,
} from './opportunityPresentation';

export type OpportunityTypeFilter = 'ALL' | 'CDB' | 'LCI_LCA' | 'TESOURO';
export type OpportunityBenchmarkFilter = 'ALL' | 'CDI' | 'SELIC';
export type OpportunityComparatorFilter = 'ALL' | 'MINIMUM' | 'NET_EQUIVALENT';
export type OpportunitySeverityFilter = 'ALL' | OpportunitySeverity;
export type OpportunitySortBy = 'WORST_GAP' | 'WORST_EXCESS' | 'LOWEST_RATE' | 'HIGHEST_RATE';

export interface OpportunityFilters {
    searchTerm: string;
    type: OpportunityTypeFilter;
    benchmark: OpportunityBenchmarkFilter;
    comparator: OpportunityComparatorFilter;
    severity: OpportunitySeverityFilter;
    sortBy: OpportunitySortBy;
}

export interface OpportunityGroup {
    key: string;
    title: string;
    typeLabel: string;
    benchmarkLabel: 'CDI' | 'SELIC';
    comparatorLabel: InvestmentOpportunity['comparatorLabel'];
    recommendation: string;
    explanation: string;
    targetRateLabel: string;
    lastIndexDate: string | null;
    count: number;
    worstGap: number;
    items: InvestmentOpportunity[];
}

export interface OpportunitySummaryView {
    total: number;
    highPriority: number;
    minimumRule: number;
    netEquivalent: number;
}

function matchesComparator(opportunity: InvestmentOpportunity, comparator: OpportunityComparatorFilter) {
    if (comparator === 'ALL') {
        return true;
    }

    if (comparator === 'MINIMUM') {
        return opportunity.comparatorLabel === 'Régua Mínima';
    }

    return opportunity.comparatorLabel === 'Equivalente Líquido';
}

function matchesSearch(opportunity: InvestmentOpportunity, searchTerm: string) {
    if (!searchTerm) {
        return true;
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
        return true;
    }

    const typeLabel = getOpportunityTypeGroupLabel(getOpportunityTypeGroup(opportunity)).toLowerCase();
    const benchmarkLabel = getOpportunityDisplayBenchmarkLabel(opportunity).toLowerCase();

    return [
        opportunity.productName,
        opportunity.issuer,
        opportunity.title,
        opportunity.explanation,
        opportunity.recommendation,
        typeLabel,
        benchmarkLabel,
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
}

function getSortRank(opportunity: InvestmentOpportunity, sortBy: OpportunitySortBy) {
    switch (sortBy) {
        case 'LOWEST_RATE':
            return opportunity.currentRate;
        case 'HIGHEST_RATE':
            return -opportunity.currentRate;
        case 'WORST_EXCESS':
            return typeof opportunity.excessReturnPct === 'number' ? opportunity.excessReturnPct : Number.POSITIVE_INFINITY;
        case 'WORST_GAP':
        default:
            return opportunity.rateGap;
    }
}

function compareOpportunities(left: InvestmentOpportunity, right: InvestmentOpportunity, sortBy: OpportunitySortBy) {
    const primary = getSortRank(left, sortBy) - getSortRank(right, sortBy);
    if (primary !== 0) {
        return primary;
    }

    const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const severityDiff = severityRank[left.severity] - severityRank[right.severity];
    if (severityDiff !== 0) {
        return severityDiff;
    }

    return left.productName.localeCompare(right.productName, 'pt-BR');
}

export function createDefaultOpportunityFilters(): OpportunityFilters {
    return {
        searchTerm: '',
        type: 'ALL',
        benchmark: 'ALL',
        comparator: 'ALL',
        severity: 'ALL',
        sortBy: 'WORST_GAP',
    };
}

export function filterOpportunityItems(items: InvestmentOpportunity[], filters: OpportunityFilters) {
    return items
        .filter((opportunity) => (
            (filters.type === 'ALL' || getOpportunityTypeGroup(opportunity) === filters.type)
            && (filters.benchmark === 'ALL' || getOpportunityDisplayBenchmarkLabel(opportunity) === filters.benchmark)
            && (filters.severity === 'ALL' || opportunity.severity === filters.severity)
            && matchesComparator(opportunity, filters.comparator)
            && matchesSearch(opportunity, filters.searchTerm)
        ))
        .sort((left, right) => compareOpportunities(left, right, filters.sortBy));
}

export function groupOpportunityItems(items: InvestmentOpportunity[], sortBy: OpportunitySortBy): OpportunityGroup[] {
    const groups = new Map<string, OpportunityGroup>();

    items.forEach((opportunity) => {
        const typeGroup = getOpportunityTypeGroup(opportunity);
        const benchmarkLabel = getOpportunityDisplayBenchmarkLabel(opportunity);
        const key = [
            typeGroup,
            opportunity.comparatorLabel,
            benchmarkLabel,
            opportunity.targetRate.toFixed(2),
        ].join(':');

        const existing = groups.get(key);
        if (existing) {
            existing.items.push(opportunity);
            existing.count += 1;
            existing.worstGap = Math.min(existing.worstGap, opportunity.rateGap);
            return;
        }

        groups.set(key, {
            key,
            title: getOpportunityGroupTitle(opportunity),
            typeLabel: getOpportunityTypeGroupLabel(typeGroup),
            benchmarkLabel,
            comparatorLabel: opportunity.comparatorLabel,
            recommendation: opportunity.recommendation,
            explanation: opportunity.explanation,
            targetRateLabel: getOpportunityTargetRateLabel(opportunity),
            lastIndexDate: opportunity.benchmarkLastIndexDate,
            count: 1,
            worstGap: opportunity.rateGap,
            items: [opportunity],
        });
    });

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            items: [...group.items].sort((left, right) => compareOpportunities(left, right, sortBy)),
        }))
        .sort((left, right) => {
            const gapDiff = left.worstGap - right.worstGap;
            if (gapDiff !== 0) {
                return gapDiff;
            }

            return right.count - left.count;
        });
}

export function summarizeOpportunityItems(items: InvestmentOpportunity[]): OpportunitySummaryView {
    return {
        total: items.length,
        highPriority: items.filter((item) => item.severity === 'HIGH').length,
        minimumRule: items.filter((item) => item.comparatorLabel === 'Régua Mínima').length,
        netEquivalent: items.filter((item) => item.comparatorLabel === 'Equivalente Líquido').length,
    };
}
