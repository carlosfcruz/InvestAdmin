import { useState, useEffect, useMemo } from 'react';
import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ComposedChart,
    Bar,
    Line,
    ReferenceLine,
} from 'recharts';
import { ChevronDown, Calendar, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { Loader } from '../components/Loader';
import {
    prepareEvolutionChartData,
    summarizeEvolutionPeriod,
    type ChartMetricMode,
    type ChartPeriod,
    type EvolutionPoint,
    type EvolutionPeriodSummary,
} from './yieldEvolutionChartMetrics';

interface YieldEvolutionChartProps {
    investmentId: string;
    amountInvested: number;
    showAssetTypeFilter?: boolean;
    compact?: boolean;
    onPeriodSummaryChange?: (summary: EvolutionPeriodSummary | null) => void;
}

const PERIOD_LABELS: Record<ChartPeriod, string> = {
    ALL: 'Desde o Início',
    '6M': '6 Meses',
    '12M': '12 Meses',
    '2Y': '2 Anos',
    '5Y': '5 Anos',
    '10Y': '10 Anos',
};

void PERIOD_LABELS;

const normalizeLegacyText = (value: string) => value
    .replace('Desde o InÃ­cio', 'Desde o Início')
    .replace('PatrimÃ´nio', 'Patrimônio')
    .replace('EvoluÃ§Ã£o', 'Evolução')
    .replace('Renda VariÃ¡vel', 'Renda Variável')
    .replace('AÃ§Ãµes', 'Ações')
    .replace('Mapeando EvoluÃ§Ã£o...', 'Mapeando Evolução...')
    .replace('contÃ©m', 'contém')
    .replace('comparÃ¡veis', 'comparáveis');

const PERIOD_LABELS_CLEAN: Record<ChartPeriod, string> = {
    ALL: 'Desde o In\u00edcio',
    '6M': '6 Meses',
    '12M': '12 Meses',
    '2Y': '2 Anos',
    '5Y': '5 Anos',
    '10Y': '10 Anos',
};

const ASSET_TYPE_LABELS: Record<string, string> = {
    ALL: 'Todos os Tipos',
    FUNDOS: 'Fundos',
    TESOURO: 'Tesouro Direto',
    RENDA_FIXA: 'Renda Fixa',
    VARIAVEL: 'Renda Vari\u00e1vel',
    ACOES: 'A\u00e7\u00f5es',
    FII: 'FIIs',
    CRIPTOMOEDA: 'Cripto',
    OUTROS: 'Outros',
};

const LOADING_TEXT = 'Mapeando Evolu\u00e7\u00e3o...';
const BENCHMARK_HELP_TEXT = 'O Benchmark CDI aparece quando o filtro cont\u00e9m apenas ativos compar\u00e1veis de renda fixa.';
void BENCHMARK_HELP_TEXT;

void normalizeLegacyText;

export function YieldEvolutionChart({
    investmentId,
    showAssetTypeFilter = investmentId === 'portfolio',
    compact = false,
    onPeriodSummaryChange,
}: YieldEvolutionChartProps) {
    const [data, setData] = useState<EvolutionPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<ChartPeriod>('ALL');
    const [assetType, setAssetType] = useState<string>('ALL');
    const [metricMode, setMetricMode] = useState<ChartMetricMode>('VALUE');
    const { isAuthenticated } = useAuth();
    const { theme } = useTheme();

    useEffect(() => {
        const fetchEvolution = async () => {
            setLoading(true);

            try {
                const endpoint = (investmentId && investmentId !== 'portfolio')
                    ? `/investments/${investmentId}/evolution`
                    : `/investments/evolution?type=${showAssetTypeFilter ? assetType : 'ALL'}`;

                const res = await api.get(endpoint);
                const json = await res.json();

                const processed = (json.items || []).map((item: any) => {
                    const itemProfit = item.profit !== undefined ? item.profit : item.yield;
                    const itemApplied = item.applied ?? (itemProfit !== undefined ? item.value - itemProfit : item.value);
                    const finalProfit = itemProfit ?? (item.value - itemApplied);
                    const benchmarkValue = item.benchmarkValue !== undefined ? Number(item.benchmarkValue.toFixed(2)) : undefined;
                    const benchmarkProfit = benchmarkValue !== undefined
                        ? Number((item.benchmarkProfit ?? (benchmarkValue - itemApplied)).toFixed(2))
                        : undefined;
                    const excessValue = benchmarkValue !== undefined
                        ? Number((item.excessValue ?? (item.value - benchmarkValue)).toFixed(2))
                        : undefined;

                    return {
                        ...item,
                        applied: Number(itemApplied.toFixed(2)),
                        profit: Number(finalProfit.toFixed(2)),
                        benchmarkValue,
                        benchmarkProfit,
                        excessValue,
                    } as EvolutionPoint;
                });

                setData(processed);
            } catch (error) {
                console.error('Failed to fetch evolution:', error);
            } finally {
                setLoading(false);
            }
        };

        if (isAuthenticated) {
            fetchEvolution();
        }
    }, [investmentId, isAuthenticated, assetType, showAssetTypeFilter]);

    const referenceDate = useMemo(() => {
        const lastPointDate = data[data.length - 1]?.date;
        return lastPointDate ? new Date(lastPointDate) : new Date();
    }, [data]);

    const chartData = useMemo(() => {
        const maxPoints = compact ? 16 : 24;
        return prepareEvolutionChartData(data, period, maxPoints, referenceDate);
    }, [compact, data, period, referenceDate]);
    const periodSummary = useMemo(() => summarizeEvolutionPeriod(data, period, referenceDate), [data, period, referenceDate]);

    const hasBenchmark = investmentId === 'portfolio' && chartData.some((point) => typeof point.benchmarkValue === 'number');
    const canToggleMetrics = investmentId === 'portfolio' && !compact;
    const isDark = theme === 'dark';
    const gridColor = isDark ? '#374151' : '#e5e7eb';
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const headerTitle = investmentId === 'portfolio' ? 'Carteira x Benchmark' : 'Evolução do Patrimônio';

    const resolvedHeaderTitle = investmentId === 'portfolio' ? 'Carteira x Benchmark' : 'Evolução do Patrimônio';
    void headerTitle;
    void resolvedHeaderTitle;
    const cleanHeaderTitle = investmentId === 'portfolio' ? 'Carteira x Benchmark' : 'Evolu\u00e7\u00e3o do Patrim\u00f4nio';

    useEffect(() => {
        if (metricMode === 'EXCESS' && !hasBenchmark) {
            setMetricMode('VALUE');
        }
    }, [hasBenchmark, metricMode]);

    useEffect(() => {
        onPeriodSummaryChange?.(periodSummary);
    }, [onPeriodSummaryChange, periodSummary]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatPercent = (value: number) => {
        return `${(value * 100).toFixed(2)}%`;
    };

    const formatPercentagePoint = (value: number) => {
        return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} p.p.`;
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
        } catch {
            return dateStr;
        }
    };

    const getAssetTypeLabel = (id: string) => {
        const labels: Record<string, string> = {
            ALL: 'Todos os Tipos',
            FUNDOS: 'Fundos',
            TESOURO: 'Tesouro Direto',
            RENDA_FIXA: 'Renda Fixa',
            VARIAVEL: 'Renda Variável',
            ACOES: 'Ações',
            FII: 'FIIs',
            CRIPTOMOEDA: 'Cripto',
            OUTROS: 'Outros',
        };

        return normalizeLegacyText(labels[id] || id);
    };

    void getAssetTypeLabel;
    const getAssetTypeLabelClean = (id: string) => ASSET_TYPE_LABELS[id] || id;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || payload.length === 0) {
            return null;
        }

        const rawDataPoint = payload[0]?.payload;
        if (!rawDataPoint) {
            return null;
        }

        return (
            <div className="bg-white dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800 rounded-xl shadow-2xl min-w-[240px]">
                <p className="text-gray-500 font-bold mb-3">{formatDate(label)}</p>

                {metricMode === 'VALUE' && (
                    <div className="space-y-3">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm bg-[#5b78d1]"></div>
                                <span className="text-xs text-gray-400">Carteira</span>
                            </div>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatCurrency(rawDataPoint.value ?? 0)}</span>
                        </div>

                        {typeof rawDataPoint.benchmarkValue === 'number' && (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-sm bg-[#f59e0b]"></div>
                                    <span className="text-xs text-gray-400">Benchmark CDI</span>
                                </div>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatCurrency(rawDataPoint.benchmarkValue)}</span>
                            </div>
                        )}

                        {typeof rawDataPoint.excessValue === 'number' && (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-sm bg-[#8b5cf6]"></div>
                                    <span className="text-xs text-gray-400">Excesso</span>
                                </div>
                                <span className={`text-sm font-bold ${rawDataPoint.excessValue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {formatCurrency(rawDataPoint.excessValue)}
                                </span>
                            </div>
                        )}

                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm bg-[#10b981]"></div>
                                <span className="text-xs text-gray-400">Valor Aplicado</span>
                            </div>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatCurrency(rawDataPoint.applied ?? 0)}</span>
                        </div>

                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm bg-[#a7f3d0]"></div>
                                <span className="text-xs text-gray-400">Ganho de Capital</span>
                            </div>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatCurrency(rawDataPoint.profit ?? 0)}</span>
                        </div>
                    </div>
                )}

                {metricMode === 'RETURN' && (
                    <div className="space-y-3">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm bg-[#5b78d1]"></div>
                                <span className="text-xs text-gray-400">Carteira</span>
                            </div>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatPercent(rawDataPoint.portfolioReturnPct ?? 0)}</span>
                        </div>

                        {typeof rawDataPoint.benchmarkReturnPct === 'number' && (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-sm bg-[#f59e0b]"></div>
                                    <span className="text-xs text-gray-400">Benchmark CDI</span>
                                </div>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatPercent(rawDataPoint.benchmarkReturnPct)}</span>
                            </div>
                        )}

                        {typeof rawDataPoint.excessReturnPct === 'number' && (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-sm bg-[#8b5cf6]"></div>
                                    <span className="text-xs text-gray-400">Excesso</span>
                                </div>
                                <span className={`text-sm font-bold ${rawDataPoint.excessReturnPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {formatPercentagePoint(rawDataPoint.excessReturnPct)}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {metricMode === 'EXCESS' && (
                    <div className="space-y-3">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm bg-[#8b5cf6]"></div>
                                <span className="text-xs text-gray-400">Excesso vs CDI</span>
                            </div>
                            <span className={`text-sm font-bold ${rawDataPoint.excessReturnPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatPercentagePoint(rawDataPoint.excessReturnPct ?? 0)}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-400">Carteira</span>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                    {formatPercent(rawDataPoint.portfolioReturnPct ?? 0)}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-400">CDI</span>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                    {formatPercent(rawDataPoint.benchmarkReturnPct ?? 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderMetricButtons = () => {
        if (!canToggleMetrics) {
            return null;
        }

        const buttons: Array<{ id: ChartMetricMode; label: string; disabled?: boolean }> = [
            { id: 'VALUE', label: 'Patrimônio' },
            { id: 'RETURN', label: 'Rentabilidade' },
            { id: 'EXCESS', label: 'Excesso vs CDI', disabled: !hasBenchmark },
        ];

        return (
            <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1">
                {buttons.map((button) => (
                    <button
                        key={button.id}
                        type="button"
                        onClick={() => !button.disabled && setMetricMode(button.id)}
                        disabled={button.disabled}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            metricMode === button.id
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        } ${button.disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                    >
                        {button.id === 'VALUE' ? 'Patrim\u00f4nio' : button.label}
                    </button>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="h-64 mt-6 w-full flex items-center justify-center bg-gray-50/50 dark:bg-gray-900/10 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                <Loader size="lg" text={LOADING_TEXT} />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-64 mt-6 w-full flex items-center justify-center bg-gray-50/50 dark:bg-gray-900/10 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                <Loader size="lg" text="Mapeando Evolução..." />
            </div>
        );
    }

    return (
        <div
            className="mt-6 w-full"
            data-testid={investmentId === 'portfolio' ? 'portfolio-yield-chart' : `investment-yield-chart-${investmentId}`}
        >
            <div className="flex flex-col gap-4 mb-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 tracking-wide">{cleanHeaderTitle}</h4>
                        {investmentId === 'portfolio' && !compact && !hasBenchmark && (
                            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                O Benchmark CDI aparece quando o filtro contém apenas ativos comparáveis de renda fixa.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {renderMetricButtons()}

                        <div className="relative group">
                            <button className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-blue-500 transition-colors">
                                <Calendar size={14} className="text-gray-400" />
                                <span>{PERIOD_LABELS_CLEAN[period] || PERIOD_LABELS_CLEAN.ALL}</span>
                                <ChevronDown size={14} className="text-gray-400" />
                            </button>
                            <div className="absolute top-full right-0 mt-2 w-40 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                                {(Object.entries(PERIOD_LABELS_CLEAN) as Array<[ChartPeriod, string]>).map(([id, label]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setPeriod(id)}
                                        className="w-full text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {showAssetTypeFilter && (
                            <div className="relative group">
                                <button className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-blue-500 transition-colors">
                                    <Wallet size={14} className="text-gray-400" />
                                    <span>{getAssetTypeLabelClean(assetType)}</span>
                                    <ChevronDown size={14} className="text-gray-400" />
                                </button>
                                <div className="absolute top-full right-0 mt-2 w-44 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                                    {[
                                        { id: 'ALL', label: 'Todos os Tipos' },
                                        { id: 'FUNDOS', label: 'Fundos' },
                                        { id: 'TESOURO', label: 'Tesouro Direto' },
                                        { id: 'RENDA_FIXA', label: 'Renda Fixa' },
                                        { id: 'VARIAVEL', label: 'Renda Variável' },
                                        { id: 'OUTROS', label: 'Outros' },
                                    ].map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setAssetType(option.id)}
                                            className="w-full text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {ASSET_TYPE_LABELS[option.id] || option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={`w-full ${compact ? 'h-56' : 'h-72'}`}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} opacity={0.3} />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            tick={{ fontSize: 10, fill: textColor }}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            width={85}
                            tickFormatter={(value: number) => {
                                if (metricMode === 'VALUE') {
                                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                                    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                                    return value.toString();
                                }

                                return `${(value * 100).toFixed(0)}%`;
                            }}
                            tick={{ fontSize: 10, fill: textColor }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? '#374151' : '#f3f4f6', opacity: 0.4 }} />

                        {metricMode === 'VALUE' && (
                            <>
                                <Bar dataKey="applied" stackId="portfolio" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={40} />
                                <Bar dataKey="profit" stackId="portfolio" fill="#a7f3d0" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                <Line type="monotone" dataKey="value" stroke="#5b78d1" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                                {hasBenchmark && (
                                    <Line
                                        type="monotone"
                                        dataKey="benchmarkValue"
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                )}
                            </>
                        )}

                        {metricMode === 'RETURN' && (
                            <>
                                <ReferenceLine y={0} stroke={gridColor} strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="portfolioReturnPct" stroke="#5b78d1" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                                {hasBenchmark && (
                                    <Line
                                        type="monotone"
                                        dataKey="benchmarkReturnPct"
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                )}
                            </>
                        )}

                        {metricMode === 'EXCESS' && (
                            <>
                                <ReferenceLine y={0} stroke={gridColor} strokeDasharray="4 4" />
                                <Line
                                    type="monotone"
                                    dataKey="excessReturnPct"
                                    stroke="#8b5cf6"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </>
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 mt-6">
                {metricMode === 'VALUE' && (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-2 rounded-sm bg-[#10b981]"></div>
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Valor Aplicado</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-2 rounded-sm bg-[#a7f3d0]"></div>
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Ganho de Capital</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-[2px] rounded-sm bg-[#5b78d1]"></div>
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Carteira</span>
                        </div>
                        {hasBenchmark && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-[2px] rounded-sm bg-[#f59e0b] border-t border-dashed border-[#f59e0b]"></div>
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Benchmark CDI</span>
                            </div>
                        )}
                    </>
                )}

                {metricMode === 'RETURN' && (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-[2px] rounded-sm bg-[#5b78d1]"></div>
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Carteira</span>
                        </div>
                        {hasBenchmark && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-[2px] rounded-sm bg-[#f59e0b] border-t border-dashed border-[#f59e0b]"></div>
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Benchmark CDI</span>
                            </div>
                        )}
                    </>
                )}

                {metricMode === 'EXCESS' && (
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-[2px] rounded-sm bg-[#8b5cf6]"></div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">Excesso vs CDI</span>
                    </div>
                )}
            </div>
        </div>
    );
}
