import { describe, expect, it } from 'vitest';
import { getDefaultIndexerForType, getModalityOptionsForType, getRateFieldConfig, isIndexerAllowedForType } from './productRules';

describe('productRules', () => {
    it('offers only CDI, Prefixada and IPCA+ for CDB', () => {
        const options = getModalityOptionsForType('CDB');

        expect(options.map((option) => option.value)).toEqual(['CDI', 'PREFIXADO', 'IPCA']);
        expect(isIndexerAllowedForType('CDB', 'SELIC')).toBe(false);
    });

    it('defaults Tesouro to Selic', () => {
        expect(getDefaultIndexerForType('TESOURO')).toBe('SELIC');
        expect(isIndexerAllowedForType('TESOURO', 'SELIC')).toBe(true);
    });

    it('returns the correct field config for each remuneration mode', () => {
        expect(getRateFieldConfig('CDI')).toEqual({
            label: 'Percentual do CDI (%)',
            placeholder: '100,00',
        });
        expect(getRateFieldConfig('PREFIXADO')).toEqual({
            label: 'Taxa prefixada (% a.a.)',
            placeholder: '12,30',
        });
        expect(getRateFieldConfig('IPCA')).toEqual({
            label: 'Spread acima do IPCA (% a.a.)',
            placeholder: '6,50',
        });
    });
});
