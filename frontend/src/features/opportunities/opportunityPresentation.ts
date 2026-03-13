import type { InvestmentOpportunity, OpportunitySeverity } from '../../hooks/useInvestmentOpportunities';

export type OpportunityTypeGroup = 'CDB' | 'LCI_LCA' | 'TESOURO' | 'OUTROS';

export function getOpportunitySeverityLabel(severity: OpportunitySeverity) {
    switch (severity) {
        case 'HIGH':
            return 'Alta Prioridade';
        case 'MEDIUM':
            return 'Revisar';
        default:
            return 'Monitorar';
    }
}

export function getOpportunitySeverityClasses(severity: OpportunitySeverity) {
    switch (severity) {
        case 'HIGH':
            return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        case 'MEDIUM':
            return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
        default:
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    }
}

export function getOpportunityHomeBadge(opportunity: InvestmentOpportunity) {
    return opportunity.comparatorLabel === 'Equivalente Líquido'
        ? 'Abaixo do Equivalente'
        : 'Abaixo da Régua';
}

export function formatOpportunityRate(value: number) {
    return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export function formatOpportunityPercentagePoints(value: number | null) {
    if (typeof value !== 'number') {
        return '--';
    }

    return `${value >= 0 ? '+' : ''}${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
}

export function getOpportunityDisplayBenchmarkLabel(opportunity: InvestmentOpportunity) {
    if ((opportunity.type === 'CDB' || opportunity.type === 'LCI' || opportunity.type === 'LCA') && opportunity.benchmarkLabel === 'SELIC') {
        return 'CDI';
    }

    return opportunity.benchmarkLabel;
}

export function getOpportunityTypeGroup(opportunity: InvestmentOpportunity): OpportunityTypeGroup {
    if (opportunity.type === 'LCI' || opportunity.type === 'LCA') {
        return 'LCI_LCA';
    }

    if (opportunity.type === 'CDB' || opportunity.type === 'TESOURO') {
        return opportunity.type;
    }

    return 'OUTROS';
}

export function getOpportunityTypeGroupLabel(typeGroup: OpportunityTypeGroup) {
    switch (typeGroup) {
        case 'LCI_LCA':
            return 'LCI/LCA';
        case 'TESOURO':
            return 'Tesouro';
        case 'CDB':
            return 'CDB';
        default:
            return 'Outros';
    }
}

export function getOpportunityGroupTitle(opportunity: InvestmentOpportunity) {
    const benchmarkLabel = getOpportunityDisplayBenchmarkLabel(opportunity);
    const typeLabel = getOpportunityTypeGroupLabel(getOpportunityTypeGroup(opportunity));

    if (opportunity.comparatorLabel === 'Equivalente Líquido') {
        return `${typeLabel} abaixo do equivalente líquido`;
    }

    return `${typeLabel} abaixo de ${formatOpportunityRate(opportunity.targetRate)} do ${benchmarkLabel}`;
}

export function getOpportunityCurrentRateLabel(opportunity: InvestmentOpportunity) {
    return `${formatOpportunityRate(opportunity.currentRate)} do ${getOpportunityDisplayBenchmarkLabel(opportunity)}`;
}

export function getOpportunityTargetRateLabel(opportunity: InvestmentOpportunity) {
    return `${formatOpportunityRate(opportunity.targetRate)} do ${getOpportunityDisplayBenchmarkLabel(opportunity)}`;
}
