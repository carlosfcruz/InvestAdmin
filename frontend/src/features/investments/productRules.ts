import type { Investment } from '../../hooks/useInvestments';

type ProductType = Investment['type'];
type ProductIndexer = Investment['indexer'];

interface ProductModalityOption {
    value: ProductIndexer;
    label: string;
}

interface RateFieldConfig {
    label: string;
    placeholder: string;
}

const PRODUCT_MODALITY_RULES: Record<ProductType, ProductModalityOption[]> = {
    CDB: [
        { value: 'CDI', label: 'Pós-fixada (CDI)' },
        { value: 'PREFIXADO', label: 'Prefixada' },
        { value: 'IPCA', label: 'IPCA+' },
    ],
    LCI: [
        { value: 'CDI', label: 'Pós-fixada (CDI)' },
        { value: 'PREFIXADO', label: 'Prefixada' },
        { value: 'IPCA', label: 'IPCA+' },
    ],
    LCA: [
        { value: 'CDI', label: 'Pós-fixada (CDI)' },
        { value: 'PREFIXADO', label: 'Prefixada' },
        { value: 'IPCA', label: 'IPCA+' },
    ],
    TESOURO: [
        { value: 'SELIC', label: 'Selic' },
        { value: 'PREFIXADO', label: 'Prefixado' },
        { value: 'IPCA', label: 'IPCA+' },
    ],
    FUNDO: [],
};

export function getModalityOptionsForType(type: ProductType): ProductModalityOption[] {
    return PRODUCT_MODALITY_RULES[type] || [];
}

export function getDefaultIndexerForType(type: ProductType): ProductIndexer {
    return getModalityOptionsForType(type)[0]?.value || 'PREFIXADO';
}

export function isIndexerAllowedForType(type: ProductType, indexer: string): boolean {
    return getModalityOptionsForType(type).some((option) => option.value === indexer);
}

export function getRateFieldConfig(indexer: ProductIndexer): RateFieldConfig {
    switch (indexer) {
        case 'PREFIXADO':
            return {
                label: 'Taxa prefixada (% a.a.)',
                placeholder: '12,30',
            };
        case 'IPCA':
            return {
                label: 'Spread acima do IPCA (% a.a.)',
                placeholder: '6,50',
            };
        case 'SELIC':
            return {
                label: 'Percentual da Selic (%)',
                placeholder: '100,00',
            };
        case 'CDI':
        default:
            return {
                label: 'Percentual do CDI (%)',
                placeholder: '100,00',
            };
    }
}
