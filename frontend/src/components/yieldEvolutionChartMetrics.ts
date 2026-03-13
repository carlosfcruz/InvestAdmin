export type ChartPeriod = 'ALL' | '6M' | '12M' | '2Y' | '5Y' | '10Y';
export type ChartMetricMode = 'VALUE' | 'RETURN' | 'EXCESS';

export interface EvolutionPoint {
    date: string;
    value: number;
    applied: number;
    profit: number;
    yield?: number;
    type?: string;
    benchmarkValue?: number;
    benchmarkProfit?: number;
    excessValue?: number;
}

export interface DecoratedEvolutionPoint extends EvolutionPoint {
    portfolioReturnPct: number;
    benchmarkReturnPct?: number;
    excessReturnPct?: number;
}

export interface EvolutionPeriodSummary {
    period: ChartPeriod;
    startDate: string;
    endDate: string;
    startValue: number;
    endValue: number;
    portfolioReturnPct: number;
    benchmarkStartValue?: number;
    benchmarkEndValue?: number;
    benchmarkReturnPct?: number;
    excessReturnPct?: number;
}

export function filterEvolutionByPeriod(
    points: EvolutionPoint[],
    period: ChartPeriod,
    referenceDate: Date = new Date(),
): EvolutionPoint[] {
    if (period === 'ALL' || points.length === 0) {
        return [...points];
    }

    const monthsByPeriod: Record<Exclude<ChartPeriod, 'ALL'>, number> = {
        '6M': 6,
        '12M': 12,
        '2Y': 24,
        '5Y': 60,
        '10Y': 120,
    };

    const cutoff = new Date(referenceDate);
    cutoff.setMonth(cutoff.getMonth() - monthsByPeriod[period]);

    return points.filter((point) => new Date(point.date) >= cutoff);
}

export function decorateEvolutionWithPerformance(points: EvolutionPoint[]): DecoratedEvolutionPoint[] {
    if (points.length === 0) {
        return [];
    }

    let cumulativePortfolio = 1;
    let cumulativeBenchmark = 1;

    return points.map((point, index) => {
        if (index === 0) {
            return {
                ...point,
                portfolioReturnPct: 0,
                ...(typeof point.benchmarkValue === 'number'
                    ? {
                        benchmarkReturnPct: 0,
                        excessReturnPct: 0,
                    }
                    : {}),
            };
        }

        const previousPoint = points[index - 1];
        if (!previousPoint) {
            return {
                ...point,
                portfolioReturnPct: cumulativePortfolio - 1,
            };
        }

        const cashFlow = point.applied - previousPoint.applied;

        if (previousPoint.value > 0) {
            const dailyPortfolioReturn = ((point.value - cashFlow) / previousPoint.value) - 1;
            if (Number.isFinite(dailyPortfolioReturn)) {
                cumulativePortfolio *= 1 + dailyPortfolioReturn;
            }
        }

        let benchmarkReturnPct: number | undefined;
        let excessReturnPct: number | undefined;

        if (typeof point.benchmarkValue === 'number' && typeof previousPoint.benchmarkValue === 'number' && previousPoint.benchmarkValue > 0) {
            const dailyBenchmarkReturn = ((point.benchmarkValue - cashFlow) / previousPoint.benchmarkValue) - 1;
            if (Number.isFinite(dailyBenchmarkReturn)) {
                cumulativeBenchmark *= 1 + dailyBenchmarkReturn;
            }

            benchmarkReturnPct = cumulativeBenchmark - 1;
            excessReturnPct = (cumulativePortfolio - 1) - benchmarkReturnPct;
        }

        return {
            ...point,
            portfolioReturnPct: cumulativePortfolio - 1,
            ...(benchmarkReturnPct !== undefined ? { benchmarkReturnPct } : {}),
            ...(excessReturnPct !== undefined ? { excessReturnPct } : {}),
        };
    });
}

export function sampleEvolutionPoints<T extends EvolutionPoint>(points: T[], maxPoints: number): T[] {
    if (points.length <= maxPoints) {
        return [...points];
    }

    const step = Math.max(1, Math.floor(points.length / maxPoints));
    const sampled: T[] = [];

    for (let index = 0; index < points.length; index += step) {
        if (sampled.length < maxPoints) {
            const point = points[index];
            if (point) {
                sampled.push(point);
            }
        }
    }

    const lastPoint = points[points.length - 1];
    if (sampled.length > 0 && lastPoint && sampled[sampled.length - 1]?.date !== lastPoint.date) {
        sampled[sampled.length - 1] = lastPoint;
    }

    return sampled;
}

export function prepareEvolutionChartData(
    points: EvolutionPoint[],
    period: ChartPeriod,
    maxPoints: number,
    referenceDate: Date = new Date(),
): DecoratedEvolutionPoint[] {
    const filtered = filterEvolutionByPeriod(points, period, referenceDate);
    const decorated = decorateEvolutionWithPerformance(filtered);
    return sampleEvolutionPoints(decorated, maxPoints);
}

export function summarizeEvolutionPeriod(
    points: EvolutionPoint[],
    period: ChartPeriod,
    referenceDate: Date = new Date(),
): EvolutionPeriodSummary | null {
    const filtered = filterEvolutionByPeriod(points, period, referenceDate);
    const decorated = decorateEvolutionWithPerformance(filtered);

    if (decorated.length === 0) {
        return null;
    }

    const startPoint = decorated[0];
    const endPoint = decorated[decorated.length - 1];

    if (!startPoint || !endPoint) {
        return null;
    }

    return {
        period,
        startDate: startPoint.date,
        endDate: endPoint.date,
        startValue: startPoint.value,
        endValue: endPoint.value,
        portfolioReturnPct: endPoint.portfolioReturnPct,
        ...(typeof startPoint.benchmarkValue === 'number' ? { benchmarkStartValue: startPoint.benchmarkValue } : {}),
        ...(typeof endPoint.benchmarkValue === 'number' ? { benchmarkEndValue: endPoint.benchmarkValue } : {}),
        ...(typeof endPoint.benchmarkReturnPct === 'number' ? { benchmarkReturnPct: endPoint.benchmarkReturnPct } : {}),
        ...(typeof endPoint.excessReturnPct === 'number' ? { excessReturnPct: endPoint.excessReturnPct } : {}),
    };
}
