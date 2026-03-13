import { describe, expect, it } from 'vitest';
import {
    decorateEvolutionWithPerformance,
    filterEvolutionByPeriod,
    prepareEvolutionChartData,
    sampleEvolutionPoints,
    summarizeEvolutionPeriod,
    type EvolutionPoint,
} from './yieldEvolutionChartMetrics';

describe('yieldEvolutionChartMetrics', () => {
    it('calculates cumulative TWR for portfolio and benchmark using cash flows', () => {
        const points: EvolutionPoint[] = [
            { date: '2026-01-10', value: 1000, applied: 1000, profit: 0, benchmarkValue: 1000 },
            { date: '2026-02-10', value: 1120, applied: 1100, profit: 20, benchmarkValue: 1110 },
            { date: '2026-03-10', value: 1150, applied: 1100, profit: 50, benchmarkValue: 1130 },
        ];

        const decorated = decorateEvolutionWithPerformance(points);
        const lastPoint = decorated[decorated.length - 1];

        expect(decorated[0]?.portfolioReturnPct).toBe(0);
        expect(decorated[0]?.benchmarkReturnPct).toBe(0);
        expect(lastPoint?.portfolioReturnPct).toBeCloseTo(0.0473214, 6);
        expect(lastPoint?.benchmarkReturnPct).toBeCloseTo(0.0281982, 6);
        expect(lastPoint?.excessReturnPct).toBeCloseTo(0.0191232, 6);
    });

    it('filters the evolution by the selected period', () => {
        const points: EvolutionPoint[] = [
            { date: '2025-01-01', value: 1000, applied: 1000, profit: 0 },
            { date: '2025-09-15', value: 1050, applied: 1000, profit: 50 },
            { date: '2026-03-01', value: 1100, applied: 1000, profit: 100 },
        ];

        const filtered = filterEvolutionByPeriod(points, '6M', new Date('2026-03-10T12:00:00.000Z'));

        expect(filtered).toHaveLength(2);
        expect(filtered[0]?.date).toBe('2025-09-15');
        expect(filtered[1]?.date).toBe('2026-03-01');
    });

    it('samples the chart data while preserving the final point', () => {
        const points: EvolutionPoint[] = Array.from({ length: 6 }, (_, index) => ({
            date: `2026-0${index + 1}-10`,
            value: 1000 + index * 10,
            applied: 1000,
            profit: index * 10,
        }));

        const sampled = sampleEvolutionPoints(points, 3);

        expect(sampled).toHaveLength(3);
        expect(sampled[sampled.length - 1]?.date).toBe('2026-06-10');
    });

    it('prepares decorated chart data for the selected period', () => {
        const points: EvolutionPoint[] = [
            { date: '2025-09-15', value: 1000, applied: 1000, profit: 0, benchmarkValue: 1000 },
            { date: '2025-12-10', value: 1050, applied: 1000, profit: 50, benchmarkValue: 1030 },
            { date: '2026-03-10', value: 1100, applied: 1000, profit: 100, benchmarkValue: 1070 },
        ];

        const prepared = prepareEvolutionChartData(points, '6M', 12, new Date('2026-03-10T12:00:00.000Z'));

        expect(prepared).toHaveLength(3);
        expect(prepared[prepared.length - 1]?.portfolioReturnPct).toBeCloseTo(0.1, 6);
        expect(prepared[prepared.length - 1]?.benchmarkReturnPct).toBeCloseTo(0.07, 6);
        expect(prepared[prepared.length - 1]?.excessReturnPct).toBeCloseTo(0.03, 6);
    });

    it('summarizes the selected period with portfolio and benchmark returns', () => {
        const points: EvolutionPoint[] = [
            { date: '2025-01-15', value: 1000, applied: 1000, profit: 0, benchmarkValue: 1000 },
            { date: '2025-11-10', value: 1060, applied: 1000, profit: 60, benchmarkValue: 1045 },
            { date: '2026-03-10', value: 1120, applied: 1000, profit: 120, benchmarkValue: 1085 },
        ];

        const summary = summarizeEvolutionPeriod(points, '6M', new Date('2026-03-10T12:00:00.000Z'));

        expect(summary).not.toBeNull();
        expect(summary?.period).toBe('6M');
        expect(summary?.startDate).toBe('2025-11-10');
        expect(summary?.endDate).toBe('2026-03-10');
        expect(summary?.portfolioReturnPct).toBeCloseTo(0.0566037, 6);
        expect(summary?.benchmarkReturnPct).toBeCloseTo(0.0382775, 6);
        expect(summary?.excessReturnPct).toBeCloseTo(0.0183262, 6);
    });
});
