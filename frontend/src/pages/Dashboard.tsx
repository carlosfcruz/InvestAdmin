import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useInvestments } from '../hooks/useInvestments';
import type { Investment } from '../hooks/useInvestments';
import { useInvestmentOpportunities } from '../hooks/useInvestmentOpportunities';
import { usePortfolioSummary } from '../hooks/usePortfolioSummary';
import { useIndexes } from '../hooks/useIndexes';
import { useTheme } from '../contexts/ThemeContext';
import { SunIcon, MoonIcon, PieChart, LogOut, Activity, AlertCircle, ChevronRight, X, ArrowUp, ArrowDown, Pencil, Info, Bell, ChevronLeft, GripVertical } from 'lucide-react';
import { api } from '../services/api';
import { AppShell } from '../components/AppShell';
import { Loader } from '../components/Loader';
import { ToastStack, type ToastItem, type ToastTone } from '../components/ToastStack';
import type { ChartPeriod, EvolutionPeriodSummary } from '../components/yieldEvolutionChartMetrics';
import { getOpportunityHomeBadge, getOpportunitySeverityClasses } from '../features/opportunities/opportunityPresentation';

type SortColumn = 'productName' | 'applicationDate' | 'maturityDate' | 'rate' | 'amountInvested' | 'currentValue' | 'allocation';
type SortDirection = 'asc' | 'desc';
type MaturityNotificationStage = 'MATURED' | 'MATURES_TODAY' | 'UPCOMING_7' | 'UPCOMING_30';

interface MaturityNotificationItem {
    investment: Investment;
    title: string;
    description: string;
    notificationKey: string;
}

interface InfoPopoverProps {
    tooltipId: string;
    title: string;
    description: string;
    activeTooltip: string | null;
    onToggle: (tooltipId: string) => void;
    align?: 'left' | 'right';
}

function InfoPopover({
    tooltipId,
    title,
    description,
    activeTooltip,
    onToggle,
    align = 'right',
}: InfoPopoverProps) {
    const isOpen = activeTooltip === tooltipId;
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setPosition(null);
            return;
        }

        const updatePosition = () => {
            const trigger = buttonRef.current;
            if (!trigger) {
                return;
            }

            const rect = trigger.getBoundingClientRect();
            const tooltipWidth = 256;
            const tooltipHeight = 120;
            const gutter = 12;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const preferredLeft = align === 'left'
                ? rect.left
                : rect.right - tooltipWidth;

            const left = Math.min(
                Math.max(gutter, preferredLeft),
                Math.max(gutter, viewportWidth - tooltipWidth - gutter),
            );

            const above = rect.bottom + 8 + tooltipHeight > viewportHeight - gutter
                && rect.top - 8 - tooltipHeight >= gutter;

            setPosition({
                top: above ? rect.top - 8 : rect.bottom + 8,
                left,
                above,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [align, isOpen]);

    return (
        <div data-tooltip-root="true" className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-label={`Ajuda sobre ${title}`}
                onClick={() => onToggle(isOpen ? '' : tooltipId)}
                className="inline-flex items-center justify-center rounded-full p-1 text-gray-400 hover:text-blue-500 transition-colors"
            >
                <Info size={13} />
            </button>

            {isOpen && position && createPortal(
                <div
                    data-tooltip-root="true"
                    role="tooltip"
                    className="fixed z-[120] w-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-2xl"
                    style={{
                        top: position.top,
                        left: position.left,
                        transform: position.above ? 'translateY(-100%)' : 'translateY(0)',
                    }}
                >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
                    <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
                </div>,
                document.body,
            )}
        </div>
    );
}

const LazyInvestmentForm = lazy(async () => {
    const module = await import('../components/InvestmentForm');
    return { default: module.InvestmentForm };
});

const LazyYieldEvolutionChart = lazy(async () => {
    const module = await import('../components/YieldEvolutionChart');
    return { default: module.YieldEvolutionChart };
});

const LazyAssetAllocationChart = lazy(async () => {
    const module = await import('../components/AssetAllocationChart');
    return { default: module.AssetAllocationChart };
});

export function Dashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { investments, loading, error, deleteInvestment, redeemInvestments, refresh } = useInvestments();
    const { indexes, display: indexDisplay } = useIndexes();
    const [showForm, setShowForm] = useState(false);
    const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
    const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null);
    const [selectedInvestmentPeriodSummary, setSelectedInvestmentPeriodSummary] = useState<EvolutionPeriodSummary | null>(null);
    const [investmentToDelete, setInvestmentToDelete] = useState<Investment | null>(null);
    const { theme, toggleTheme } = useTheme();
    const detailsModalRef = useRef<HTMLDivElement>(null);
    const formModalRef = useRef<HTMLDivElement>(null);
    const toastIdRef = useRef(0);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [deletingInvestmentId, setDeletingInvestmentId] = useState<string | null>(null);
    const [isExportingHistory, setIsExportingHistory] = useState(false);

    // Discovery & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndexer, setFilterIndexer] = useState('ALL');
    const [filterClass, setFilterClass] = useState('ALL');
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
    const [groupPagination, setGroupPagination] = useState<Record<string, number>>({});
    const [showNotifications, setShowNotifications] = useState(false);
    const [dismissedNotificationKeys, setDismissedNotificationKeys] = useState<string[]>([]);
    const [sortColumn, setSortColumn] = useState<SortColumn>('productName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [showPendingRedemptions, setShowPendingRedemptions] = useState(false);
    const [showRedeemedHistory, setShowRedeemedHistory] = useState(false);
    const [redeemingIds, setRedeemingIds] = useState<string[]>([]);
    const [redemptionError, setRedemptionError] = useState<string | null>(null);
    const [groupOrder, setGroupOrder] = useState<string[]>([]);
    const [draggedGroupKey, setDraggedGroupKey] = useState<string | null>(null);
    const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);
    const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');
    const ITEMS_PER_PAGE = 5;
    const SECONDARY_TABLE_ITEMS_PER_PAGE = 5;
    const [pendingRedemptionsPage, setPendingRedemptionsPage] = useState(1);
    const [redeemedHistoryPage, setRedeemedHistoryPage] = useState(1);
    const summaryCardTitleClass = 'text-sm font-medium text-gray-500 dark:text-gray-400';
    const summaryPrimaryValueClass = 'mt-2 max-w-full text-[clamp(1.45rem,1.05rem+0.95vw,2.15rem)] font-bold leading-[1.08] tracking-tight tabular-nums [overflow-wrap:anywhere]';
    const summaryMetaLabelClass = 'text-xs font-semibold text-gray-500 dark:text-gray-400';
    const summaryMetaValueClass = 'mt-1 max-w-full text-[clamp(0.95rem,0.88rem+0.2vw,1.05rem)] font-semibold leading-[1.18] tabular-nums text-gray-700 dark:text-gray-300 [overflow-wrap:anywhere]';
    const sectionTitleClass = 'text-xl font-bold text-gray-800 dark:text-gray-100';
    const sectionDescriptionClass = 'text-xs text-gray-500 dark:text-gray-400 mt-1';
    const sectionStatLabelClass = 'text-[10px] text-gray-400 font-bold tracking-tight';
    const sectionStatValueClass = 'font-bold text-gray-800 dark:text-gray-200';
    const custodyOrderStorageKey = user?.id ? `investadmin.dashboard.custody-order:${user.id}` : null;

    const pushToast = (tone: ToastTone, title: string, description?: string) => {
        const toastId = toastIdRef.current + 1;
        toastIdRef.current = toastId;

        setToasts((current) => [...current, { id: toastId, tone, title, description }]);
    };

    const dismissToast = (toastId: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== toastId));
    };

    useEffect(() => {
        if (toasts.length === 0) {
            return;
        }

        const timeout = window.setTimeout(() => {
            setToasts((current) => current.slice(1));
        }, 4200);

        return () => window.clearTimeout(timeout);
    }, [toasts]);

    const isRedeemedInvestment = (investment: Investment) => investment.portfolioStatus === 'REDEEMED';

    const getCurrentBookValue = (investment: Investment) => {
        return investment.currentValue || investment.amountInvested;
    };

    const getPendingRedemptionValue = (investment: Investment) => {
        return (investment as any).maturityNetValue
            || (investment as any).netValue
            || investment.currentValue
            || investment.amountInvested;
    };

    const getRedeemedValue = (investment: Investment) => {
        return investment.redeemedAmount
            || (investment as any).maturityNetValue
            || (investment as any).netValue
            || investment.currentValue
            || investment.amountInvested;
    };

    const activePortfolioInvestments = useMemo(() => {
        return investments.filter((investment) => !isRedeemedInvestment(investment) && investment.maturityStatus !== 'MATURED');
    }, [investments]);

    const pendingRedemptionInvestments = useMemo(() => {
        return investments.filter((investment) => !isRedeemedInvestment(investment) && investment.maturityStatus === 'MATURED');
    }, [investments]);

    const maturingTodayInvestments = useMemo(() => {
        return investments.filter((investment) => !isRedeemedInvestment(investment) && investment.maturityStatus === 'MATURES_TODAY');
    }, [investments]);

    const upcomingMaturityInvestments = useMemo(() => {
        return investments.filter((investment) => (
            !isRedeemedInvestment(investment)
            && investment.maturityStatus === 'ACTIVE'
            && (investment.daysToMaturity ?? 999) > 0
            && (investment.daysToMaturity ?? 999) <= 30
        ));
    }, [investments]);

    const redeemedHistoryInvestments = useMemo(() => {
        return [...investments]
            .filter((investment) => isRedeemedInvestment(investment))
            .sort((left, right) => (right.redeemedAt || '').localeCompare(left.redeemedAt || ''));
    }, [investments]);
    const totalRedeemedHistoryValue = useMemo(() => (
        redeemedHistoryInvestments.reduce((acc, investment) => acc + getRedeemedValue(investment), 0)
    ), [redeemedHistoryInvestments]);
    const totalRedeemedHistoryPrincipal = useMemo(() => (
        redeemedHistoryInvestments.reduce((acc, investment) => acc + investment.amountInvested, 0)
    ), [redeemedHistoryInvestments]);
    const totalRedeemedHistoryResult = totalRedeemedHistoryValue - totalRedeemedHistoryPrincipal;

    const requiredActionCount = pendingRedemptionInvestments.length
        + maturingTodayInvestments.length
        + upcomingMaturityInvestments.length;

    const totalInvested = activePortfolioInvestments.reduce((acc, inv) => acc + inv.amountInvested, 0);
    const totalCurrentValue = activePortfolioInvestments.reduce((acc, inv) => acc + getCurrentBookValue(inv), 0);
    const pendingRedemptionValue = pendingRedemptionInvestments.reduce((acc, inv) => acc + getPendingRedemptionValue(inv), 0);
    const consolidatedPortfolioValue = totalCurrentValue + pendingRedemptionValue;
    const globalYield = totalCurrentValue - totalInvested;
    const portfolioSummaryRefreshKey = useMemo(() => (
        investments
            .map((investment) => `${investment.investmentId}:${investment.updatedAt}:${investment.portfolioStatus || 'ACTIVE'}:${investment.maturityStatus || 'NONE'}`)
            .sort()
            .join('|')
    ), [investments]);
    const { summary: portfolioSummary, error: portfolioSummaryError } = usePortfolioSummary(portfolioSummaryRefreshKey);
    const { opportunities } = useInvestmentOpportunities(portfolioSummaryRefreshKey);
    const opportunityCount = opportunities?.summary.underperformingCount || 0;
    const opportunitiesById = useMemo(() => (
        new Map((opportunities?.items || []).map((item) => [item.investmentId, item]))
    ), [opportunities?.items]);

    const displayActiveInvestedValue = portfolioSummary?.totals.activeInvestedValue ?? totalInvested;
    const displayActiveCurrentValue = portfolioSummary?.totals.activeCurrentValue ?? totalCurrentValue;
    const displayActiveOpenProfit = portfolioSummary?.totals.activeOpenProfit ?? globalYield;
    const displayActiveOpenProfitPct = portfolioSummary?.totals.activeOpenProfitPct
        ?? (displayActiveInvestedValue > 0 ? displayActiveOpenProfit / displayActiveInvestedValue : 0);
    const displayPendingRedemptionValue = portfolioSummary?.totals.pendingRedemptionValue ?? pendingRedemptionValue;
    const displayCashAvailableValue = totalRedeemedHistoryValue;
    const displayConsolidatedValue = (portfolioSummary?.totals.consolidatedValue ?? consolidatedPortfolioValue) + displayCashAvailableValue;
    const fixedIncomeBenchmark = portfolioSummary?.benchmark ?? null;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatInvestmentRate = (investment: Investment) => {
        const formattedRate = Number(investment.rate).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

        if (investment.indexer === 'PREFIXADO') {
            return `${formattedRate}% a.a. Pré-fixado`;
        }

        if (investment.indexer === 'IPCA') {
            return `IPCA + ${formattedRate}% a.a.`;
        }

        return `${formattedRate}% do ${investment.indexer}`;
    };

    const normalizeBenchmarkComparatorLabel = (label?: string | null) => {
        return (label || 'Pós-fixado')
            .replace('PÃ³s-fixado', 'Pós-fixado')
            .replace(/Equivalente L.*quido/, 'Equivalente Líquido');
    };

    const getBenchmarkDescriptor = (investment: Investment) => {
        if (investment.benchmarkAvailable && investment.benchmarkLabel) {
            return {
                benchmark: `Benchmark: ${investment.benchmarkLabel}`,
                comparator: normalizeBenchmarkComparatorLabel(investment.benchmarkComparatorLabel),
            };
        }

        if (!['CDB', 'LCI', 'LCA', 'TESOURO'].includes(investment.type)) {
            return null;
        }

        if (investment.type === 'LCI' || investment.type === 'LCA') {
            return {
                benchmark: investment.indexer === 'SELIC' ? 'Benchmark: SELIC' : investment.indexer === 'IPCA' ? 'Benchmark: IPCA' : 'Benchmark: CDI',
                comparator: 'Equivalente Líquido',
            };
        }

        if (investment.indexer === 'IPCA') {
            return {
                benchmark: 'Benchmark: IPCA',
                comparator: 'Curva Contratada',
            };
        }

        if (investment.indexer === 'PREFIXADO') {
            return {
                benchmark: 'Benchmark: CDI',
                comparator: 'Curva Contratada',
            };
        }

        if (investment.indexer === 'SELIC') {
            return {
                benchmark: 'Benchmark: SELIC',
                comparator: 'Pós-fixado',
            };
        }

        return {
            benchmark: 'Benchmark: CDI',
            comparator: 'Pós-fixado',
        };
    };

    const getBenchmarkExcessLabel = (investment: Investment) => {
        return normalizeBenchmarkComparatorLabel(investment.benchmarkComparatorLabel) === 'Equivalente Líquido'
            ? 'vs benchmark líquido'
            : 'vs benchmark';
    };

    const getDisplayGroupKey = (investmentType: Investment['type']) => {
        return investmentType === 'LCI' || investmentType === 'LCA' ? 'LCI_LCA' : investmentType;
    };

    const getDisplayGroupLabel = (groupKey: string) => {
        if (groupKey === 'LCI_LCA') {
            return 'LCI/LCA';
        }

        return groupKey;
    };

    const formatPercentagePoints = (value: number) => {
        return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} p.p.`;
    };

    const getChartPeriodLabel = (period: ChartPeriod) => {
        const labels: Record<ChartPeriod, string> = {
            ALL: 'Desde o Início',
            '6M': '6 Meses',
            '12M': '12 Meses',
            '2Y': '2 Anos',
            '5Y': '5 Anos',
            '10Y': '10 Anos',
        };

        return labels[period];
    };

    const formatPercentValue = (value: number) => `${(value * 100).toFixed(2)}%`;

    const getComparisonBenchmarkName = (investment?: Investment | null) => investment?.benchmarkLabel || 'Benchmark';

    const getComparatorDescription = (investment?: Investment | null) => {
        const comparatorLabel = normalizeBenchmarkComparatorLabel(investment?.benchmarkComparatorLabel);

        if (comparatorLabel === 'Equivalente Líquido') {
            return 'A comparação ajusta o CDI para uma base líquida equivalente, usada para tornar justa a leitura de produtos isentos de IR como LCI e LCA.';
        }

        if (comparatorLabel === 'Curva Contratada') {
            return 'A comparação considera a curva esperada do produto no período, usando a referência contratada para mostrar se o investimento ficou acima ou abaixo do esperado.';
        }

        return 'A comparação usa o índice de referência do investimento, como CDI ou SELIC, para mostrar se o retorno do período ficou acima ou abaixo dessa base.';
    };

    const getRelativeComparisonLabel = (benchmarkName: string, excessReturnPct: number) => {
        if (Math.abs(excessReturnPct) < 0.00005) {
            return `Em linha com ${benchmarkName}`;
        }

        return excessReturnPct >= 0 ? `Acima do ${benchmarkName}` : `Abaixo do ${benchmarkName}`;
    };

    const getComparisonSummarySentence = (
        investment: Investment,
        summary: EvolutionPeriodSummary,
    ) => {
        const benchmarkName = getComparisonBenchmarkName(investment);
        const relativeLabel = getRelativeComparisonLabel(benchmarkName, summary.excessReturnPct || 0)
            .replace(/^Acima/, 'acima')
            .replace(/^Abaixo/, 'abaixo')
            .replace(/^Em linha/, 'em linha');

        return `Desde ${formatDatePtBr(summary.startDate)}, este investimento rendeu ${formatPercentValue(summary.portfolioReturnPct)} e ficou ${formatPercentagePoints(summary.excessReturnPct || 0)} ${relativeLabel}.`;
    };

    const formatDatePtBr = (value?: string | null) => {
        if (!value) return '--';

        const datePart = value.split('T')[0] || value;
        const parts = datePart.split('-');
        if (parts.length !== 3) {
            return new Date(value).toLocaleDateString('pt-BR');
        }

        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const getMaturityBadge = (investment: Investment) => {
        if (!investment.maturityDate || !investment.maturityStatus || investment.maturityStatus === 'NONE') {
            return null;
        }

        if (investment.maturityStatus === 'MATURED') {
            return {
                label: 'Vencido',
                className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
            };
        }

        if (investment.maturityStatus === 'MATURES_TODAY') {
            return {
                label: 'Vence hoje',
                className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            };
        }

        if ((investment.daysToMaturity ?? 999) <= 30) {
            return {
                label: `Vence em ${investment.daysToMaturity}d`,
                className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
            };
        }

        return null;
    };

    const getOpportunityBadge = (investmentId: string) => {
        const item = opportunitiesById.get(investmentId);
        if (!item) {
            return null;
        }

        return {
            label: getOpportunityHomeBadge(item),
            className: getOpportunitySeverityClasses(item.severity),
        };
    };

    const notificationStorageKey = useMemo(() => {
        return user?.email ? `investadmin:dismissed-maturity-notifications:${user.email}` : null;
    }, [user?.email]);

    useEffect(() => {
        if (!notificationStorageKey) {
            setDismissedNotificationKeys([]);
            return;
        }

        try {
            const storedValue = window.localStorage.getItem(notificationStorageKey);
            const parsed = storedValue ? JSON.parse(storedValue) : [];
            setDismissedNotificationKeys(Array.isArray(parsed) ? parsed : []);
        } catch {
            setDismissedNotificationKeys([]);
        }
    }, [notificationStorageKey]);

    const allMaturityNotifications = useMemo<MaturityNotificationItem[]>(() => {
        return investments
            .filter((investment) => {
                if (isRedeemedInvestment(investment)) {
                    return false;
                }

                if (!investment.maturityDate || !investment.maturityStatus) {
                    return false;
                }

                return investment.maturityStatus === 'MATURED'
                    || investment.maturityStatus === 'MATURES_TODAY'
                    || ((investment.daysToMaturity ?? 999) > 0 && (investment.daysToMaturity ?? 999) <= 30);
            })
            .sort((left, right) => {
                const priority = (status?: Investment['maturityStatus']) => {
                    switch (status) {
                        case 'MATURED':
                            return 0;
                        case 'MATURES_TODAY':
                            return 1;
                        default:
                            return 2;
                    }
                };

                const priorityDiff = priority(left.maturityStatus) - priority(right.maturityStatus);
                if (priorityDiff !== 0) {
                    return priorityDiff;
                }

                return (left.daysToMaturity ?? 999) - (right.daysToMaturity ?? 999);
            })
            .map((investment) => {
                let title = 'Vencimento Próximo';
                let description = `Vence em ${investment.daysToMaturity} dias`;
                let notificationStage: MaturityNotificationStage = 'UPCOMING_30';

                if (investment.maturityStatus === 'MATURED') {
                    title = 'Ativo vencido';
                    description = `Vencido em ${formatDatePtBr(investment.maturityDate)}`;
                    notificationStage = 'MATURED';
                } else if (investment.maturityStatus === 'MATURES_TODAY') {
                    title = 'Vence hoje';
                    description = `Liquidez prevista para hoje (${formatDatePtBr(investment.maturityDate)})`;
                    notificationStage = 'MATURES_TODAY';
                } else if ((investment.daysToMaturity ?? 999) <= 7) {
                    title = 'Vencimento Iminente';
                    description = `Vence em ${investment.daysToMaturity} dias (${formatDatePtBr(investment.maturityDate)})`;
                    notificationStage = 'UPCOMING_7';
                } else {
                    description = `Vence em ${investment.daysToMaturity} dias (${formatDatePtBr(investment.maturityDate)})`;
                }

                return {
                    investment,
                    title,
                    description,
                    notificationKey: `${investment.investmentId}:${notificationStage}:${investment.maturityDate}`,
                };
            });
    }, [investments]);

    useEffect(() => {
        if (!notificationStorageKey) {
            return;
        }

        const activeKeys = new Set(allMaturityNotifications.map((notification) => notification.notificationKey));
        const nextDismissedKeys = dismissedNotificationKeys.filter((key) => activeKeys.has(key));

        if (nextDismissedKeys.length !== dismissedNotificationKeys.length) {
            setDismissedNotificationKeys(nextDismissedKeys);
            window.localStorage.setItem(notificationStorageKey, JSON.stringify(nextDismissedKeys));
        }
    }, [allMaturityNotifications, dismissedNotificationKeys, notificationStorageKey]);

    const persistDismissedNotifications = (keys: string[]) => {
        setDismissedNotificationKeys(keys);
        if (notificationStorageKey) {
            window.localStorage.setItem(notificationStorageKey, JSON.stringify(keys));
        }
    };

    const clearCurrentNotifications = () => {
        const nextDismissedKeys = Array.from(new Set([
            ...dismissedNotificationKeys,
            ...allMaturityNotifications.map((notification) => notification.notificationKey),
        ]));
        persistDismissedNotifications(nextDismissedKeys);
    };

    const maturityNotifications = useMemo(() => {
        const dismissedSet = new Set(dismissedNotificationKeys);
        return allMaturityNotifications.filter((notification) => !dismissedSet.has(notification.notificationKey));
    }, [allMaturityNotifications, dismissedNotificationKeys]);

    useEffect(() => {
        if (!activeTooltip) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-tooltip-root="true"]')) {
                return;
            }

            setActiveTooltip(null);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveTooltip(null);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [activeTooltip]);

    const formatAnnualRate = (rate: number, basis: 'daily' | 'monthly' | 'annual') => {
        const annualRate = basis === 'daily'
            ? Math.pow(1 + rate, 252) - 1
            : basis === 'monthly'
                ? Math.pow(1 + rate, 12) - 1
                : rate;

        return `${(annualRate * 100).toFixed(2)}% a.a.`;
    };

    const formatIndexDisplayRate = (rate: number, basis: 'annual' | 'trailing12m' | 'monthly') => {
        if (basis === 'trailing12m') {
            return `${(rate * 100).toFixed(2)}%`;
        }

        if (basis === 'monthly') {
            return `${(rate * 100).toFixed(2)}% no mês`;
        }

        return `${(rate * 100).toFixed(2)}% a.a.`;
    };

    const getIndexRateLabel = (indexType: 'CDI' | 'SELIC' | 'IPCA') => {
        const displayItem = indexDisplay?.[indexType];
        if (displayItem) {
            return formatIndexDisplayRate(displayItem.rate, displayItem.basis);
        }

        const index = indexes?.[indexType];
        if (!index) return '--';

        const basis = indexType === 'IPCA'
            ? (index.rate > 0.02 ? 'annual' : 'monthly')
            : (index.rate > 0.05 ? 'annual' : 'daily');

        return formatAnnualRate(index.rate, basis);
    };

    const getIndexCardLabel = (indexType: 'CDI' | 'SELIC' | 'IPCA') => {
        return indexDisplay?.[indexType]?.label
            || (indexType === 'CDI' ? 'CDI Hoje' : indexType === 'IPCA' ? 'IPCA Anualizado' : 'SELIC');
    };

    const getIndexUpdatedLabel = (indexType: 'CDI' | 'SELIC' | 'IPCA') => {
        const displayItem = indexDisplay?.[indexType];
        const fallbackDate = indexes?.[indexType]?.date;
        return formatDatePtBr(displayItem?.sourceDate || displayItem?.date || fallbackDate);
    };

    const getSignedClass = (
        value: number,
        positive = 'text-green-600 dark:text-green-400',
        negative = 'text-red-600 dark:text-red-400',
        neutral = 'text-gray-900 dark:text-gray-100'
    ) => {
        if (value > 0) return positive;
        if (value < 0) return negative;
        return neutral;
    };

    // Focus Trap Logic
    useEffect(() => {
        const activeModal = selectedInvestment ? detailsModalRef.current : showForm ? formModalRef.current : null;
        if (!activeModal) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusableElements = activeModal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!focusableElements || focusableElements.length === 0) return;

            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        };

        const originalFocusedElement = document.activeElement as HTMLElement;
        document.addEventListener('keydown', handleKeyDown);

        // Focus first element on open
        setTimeout(() => {
            const firstElement = activeModal.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])') as HTMLElement;
            firstElement?.focus();
        }, 100);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            originalFocusedElement?.focus();
        };
    }, [selectedInvestment, showForm]);

    // Grouping & Filtering Logic
    const matchesDashboardFilters = (investment: Investment) => {
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            const matchesSearch = investment.productName.toLowerCase().includes(term)
                || investment.issuer.toLowerCase().includes(term)
                || investment.type.toLowerCase().includes(term)
                || investment.indexer.toLowerCase().includes(term);

            if (!matchesSearch) {
                return false;
            }
        }

        if (filterIndexer !== 'ALL' && investment.indexer !== filterIndexer) {
            return false;
        }

        if (filterClass !== 'ALL') {
            if (filterClass === 'RENDA_FIXA') {
                return ['CDB', 'LCI', 'LCA', 'RENDA_FIXA'].includes(investment.type);
            }

            return investment.type === filterClass;
        }

        return true;
    };

    const filteredInvestments = useMemo(() => {
        return activePortfolioInvestments.filter(matchesDashboardFilters);
    }, [activePortfolioInvestments, searchTerm, filterIndexer, filterClass]);

    const filteredPendingRedemptionInvestments = useMemo(() => {
        return pendingRedemptionInvestments.filter(matchesDashboardFilters);
    }, [pendingRedemptionInvestments, searchTerm, filterIndexer, filterClass]);

    const filteredRedeemedHistoryInvestments = useMemo(() => {
        return redeemedHistoryInvestments.filter(matchesDashboardFilters);
    }, [redeemedHistoryInvestments, searchTerm, filterIndexer, filterClass]);

    const filteredPendingRedemptionValue = filteredPendingRedemptionInvestments.reduce((acc, investment) => {
        return acc + getPendingRedemptionValue(investment);
    }, 0);
    const filteredPendingPrincipalValue = filteredPendingRedemptionInvestments.reduce((acc, investment) => {
        return acc + investment.amountInvested;
    }, 0);
    const filteredPendingRedemptionResult = filteredPendingRedemptionValue - filteredPendingPrincipalValue;

    const filteredRedeemedHistoryValue = filteredRedeemedHistoryInvestments.reduce((acc, investment) => {
        return acc + getRedeemedValue(investment);
    }, 0);
    const filteredRedeemedPrincipalValue = filteredRedeemedHistoryInvestments.reduce((acc, investment) => {
        return acc + investment.amountInvested;
    }, 0);
    const filteredRedeemedHistoryResult = filteredRedeemedHistoryValue - filteredRedeemedPrincipalValue;
    const pendingRedemptionTotalPages = Math.max(1, Math.ceil(filteredPendingRedemptionInvestments.length / SECONDARY_TABLE_ITEMS_PER_PAGE));
    const currentPendingRedemptionsPage = Math.min(pendingRedemptionsPage, pendingRedemptionTotalPages);
    const visiblePendingRedemptionInvestments = filteredPendingRedemptionInvestments.slice(
        (currentPendingRedemptionsPage - 1) * SECONDARY_TABLE_ITEMS_PER_PAGE,
        currentPendingRedemptionsPage * SECONDARY_TABLE_ITEMS_PER_PAGE
    );
    const redeemedHistoryTotalPages = Math.max(1, Math.ceil(filteredRedeemedHistoryInvestments.length / SECONDARY_TABLE_ITEMS_PER_PAGE));
    const currentRedeemedHistoryPage = Math.min(redeemedHistoryPage, redeemedHistoryTotalPages);
    const visibleRedeemedHistoryInvestments = filteredRedeemedHistoryInvestments.slice(
        (currentRedeemedHistoryPage - 1) * SECONDARY_TABLE_ITEMS_PER_PAGE,
        currentRedeemedHistoryPage * SECONDARY_TABLE_ITEMS_PER_PAGE
    );

    useEffect(() => {
        setPendingRedemptionsPage((current) => Math.min(current, pendingRedemptionTotalPages));
    }, [pendingRedemptionTotalPages]);

    useEffect(() => {
        setRedeemedHistoryPage((current) => Math.min(current, redeemedHistoryTotalPages));
    }, [redeemedHistoryTotalPages]);

    const groupedInvestments = useMemo(() => {
        const groups: Record<string, Investment[]> = {};
        filteredInvestments.forEach(inv => {
            const groupKey = getDisplayGroupKey(inv.type);
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(inv);
        });

        const getSortableValue = (investment: Investment, column: SortColumn) => {
            switch (column) {
                case 'productName':
                    return investment.productName.toLowerCase();
                case 'applicationDate':
                    return investment.applicationDate ? new Date(investment.applicationDate).getTime() : 0;
                case 'maturityDate':
                    return investment.maturityDate ? new Date(investment.maturityDate).getTime() : Number.MAX_SAFE_INTEGER;
                case 'rate':
                    return investment.rate;
                case 'amountInvested':
                    return investment.amountInvested;
                case 'currentValue':
                    return getCurrentBookValue(investment);
                case 'allocation':
                    return (getCurrentBookValue(investment) / (totalCurrentValue || 1)) * 100;
                default:
                    return investment.productName.toLowerCase();
            }
        };

        Object.keys(groups).forEach((groupKey) => {
            groups[groupKey] = [...groups[groupKey]].sort((left, right) => {
                const leftValue = getSortableValue(left, sortColumn);
                const rightValue = getSortableValue(right, sortColumn);

                if (typeof leftValue === 'string' && typeof rightValue === 'string') {
                    const comparison = leftValue.localeCompare(rightValue, 'pt-BR');
                    return sortDirection === 'asc' ? comparison : -comparison;
                }

                const comparison = Number(leftValue) - Number(rightValue);
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        });

        return groups;
    }, [filteredInvestments, sortColumn, sortDirection, totalCurrentValue]);

    const allCustodyGroupKeys = useMemo<string[]>(() => {
        return Array.from(new Set(activePortfolioInvestments.map((investment) => getDisplayGroupKey(investment.type))));
    }, [activePortfolioInvestments]);

    const orderedGroupedInvestments = useMemo(() => {
        const visibleGroupKeys = Object.keys(groupedInvestments);
        const orderedVisibleKeys = groupOrder.filter((groupKey) => visibleGroupKeys.includes(groupKey));
        const missingVisibleKeys = visibleGroupKeys.filter((groupKey) => !orderedVisibleKeys.includes(groupKey));

        return [...orderedVisibleKeys, ...missingVisibleKeys].map((groupKey) => [groupKey, groupedInvestments[groupKey]] as const);
    }, [groupOrder, groupedInvestments]);

    useEffect(() => {
        if (allCustodyGroupKeys.length === 0) {
            setGroupOrder((current) => (current.length === 0 ? current : []));
            return;
        }

        let savedOrder: string[] = [];

        if (custodyOrderStorageKey) {
            try {
                const rawValue = window.localStorage.getItem(custodyOrderStorageKey);
                const parsedValue = rawValue ? JSON.parse(rawValue) : [];
                if (Array.isArray(parsedValue)) {
                    savedOrder = parsedValue.filter((value): value is string => typeof value === 'string');
                }
            } catch (error) {
                console.error('Failed to restore custody order', error);
            }
        }

        setGroupOrder((current) => {
            const baseOrder = current.length > 0 ? current : savedOrder;
            const normalizedOrder = baseOrder.filter((groupKey) => allCustodyGroupKeys.includes(groupKey));
            const missingGroupKeys = allCustodyGroupKeys.filter((groupKey) => !normalizedOrder.includes(groupKey));
            const nextOrder = [...normalizedOrder, ...missingGroupKeys];

            if (current.length === nextOrder.length && current.every((groupKey, index) => groupKey === nextOrder[index])) {
                return current;
            }

            return nextOrder;
        });
    }, [allCustodyGroupKeys, custodyOrderStorageKey]);

    useEffect(() => {
        if (!custodyOrderStorageKey || groupOrder.length === 0) {
            return;
        }

        try {
            window.localStorage.setItem(custodyOrderStorageKey, JSON.stringify(groupOrder));
        } catch (error) {
            console.error('Failed to persist custody order', error);
        }
    }, [custodyOrderStorageKey, groupOrder]);

    useEffect(() => {
        setGroupPagination((current) => {
            const next: Record<string, number> = {};

            Object.entries(groupedInvestments).forEach(([type, items]) => {
                const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                next[type] = Math.min(current[type] || 1, totalPages);
            });

            return next;
        });
    }, [groupedInvestments]);

    const toggleGroup = (type: string) => {
        setExpandedGroups(prev => ({ ...prev, [type]: !(prev[type] ?? true) }));
    };

    const resetGroupDragState = () => {
        setDraggedGroupKey(null);
        setDragOverGroupKey(null);
        setDragOverPosition('before');
    };

    const reorderCustodyGroups = (sourceGroupKey: string, targetGroupKey: string, position: 'before' | 'after') => {
        if (sourceGroupKey === targetGroupKey) {
            return;
        }

        setGroupOrder((current) => {
            const baseOrder = current.length > 0 ? current : allCustodyGroupKeys;
            const sourceIndex = baseOrder.indexOf(sourceGroupKey);
            const targetIndex = baseOrder.indexOf(targetGroupKey);

            if (sourceIndex === -1 || targetIndex === -1) {
                return current;
            }

            const nextOrder = baseOrder.filter((groupKey) => groupKey !== sourceGroupKey);
            const insertionIndex = nextOrder.indexOf(targetGroupKey) + (position === 'after' ? 1 : 0);
            nextOrder.splice(insertionIndex, 0, sourceGroupKey);

            return nextOrder;
        });
    };

    const handleGroupDragStart = (event: any, groupKey: string) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', groupKey);
        setDraggedGroupKey(groupKey);
        setDragOverGroupKey(groupKey);
    };

    const handleGroupDragOver = (event: any, groupKey: string) => {
        if (!draggedGroupKey || draggedGroupKey === groupKey) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        const bounds = event.currentTarget.getBoundingClientRect();
        const nextPosition = event.clientY >= bounds.top + (bounds.height / 2) ? 'after' : 'before';

        if (dragOverGroupKey !== groupKey || dragOverPosition !== nextPosition) {
            setDragOverGroupKey(groupKey);
            setDragOverPosition(nextPosition);
        }
    };

    const handleGroupDrop = (event: any, groupKey: string) => {
        event.preventDefault();

        const sourceGroupKey = draggedGroupKey || event.dataTransfer.getData('text/plain');

        if (sourceGroupKey && sourceGroupKey !== groupKey) {
            reorderCustodyGroups(sourceGroupKey, groupKey, dragOverPosition);
        }

        resetGroupDragState();
    };

    const toggleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
            return;
        }

        setSortColumn(column);
        setSortDirection('asc');
    };

    const renderSortHeader = (label: string, column: SortColumn, align: 'left' | 'center' = 'left') => {
        const isActive = sortColumn === column;
        const ariaSort = isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

        return (
            <th
                className={`px-6 py-3 text-[10px] font-bold text-gray-400 tracking-wide ${align === 'center' ? 'text-center' : 'text-left'}`}
                aria-sort={ariaSort}
            >
                <button
                    type="button"
                    onClick={() => toggleSort(column)}
                    className={`inline-flex items-center gap-1 transition-colors ${align === 'center' ? 'justify-center' : ''} ${isActive ? 'text-blue-600 dark:text-blue-400' : 'hover:text-gray-600 dark:hover:text-gray-200'}`}
                >
                    <span>{label}</span>
                    <span className="flex flex-col leading-none" aria-hidden="true">
                        <ArrowUp size={10} className={isActive && sortDirection === 'asc' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600'} />
                        <ArrowDown size={10} className={isActive && sortDirection === 'desc' ? 'text-blue-600 dark:text-blue-400 -mt-1' : 'text-gray-300 dark:text-gray-600 -mt-1'} />
                    </span>
                </button>
            </th>
        );
    };

    const renderPaginationControls = ({
        page,
        totalPages,
        totalItems,
        visibleItems,
        itemLabel,
        onPageChange,
    }: {
        page: number;
        totalPages: number;
        totalItems: number;
        visibleItems: number;
        itemLabel: string;
        onPageChange: (page: number) => void;
    }) => {
        if (totalPages <= 1) {
            return null;
        }

        const pageWindowStart = Math.max(1, Math.min(page - 1, totalPages - 2));
        const pageWindowEnd = Math.min(totalPages, pageWindowStart + 2);
        const visiblePageNumbers = Array.from(
            { length: pageWindowEnd - pageWindowStart + 1 },
            (_, index) => pageWindowStart + index
        );

        return (
            <div className="mt-6 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Página {page} de {totalPages} - exibindo {visibleItems} de {totalItems} {itemLabel}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                        type="button"
                        onClick={() => onPageChange(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
                    >
                        <ChevronLeft size={14} />
                        Anterior
                    </button>

                    {pageWindowStart > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={() => onPageChange(1)}
                                aria-label={`Página 1 de ${totalPages}`}
                                className="w-9 h-9 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500 transition-colors"
                            >
                                1
                            </button>
                            {pageWindowStart > 2 && <span className="text-xs text-gray-400">...</span>}
                        </>
                    )}

                    {visiblePageNumbers.map((pageNumber) => (
                        <button
                            key={pageNumber}
                            type="button"
                            onClick={() => onPageChange(pageNumber)}
                            aria-label={`Página ${pageNumber} de ${totalPages}`}
                            className={`w-9 h-9 text-xs font-bold rounded-xl border transition-colors ${
                                pageNumber === page
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500'
                            }`}
                        >
                            {pageNumber}
                        </button>
                    ))}

                    {pageWindowEnd < totalPages && (
                        <>
                            {pageWindowEnd < totalPages - 1 && <span className="text-xs text-gray-400">...</span>}
                            <button
                                type="button"
                                onClick={() => onPageChange(totalPages)}
                                aria-label={`Página ${totalPages} de ${totalPages}`}
                                className="w-9 h-9 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500 transition-colors"
                            >
                                {totalPages}
                            </button>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
                    >
                        Próxima
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        );
    };

    const handleRedeemSelection = async (investmentIds: string[]) => {
        if (investmentIds.length === 0) {
            return;
        }

        setRedeemingIds(investmentIds);
        setRedemptionError(null);

        try {
            await redeemInvestments(investmentIds);
            setShowRedeemedHistory(true);
            setPendingRedemptionsPage(1);
            setRedeemedHistoryPage(1);
            pushToast(
                'success',
                investmentIds.length === 1 ? 'Resgate marcado como concluído' : 'Resgates marcados como concluídos',
                investmentIds.length === 1
                    ? 'O ativo foi movido para o histórico operacional.'
                    : `${investmentIds.length} ativos foram movidos para o histórico operacional.`,
            );
        } catch (err: any) {
            const message = err?.message || 'Falha ao marcar resgate.';
            setRedemptionError(message);
            pushToast('error', 'Não foi possível atualizar o resgate', message);
        } finally {
            setRedeemingIds([]);
        }
    };

    const closeFormModal = () => {
        setShowForm(false);
        setEditingInvestment(null);
    };

    const handleFormSuccess = () => {
        const wasEditing = Boolean(editingInvestment);
        closeFormModal();

        void refresh()
            .then(() => {
                pushToast(
                    'success',
                    wasEditing ? 'Investimento atualizado' : 'Investimento cadastrado',
                    wasEditing
                        ? 'Os dados do ativo foram atualizados na carteira.'
                        : 'O novo ativo já aparece na carteira.',
                );
            })
            .catch((err: any) => {
                pushToast(
                    'error',
                    'Investimento salvo, mas a carteira não recarregou',
                    err?.message || 'Atualize a página para conferir os dados mais recentes.',
                );
            });
    };

    const handleExportHistory = async () => {
        if (!selectedInvestment) {
            return;
        }

        const investment = selectedInvestment;
        setIsExportingHistory(true);

        try {
            const response = await api.get(`/investments/${investment.investmentId}/evolution`);
            const data = await response.json();
            const items = data.items || [];

            if (items.length === 0) {
                pushToast('error', 'Sem histórico para exportar', 'Ainda não há dados suficientes para gerar o CSV.');
                return;
            }

            const headers = Object.keys(items[0]).join(';');
            const rows = items
                .map((row: any) => Object.values(row).map((value) => String(value).replace('.', ',')).join(';'))
                .join('\n');
            const csvContent = `${headers}\n${rows}`;
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `extrato_${investment.productName.replace(/\s+/g, '_')}.csv`;
            anchor.click();
            URL.revokeObjectURL(url);

            pushToast('success', 'Histórico exportado', `CSV gerado para ${investment.productName}.`);
        } catch (err: any) {
            console.error('Erro no export:', err);
            pushToast('error', 'Falha ao exportar histórico', err?.message || 'Tente novamente em alguns instantes.');
        } finally {
            setIsExportingHistory(false);
        }
    };

    const handleDeleteInvestment = async () => {
        if (!investmentToDelete) {
            return;
        }

        const investment = investmentToDelete;
        setDeletingInvestmentId(investment.investmentId);

        try {
            await deleteInvestment(investment.investmentId);
            setInvestmentToDelete(null);

            if (selectedInvestment?.investmentId === investment.investmentId) {
                setSelectedInvestment(null);
            }

            pushToast('success', 'Investimento excluído', `${investment.productName} foi removido da carteira.`);
        } catch (err: any) {
            pushToast('error', 'Não foi possível excluir o investimento', err?.message || 'Tente novamente.');
        } finally {
            setDeletingInvestmentId(null);
        }
    };

    useEffect(() => {
        setSelectedInvestmentPeriodSummary(null);
    }, [selectedInvestment?.investmentId]);

    const getGroupMetrics = (items: Investment[]) => {
        const invested = items.reduce((acc, inv) => acc + inv.amountInvested, 0);
        const current = items.reduce((acc, inv) => acc + getCurrentBookValue(inv), 0);
        const profit = current - invested;
        const allocation = (current / (totalCurrentValue || 1)) * 100;
        return { invested, current, profit, allocation };
    };

    const selectedInvestmentStatus = selectedInvestment?.maturityStatus || 'NONE';
    const selectedInvestmentIsPastMaturity = selectedInvestmentStatus === 'MATURED' || selectedInvestmentStatus === 'MATURES_TODAY';
    const selectedInvestmentComparisonSummary = (
        selectedInvestment?.benchmarkAvailable
        && selectedInvestmentPeriodSummary
        && typeof selectedInvestmentPeriodSummary.benchmarkReturnPct === 'number'
        && typeof selectedInvestmentPeriodSummary.excessReturnPct === 'number'
    ) ? selectedInvestmentPeriodSummary : null;

    const topbarActions = (
        <>
            <div className="relative">
                <button
                    onClick={() => setShowNotifications((current) => !current)}
                    className="icon-action-button relative"
                    aria-label="Notificações de Vencimento"
                >
                    <Bell size={20} />
                    {maturityNotifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {maturityNotifications.length}
                        </span>
                    )}
                </button>

                {showNotifications && (
                    <div className="absolute right-0 mt-2 z-30 w-[26rem] max-w-[calc(100vw-2rem)] rounded-[28px] border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Vencimentos</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Alertas in-app derivados da carteira atual</p>
                            </div>
                            <button
                                type="button"
                                onClick={clearCurrentNotifications}
                                disabled={maturityNotifications.length === 0}
                                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                                Limpar todas
                            </button>
                        </div>

                        <div className="scroll-area scroll-area-contained scrollbar-modern scrollbar-modern-inset max-h-80 overflow-y-auto px-1 py-1">
                            {maturityNotifications.length === 0 ? (
                                <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                                    Nenhum alerta pendente. Alertas limpos voltam apenas quando o vencimento mudar de etapa.
                                </div>
                            ) : (
                                maturityNotifications.map(({ investment, title, description, notificationKey }) => {
                                    const badge = getMaturityBadge(investment);
                                    return (
                                        <button
                                            key={notificationKey}
                                            onClick={() => {
                                                setSelectedInvestment(investment);
                                                setShowNotifications(false);
                                            }}
                                            className="w-full rounded-2xl text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{investment.productName}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                                                </div>
                                                {badge && (
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
            <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-200 sm:block">{user?.email}</span>
            <button
                onClick={toggleTheme}
                className="icon-action-button"
                aria-label="Alternar tema"
            >
                {theme === 'light' ? <MoonIcon size={20} /> : <SunIcon size={20} />}
            </button>
            <button onClick={logout} className="icon-action-button" title="Sair" aria-label="Sair">
                <LogOut size={20} />
            </button>
        </>
    );

    return (
        <>
            <AppShell
                activePath="dashboard"
                searchTerm={searchTerm}
                onSearchTermChange={(event) => setSearchTerm(event.target.value)}
                opportunityCount={opportunityCount}
                rightActions={topbarActions}
            >
                    {/* Market Data & Discovery */}
                    {indexes && (
                        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {[
                                { id: 'cdi', key: 'CDI' as const, label: getIndexCardLabel('CDI'), rate: getIndexRateLabel('CDI'), color: 'blue', title: 'CDI (Certificado de Depósito Interbancário)', desc: 'A API entrega CDI na base diária. A home anualiza a taxa apenas para exibição do indicador macro.' },
                                { id: 'selic', key: 'SELIC' as const, label: getIndexCardLabel('SELIC'), rate: getIndexRateLabel('SELIC'), color: 'purple', title: 'SELIC', desc: 'A tela exibe a taxa anual a partir da base diária retornada pela API, sem assumir automaticamente SELIC Meta.' },
                                { id: 'ipca', key: 'IPCA' as const, label: getIndexCardLabel('IPCA'), rate: getIndexRateLabel('IPCA'), color: 'orange', title: 'IPCA', desc: 'Na home, o IPCA é mostrado como acumulado em 12 meses, que é a leitura mais comum para inflação. O cálculo dos investimentos continua usando o IPCA mensal do histórico.' }
                            ].map((idx) => {
                                const bgColorClass = idx.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' : idx.color === 'purple' ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-orange-100 dark:bg-orange-900/30';
                                const textColorClass = idx.color === 'blue' ? 'text-blue-700 dark:text-blue-300' : idx.color === 'purple' ? 'text-violet-700 dark:text-violet-300' : 'text-orange-700 dark:text-orange-300';

                                return (
                                    <div key={idx.id} className="card relative overflow-visible border-gray-100 px-5 py-4 dark:border-gray-800">
                                        <div className="flex items-start gap-4">
                                            <div className={`rounded-2xl p-3 ${bgColorClass} ${textColorClass}`}>
                                                <Activity size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{idx.label}</p>
                                                    <InfoPopover
                                                        tooltipId={idx.id}
                                                        title={idx.title}
                                                        description={idx.desc}
                                                        activeTooltip={activeTooltip}
                                                        onToggle={setActiveTooltip}
                                                    />
                                                </div>
                                                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{idx.rate}</p>
                                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Atualizado em {getIndexUpdatedLabel(idx.key)}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Resumo da Carteira */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                        <div className="card p-6 bg-gradient-to-br from-slate-50 via-white to-blue-50 hover:shadow-lg transition-all duration-300 dark:from-slate-900 dark:via-gray-900 dark:to-blue-950/30">
                            <div className="flex justify-between items-start">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className={summaryCardTitleClass}>Patrimônio Consolidado</h3>
                                        <InfoPopover
                                            tooltipId="summary-consolidated"
                                            title="Patrimônio Consolidado"
                                            description="Soma das posições ativas, dos valores em liquidação e do caixa disponível derivado dos itens já marcados como resgatados."
                                            activeTooltip={activeTooltip}
                                            onToggle={setActiveTooltip}
                                        />
                                    </div>
                                    <p className={`${summaryPrimaryValueClass} text-gray-900 dark:text-white`}>{formatCurrency(displayConsolidatedValue)}</p>
                                </div>
                                <div className={`flex items-center px-2 py-1 rounded-lg text-xs font-bold ${displayActiveOpenProfit >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {displayActiveOpenProfit >= 0 ? '+' : ''}{(displayActiveOpenProfitPct * 100).toFixed(2)}%
                                    {displayActiveOpenProfit >= 0 ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />}
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                    Base patrimonial operacional: posições ativas, ativos em liquidação e caixa disponível derivado do histórico resgatado.
                                </p>
                            </div>
                        </div>

                        <div className="card p-6 bg-gradient-to-br from-green-50 via-white to-emerald-50 hover:shadow-lg transition-all duration-300 dark:from-green-950/30 dark:via-gray-900 dark:to-emerald-950/30">
                            <div className="flex items-center gap-2">
                                <h3 className={summaryCardTitleClass}>Resultado em Aberto</h3>
                                <InfoPopover
                                    tooltipId="summary-open-result"
                                    title="Resultado em Aberto"
                                    description="Lucro ou prejuízo ainda não realizado das posições ativas. Esse número não inclui ativos já resgatados no histórico."
                                    activeTooltip={activeTooltip}
                                    onToggle={setActiveTooltip}
                                />
                            </div>
                            <p className={`${summaryPrimaryValueClass} ${displayActiveOpenProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {displayActiveOpenProfit >= 0 ? '+' : ''}{formatCurrency(displayActiveOpenProfit)}
                            </p>
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                    Mostra apenas o resultado ainda não realizado das posições ativas. Resgates marcados ficam fora deste cálculo.
                                </p>
                            </div>
                        </div>

                        <div className="card p-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50 hover:shadow-lg transition-all duration-300 dark:from-blue-950/30 dark:via-gray-900 dark:to-indigo-950/30">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className={summaryCardTitleClass}>Renda Fixa x CDI</h3>
                                        <InfoPopover
                                            tooltipId="summary-benchmark"
                                            title="Renda Fixa x CDI"
                                            description="Compara a rentabilidade acumulada da parcela elegível de renda fixa contra o CDI no mesmo período, usando TWR para neutralizar aportes e resgates."
                                            activeTooltip={activeTooltip}
                                            onToggle={setActiveTooltip}
                                        />
                                    </div>
                                    {fixedIncomeBenchmark?.hasData ? (
                                        <p className={`${summaryPrimaryValueClass} ${fixedIncomeBenchmark.excessReturnPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {fixedIncomeBenchmark.excessReturnPct >= 0 ? '+' : ''}{(fixedIncomeBenchmark.excessReturnPct * 100).toFixed(2)} p.p.
                                        </p>
                                    ) : (
                                        <p className="mt-2 text-lg font-semibold text-gray-700 dark:text-gray-200">Sem Base Elegível</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                        TWR
                                    </span>
                                    <InfoPopover
                                        tooltipId="summary-twr"
                                        title="TWR"
                                        description="Taxa ponderada pelo tempo. Essa metodologia evita distorções de performance causadas por aportes e resgates em datas diferentes."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                        align="right"
                                    />
                                </div>
                            </div>
                            {fixedIncomeBenchmark?.hasData ? (
                                <>
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={summaryMetaLabelClass}>Carteira RF</p>
                                                <InfoPopover
                                                    tooltipId="summary-benchmark-portfolio"
                                                    title="Carteira RF"
                                                    description="Rentabilidade acumulada em TWR da parcela elegível de renda fixa da carteira no período analisado."
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                    align="left"
                                                />
                                            </div>
                                            <p className={summaryMetaValueClass}>
                                                {(fixedIncomeBenchmark.portfolioReturnPct * 100).toFixed(2)}%
                                            </p>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={summaryMetaLabelClass}>CDI</p>
                                                <InfoPopover
                                                    tooltipId="summary-benchmark-cdi"
                                                    title="CDI"
                                                    description="Rentabilidade acumulada do CDI no mesmo período usado na comparação da carteira, servindo como benchmark de referência."
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                />
                                            </div>
                                            <p className={summaryMetaValueClass}>
                                                {(fixedIncomeBenchmark.benchmarkReturnPct * 100).toFixed(2)}%
                                            </p>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={summaryMetaLabelClass}>Base Analisada</p>
                                                <InfoPopover
                                                    tooltipId="summary-benchmark-base"
                                                    title="Base Analisada"
                                                    description="Valor atual total dos ativos elegíveis de renda fixa usados para comparar a carteira com o CDI."
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                />
                                            </div>
                                            <p className={summaryMetaValueClass}>
                                                {formatCurrency(fixedIncomeBenchmark.eligibleCurrentValue)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 text-[10px] text-gray-400">
                                        <span>{fixedIncomeBenchmark.periodLabel}</span>
                                        <span>Índice em {formatDatePtBr(fixedIncomeBenchmark.lastIndexDate)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                                    {portfolioSummaryError || 'O benchmark CDI aparecerá quando houver ativos elegíveis de renda fixa na carteira ativa.'}
                                </div>
                            )}
                        </div>

                        <div className="card p-6 bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/10 dark:to-gray-800 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-2">
                                <h3 className={summaryCardTitleClass}>Ações Necessárias</h3>
                                <InfoPopover
                                    tooltipId="summary-actions"
                                    title="Ações Necessárias"
                                    description="Resume os eventos operacionais que exigem atenção na home: vencimentos do dia, resgates pendentes e ativos próximos do vencimento."
                                    activeTooltip={activeTooltip}
                                    onToggle={setActiveTooltip}
                                />
                            </div>
                            <div className="mt-2 flex items-end gap-3">
                                <p className={`${summaryPrimaryValueClass} ${requiredActionCount > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-green-600 dark:text-green-400'}`}>
                                    {requiredActionCount}
                                </p>
                                <p className="pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                    {requiredActionCount === 1 ? 'pendência operacional' : 'pendências operacionais'}
                                </p>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <p className={summaryMetaLabelClass}>Vencem Hoje</p>
                                    <p className={summaryMetaValueClass}>{maturingTodayInvestments.length}</p>
                                </div>
                                <div>
                                    <p className={summaryMetaLabelClass}>Próximos 30 Dias</p>
                                    <p className={summaryMetaValueClass}>{upcomingMaturityInvestments.length}</p>
                                </div>
                                <div>
                                    <p className={summaryMetaLabelClass}>Resgates Pendentes</p>
                                    <p className={summaryMetaValueClass}>{pendingRedemptionInvestments.length}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card p-6 mb-8">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className={sectionTitleClass}>Estados Patrimoniais</h3>
                                    <InfoPopover
                                        tooltipId="summary-operational-states"
                                        title="Estados Patrimoniais"
                                        description="Separa o que ainda está investido, o que já venceu e está em liquidação, o que virou caixa disponível após marcação de resgate e o resultado já realizado."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                    />
                                </div>
                                <p className={sectionDescriptionClass}>
                                    Visual único do fluxo da carteira sem misturar posição ativa, vencimento pendente, caixa disponível e histórico de resgates.
                                </p>
                            </div>
                            <span className="w-fit text-[11px] font-bold px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                Caixa derivado do histórico de resgates
                            </span>
                        </div>

                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="min-w-0 rounded-xl border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/40 p-4">
                                <div className="flex items-center gap-2">
                                    <p className={summaryMetaLabelClass}>Posições Ativas</p>
                                    <InfoPopover
                                        tooltipId="summary-active-positions"
                                        title="Posições Ativas"
                                        description="Valor bruto atualmente investido na carteira operacional, considerando apenas ativos ainda em custódia."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                    />
                                </div>
                                <p className={`${summaryMetaValueClass} mt-2`}>{formatCurrency(displayActiveCurrentValue)}</p>
                                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    {activePortfolioInvestments.length} {activePortfolioInvestments.length === 1 ? 'ativo em carteira' : 'ativos em carteira'}
                                </p>
                            </div>
                            <div className="min-w-0 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-4">
                                <div className="flex items-center gap-2">
                                    <p className={summaryMetaLabelClass}>Em Liquidação</p>
                                    <InfoPopover
                                        tooltipId="summary-settlement"
                                        title="Em Liquidação"
                                        description="Valores líquidos de ativos vencidos que já saíram da carteira ativa, mas ainda aguardam a confirmação final do resgate."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                    />
                                </div>
                                <p className={`${summaryMetaValueClass} mt-2`}>{formatCurrency(displayPendingRedemptionValue)}</p>
                                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    {pendingRedemptionInvestments.length} {pendingRedemptionInvestments.length === 1 ? 'resgate pendente' : 'resgates pendentes'}
                                </p>
                            </div>
                            <div className="min-w-0 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/10 p-4">
                                <div className="flex items-center gap-2">
                                    <p className={summaryMetaLabelClass}>Caixa Disponível</p>
                                    <InfoPopover
                                        tooltipId="summary-cash-available"
                                        title="Caixa Disponível"
                                        description="Valor derivado dos itens já marcados como resgatados. Enquanto não houver conciliação bancária automática, esse caixa é operacional e segue o histórico de resgates."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                    />
                                </div>
                                <p className={`${summaryMetaValueClass} mt-2`}>{formatCurrency(displayCashAvailableValue)}</p>
                                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    {redeemedHistoryInvestments.length} {redeemedHistoryInvestments.length === 1 ? 'resgate disponível' : 'resgates disponíveis'}
                                </p>
                            </div>
                            <div className="min-w-0 rounded-xl border border-green-100 dark:border-green-900/40 bg-green-50/70 dark:bg-green-900/10 p-4">
                                <div className="flex items-center gap-2">
                                    <p className={summaryMetaLabelClass}>Resultado Realizado</p>
                                    <InfoPopover
                                        tooltipId="summary-realized-result"
                                        title="Resultado Realizado"
                                        description="Lucro ou prejuízo já consolidado dos ativos marcados como resgatados e enviados para o histórico operacional."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                    />
                                </div>
                                <p className={`${summaryMetaValueClass} mt-2 ${getSignedClass(totalRedeemedHistoryResult, 'text-green-700 dark:text-green-300', 'text-red-600 dark:text-red-400', 'text-gray-700 dark:text-gray-200')}`}>
                                    {formatCurrency(totalRedeemedHistoryResult)}
                                </p>
                                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    Resultado consolidado dos itens já marcados como resgatados no histórico operacional.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <div className="flex flex-col">
                            <h2 className={`${sectionTitleClass} mb-4`}>Evolução da Carteira Ativa</h2>
                            <div className="card p-6 flex-1">
                                <Suspense fallback={<div className="min-h-[360px] flex items-center justify-center"><Loader size="lg" text="Carregando gráfico..." /></div>}>
                                    <LazyYieldEvolutionChart
                                        investmentId="portfolio"
                                        amountInvested={totalInvested}
                                    />
                                </Suspense>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <h2 className={`${sectionTitleClass} mb-4`}>Ativos na Carteira Ativa</h2>
                            <div className="card p-6 flex-1">
                                <Suspense fallback={<div className="min-h-[360px] flex items-center justify-center"><Loader size="lg" text="Carregando composição..." /></div>}>
                                    <LazyAssetAllocationChart investments={activePortfolioInvestments} />
                                </Suspense>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <h2 className={`${sectionTitleClass} tracking-tight`}>Posição Ativa</h2>
                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={filterClass}
                                onChange={(e) => setFilterClass(e.target.value)}
                                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs font-bold px-3 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-600 dark:text-gray-300 transition-shadow"
                            >
                                <option value="ALL">Todas as Classes</option>
                                <option value="RENDA_FIXA">Renda Fixa</option>
                                <option value="TESOURO">Tesouro Direto</option>
                                <option value="FUNDOS">Fundos</option>
                                <option value="ACOES">Ações</option>
                                <option value="FII">FIIs</option>
                            </select>

                            <select
                                value={filterIndexer}
                                onChange={(e) => setFilterIndexer(e.target.value)}
                                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs font-bold px-3 py-2 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-600 dark:text-gray-300 transition-shadow"
                            >
                                <option value="ALL">Todos os Índices</option>
                                <option value="CDI">CDI</option>
                                <option value="SELIC">SELIC</option>
                                <option value="IPCA">IPCA</option>
                                <option value="PREFIXADO">Pré-fixado</option>
                            </select>

                            {!showForm && (
                                <button onClick={() => { setEditingInvestment(null); setShowForm(true); }} className="btn-primary flex items-center whitespace-nowrap">
                                    <Activity className="w-4 h-4 mr-2" />
                                    Adicionar Ativo
                                </button>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-900/50">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-sm">Falha ao Comunicar com o Servidor</h4>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {redemptionError && (
                        <div className="mb-6 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-900/50">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-sm">Falha ao Atualizar o Resgate</h4>
                                <p className="text-sm mt-1">{redemptionError}</p>
                            </div>
                        </div>
                    )}

                    {(filteredPendingRedemptionInvestments.length > 0 || filteredRedeemedHistoryInvestments.length > 0) && (
                        <div className="mb-8 space-y-4">
                            {filteredPendingRedemptionInvestments.length > 0 && (
                                <div className="card overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-red-50/60 dark:bg-red-900/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                        <div>
                                            <h2 className={sectionTitleClass}>Resgates Pendentes</h2>
                                            <p className={sectionDescriptionClass}>
                                                Os ativos vencidos ficam fora da carteira ativa até você marcar o resgate. A home mostra só um resumo e uma prévia curta da lista.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-right">
                                            <div>
                                                <p className={sectionStatLabelClass}>Pendentes Filtrados</p>
                                                <p className={sectionStatValueClass}>{filteredPendingRedemptionInvestments.length}</p>
                                            </div>
                                            <div>
                                                <p className={sectionStatLabelClass}>Valor Líquido Pendente</p>
                                                <p className={sectionStatValueClass}>{formatCurrency(filteredPendingRedemptionValue)}</p>
                                            </div>
                                            <div>
                                                <p className={sectionStatLabelClass}>Resultado Pendente</p>
                                                <p className={`font-bold ${getSignedClass(filteredPendingRedemptionResult, 'text-amber-600 dark:text-amber-300', 'text-red-600 dark:text-red-400', 'text-gray-700 dark:text-gray-200')}`}>
                                                    {formatCurrency(filteredPendingRedemptionResult)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {showPendingRedemptions
                                                ? `Exibindo ${visiblePendingRedemptionInvestments.length} de ${filteredPendingRedemptionInvestments.length} pendentes filtrados.`
                                                : 'A lista detalhada fica recolhida por padrão para não poluir a home.'}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowPendingRedemptions((current) => !current)}
                                                className="px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500 transition-colors"
                                            >
                                                {showPendingRedemptions ? 'Ocultar Pendentes' : `Ver Pendentes (${filteredPendingRedemptionInvestments.length})`}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRedeemSelection(filteredPendingRedemptionInvestments.map((investment) => investment.investmentId))}
                                                disabled={redeemingIds.length > 0}
                                                className="px-3 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {redeemingIds.length > 0 ? 'Processando...' : 'Marcar Filtrados Como Resgatados'}
                                            </button>
                                        </div>
                                    </div>

                                    {showPendingRedemptions && (
                                        <div className="scroll-area scrollbar-modern scrollbar-modern-inset overflow-x-auto border-t border-gray-100 dark:border-gray-800">
                                            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                                <thead className="bg-white dark:bg-gray-900">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Ativo</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Vencimento</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Principal</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Valor Líquido</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Resultado Pendente</th>
                                                        <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 tracking-wide">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {visiblePendingRedemptionInvestments.map((investment) => {
                                                        const pendingValue = getPendingRedemptionValue(investment);
                                                        const pendingResult = pendingValue - investment.amountInvested;
                                                        const isRedeemingCurrentInvestment = redeemingIds.includes(investment.investmentId);

                                                        return (
                                                            <tr
                                                                key={`pending-${investment.investmentId}`}
                                                                onClick={() => setSelectedInvestment(investment)}
                                                                className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                                                            >
                                                                <td className="px-6 py-4">
                                                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{investment.productName}</p>
                                                                    <p className="text-xs text-gray-400">{investment.issuer}</p>
                                                                </td>
                                                                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                    {formatDatePtBr(investment.maturityDate)}
                                                                </td>
                                                                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                    {formatCurrency(investment.amountInvested)}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatCurrency(pendingValue)}</p>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <p className={`text-sm font-bold ${getSignedClass(pendingResult, 'text-amber-600 dark:text-amber-300', 'text-red-600 dark:text-red-400', 'text-gray-600 dark:text-gray-300')}`}>
                                                                        {formatCurrency(pendingResult)}
                                                                    </p>
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleRedeemSelection([investment.investmentId]);
                                                                        }}
                                                                        disabled={redeemingIds.length > 0}
                                                                        className="px-3 py-2 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                                                    >
                                                                        {isRedeemingCurrentInvestment ? 'Processando...' : 'Marcar Como Resgatado'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                            {renderPaginationControls({
                                                page: currentPendingRedemptionsPage,
                                                totalPages: pendingRedemptionTotalPages,
                                                totalItems: filteredPendingRedemptionInvestments.length,
                                                visibleItems: visiblePendingRedemptionInvestments.length,
                                                itemLabel: 'pendentes',
                                                onPageChange: setPendingRedemptionsPage,
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {filteredRedeemedHistoryInvestments.length > 0 && (
                                <div className="card overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/30 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                        <div>
                                            <h2 className={sectionTitleClass}>Histórico de Resgates</h2>
                                            <p className={sectionDescriptionClass}>
                                                Os itens marcados como resgatados saem da home operacional e ficam aqui como referência rápida.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-right">
                                            <div>
                                                <p className={sectionStatLabelClass}>Itens no Histórico</p>
                                                <p className={sectionStatValueClass}>{filteredRedeemedHistoryInvestments.length}</p>
                                            </div>
                                            <div>
                                                <p className={sectionStatLabelClass}>Valor Resgatado</p>
                                                <p className={sectionStatValueClass}>{formatCurrency(filteredRedeemedHistoryValue)}</p>
                                            </div>
                                            <div>
                                                <p className={sectionStatLabelClass}>Resultado Realizado</p>
                                                <p className={`font-bold ${getSignedClass(filteredRedeemedHistoryResult, 'text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400', 'text-gray-700 dark:text-gray-200')}`}>
                                                    {formatCurrency(filteredRedeemedHistoryResult)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {showRedeemedHistory
                                                ? `Exibindo ${visibleRedeemedHistoryInvestments.length} de ${filteredRedeemedHistoryInvestments.length} resgates.`
                                                : 'Histórico recolhido por padrão para manter a home mais limpa.'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setShowRedeemedHistory((current) => !current)}
                                            className="px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-500 transition-colors"
                                        >
                                                {showRedeemedHistory ? 'Ocultar Histórico' : `Ver Histórico (${filteredRedeemedHistoryInvestments.length})`}
                                        </button>
                                    </div>

                                    {showRedeemedHistory && (
                                        <div className="scroll-area scrollbar-modern scrollbar-modern-inset overflow-x-auto border-t border-gray-100 dark:border-gray-800">
                                            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                                <thead className="bg-white dark:bg-gray-900">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Ativo</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Vencimento</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Resgatado em</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Principal</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 tracking-wide">Valor resgatado</th>
                                                        <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 tracking-wide">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {visibleRedeemedHistoryInvestments.map((investment) => (
                                                        <tr
                                                            key={`redeemed-${investment.investmentId}`}
                                                            onClick={() => setSelectedInvestment(investment)}
                                                            className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                                                        >
                                                            <td className="px-6 py-4">
                                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{investment.productName}</p>
                                                                <p className="text-xs text-gray-400">{investment.issuer}</p>
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                {formatDatePtBr(investment.maturityDate)}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                {formatDatePtBr(investment.redeemedAt)}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                {formatCurrency(investment.amountInvested)}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm font-bold text-gray-800 dark:text-gray-200">
                                                                {formatCurrency(getRedeemedValue(investment))}
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setInvestmentToDelete(investment);
                                                                    }}
                                                                    aria-label={`Excluir ${investment.productName} do histórico`}
                                                                    className="px-3 py-2 text-xs font-bold rounded-lg border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                >
                                                                    Excluir
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {renderPaginationControls({
                                                page: currentRedeemedHistoryPage,
                                                totalPages: redeemedHistoryTotalPages,
                                                totalItems: filteredRedeemedHistoryInvestments.length,
                                                visibleItems: visibleRedeemedHistoryInvestments.length,
                                                itemLabel: 'resgates',
                                                onPageChange: setRedeemedHistoryPage,
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Form Modal */}
                    {showForm && (
                        <div className="fixed inset-0 z-50 bg-black/60 transition-opacity animate-in fade-in duration-300 sm:flex sm:items-center sm:justify-center sm:p-4">
                            <div
                                ref={formModalRef}
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="investment-form-title"
                                className="card relative flex h-full w-full flex-col overflow-hidden rounded-none border-0 bg-white p-0 shadow-xl animate-fade-in-up dark:bg-gray-900 sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-[28px] sm:border sm:border-gray-100 dark:sm:border-gray-800"
                            >
                                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6">
                                    <h3 id="investment-form-title" className="text-xl font-bold dark:text-white">
                                        {editingInvestment ? 'Editar Investimento' : 'Novo Investimento'}
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={closeFormModal}
                                        aria-label="Fechar formulário de investimento"
                                        className="icon-action-button"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                                <div className="scroll-area scroll-area-contained scrollbar-modern scrollbar-modern-inset flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
                                    <Suspense fallback={<div className="py-16"><Loader size="lg" text="Carregando formulário..." /></div>}>
                                        <LazyInvestmentForm
                                            initialData={editingInvestment}
                                            onSuccess={handleFormSuccess}
                                            onCancel={closeFormModal}
                                        />
                                    </Suspense>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Portfólio Estruturado */}
                    <div className="space-y-4">
                        {loading ? (
                            <div className="card p-16 flex justify-center items-center">
                                <Loader size="lg" text="Mapeando ativos..." />
                            </div>
                        ) : orderedGroupedInvestments.length === 0 ? (
                            <div className="card p-12 text-center">
                                <p className="text-gray-500 dark:text-gray-400 mb-4">
                                    {activePortfolioInvestments.length === 0
                                        ? 'Ainda não há ativos registrados para análise.'
                                        : 'Nenhum ativo da carteira ativa corresponde aos filtros atuais.'}
                                </p>
                                {!showForm && (
                                    <button onClick={() => setShowForm(true)} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                                        Clique aqui para iniciar sua carteira
                                    </button>
                                )}
                            </div>
                        ) : (
                            orderedGroupedInvestments.map(([type, items]) => {
                                const metrics = getGroupMetrics(items);
                                const isExpanded = expandedGroups[type] ?? true;
                                const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                                const page = Math.min(groupPagination[type] || 1, totalPages);
                                const pageStartIndex = (page - 1) * ITEMS_PER_PAGE;
                                const pagedItems = items.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
                                const displayGroupLabel = getDisplayGroupLabel(type);
                                const pageWindowStart = Math.max(1, page - 1);
                                const pageWindowEnd = Math.min(totalPages, pageWindowStart + 2);
                                const visiblePageNumbers = Array.from(
                                    { length: pageWindowEnd - pageWindowStart + 1 },
                                    (_, index) => pageWindowStart + index
                                );
                                const isDraggedGroup = draggedGroupKey === type;
                                const isAnyGroupDragging = draggedGroupKey !== null;
                                const isDropTarget = dragOverGroupKey === type && isAnyGroupDragging && draggedGroupKey !== type;
                                const dropHintLabel = dragOverPosition === 'before' ? 'Inserir acima' : 'Inserir abaixo';

                                return (
                                    <div
                                        key={type}
                                        onDragOver={(event) => handleGroupDragOver(event, type)}
                                        onDrop={(event) => handleGroupDrop(event, type)}
                                        onDragEnd={resetGroupDragState}
                                        className={`card group relative overflow-hidden border border-transparent transition-[transform,opacity,box-shadow,border-color,background-color] duration-300 ${
                                            isDraggedGroup
                                                ? 'scale-[0.985] opacity-55 shadow-none ring-1 ring-blue-300/30'
                                                : ''
                                        } ${
                                            isDropTarget
                                                ? 'border-blue-300/70 ring-2 ring-blue-400/80 bg-blue-500/[0.03] shadow-[0_0_0_1px_rgba(96,165,250,0.28),0_24px_48px_-28px_rgba(59,130,246,0.78)]'
                                                : ''
                                        } ${
                                            isAnyGroupDragging && !isDraggedGroup && !isDropTarget
                                                ? 'opacity-90'
                                                : ''
                                        }`}
                                    >
                                        {isDropTarget && (
                                            <>
                                                <div
                                                    className={`pointer-events-none absolute inset-x-4 z-0 h-16 rounded-2xl ${
                                                        dragOverPosition === 'before'
                                                            ? 'top-0 bg-gradient-to-b from-blue-500/[0.14] via-blue-500/[0.05] to-transparent'
                                                            : 'bottom-0 bg-gradient-to-t from-blue-500/[0.14] via-blue-500/[0.05] to-transparent'
                                                    }`}
                                                />
                                                <div
                                                    className={`pointer-events-none absolute left-6 right-6 z-10 h-1.5 rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500 shadow-[0_0_0_1px_rgba(96,165,250,0.45),0_0_18px_rgba(59,130,246,0.4)] ${
                                                        dragOverPosition === 'before' ? 'top-2' : 'bottom-2'
                                                    }`}
                                                />
                                                <div
                                                    className={`pointer-events-none absolute left-6 z-10 flex items-center gap-2 ${
                                                        dragOverPosition === 'before' ? 'top-2 -translate-y-1/2' : 'bottom-2 translate-y-1/2'
                                                    }`}
                                                >
                                                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.35)] dark:border-gray-900" />
                                                    <span className="rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700 shadow-[0_10px_25px_-18px_rgba(59,130,246,0.7)] backdrop-blur dark:border-blue-900/50 dark:bg-gray-900/95 dark:text-blue-300">
                                                        {dropHintLabel}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                        {isAnyGroupDragging && !isDraggedGroup && (
                                            <div
                                                className={`pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200 ${
                                                    isDropTarget ? 'bg-blue-500/[0.05] opacity-100' : 'bg-transparent opacity-0'
                                                }`}
                                            />
                                        )}
                                        <div
                                            className={`px-6 py-4 flex items-center justify-between cursor-pointer transition-colors bg-gray-50/50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800 ${
                                                isDropTarget
                                                    ? 'bg-blue-50/70 dark:bg-blue-950/25'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                            }`}
                                            onClick={() => toggleGroup(type)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2 rounded-lg shadow-sm transition-all ${
                                                    isDropTarget
                                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shadow-[0_12px_24px_-20px_rgba(59,130,246,0.9)]'
                                                        : isDraggedGroup
                                                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                                                            : 'bg-white dark:bg-gray-800'
                                                }`}>
                                                    <PieChart className="w-5 h-5 text-blue-600" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-800 dark:text-gray-100">Custódia: {displayGroupLabel}</h3>
                                                    <p className="text-xs text-gray-400 font-medium">{items.length} {items.length === 1 ? 'ativo' : 'ativos'}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 md:gap-8">
                                                <div className="hidden md:block text-right">
                                                    <p className={sectionStatLabelClass}>Total Alocado</p>
                                                    <p className={sectionStatValueClass}>{formatCurrency(metrics.current)}</p>
                                                </div>
                                                <div className="hidden md:flex flex-col items-end">
                                                    <p className={sectionStatLabelClass}>% Portfólio</p>
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                                        {metrics.allocation.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    draggable
                                                    onClick={(event) => event.stopPropagation()}
                                                    onDragStart={(event) => handleGroupDragStart(event, type)}
                                                    onDragEnd={resetGroupDragState}
                                                    aria-label={`Reordenar custódia ${displayGroupLabel}`}
                                                    title="Arrastar para reordenar"
                                                    className={`icon-action-button hidden h-10 w-10 md:inline-flex ${
                                                        isDraggedGroup ? 'cursor-grabbing' : 'cursor-grab'
                                                    } ${
                                                        isDraggedGroup
                                                            ? 'border border-blue-300 bg-blue-100 text-blue-700 shadow-[0_14px_24px_-18px_rgba(59,130,246,0.9)] dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                                            : isDropTarget
                                                                ? 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/30 dark:text-blue-300'
                                                                : isAnyGroupDragging
                                                                    ? 'border border-blue-100/70 bg-blue-50/60 text-blue-600 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-300'
                                                                    : ''
                                                    }`}
                                                >
                                                    <GripVertical className="h-4 w-4" />
                                                </button>
                                                <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className={`transition-all ${isExpanded ? 'max-h-[2000px] opacity-100 pb-6' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                                            <div className="space-y-3 px-4 pt-4 md:hidden">
                                                {pagedItems.map((inv) => {
                                                    const benchmarkDescriptor = getBenchmarkDescriptor(inv);
                                                    const opportunityBadge = getOpportunityBadge(inv.investmentId);
                                                    const maturityBadge = getMaturityBadge(inv);
                                                    const currentBookValue = getCurrentBookValue(inv);
                                                    const allocationPct = ((currentBookValue / (totalCurrentValue || 1)) * 100).toFixed(1);

                                                    return (
                                                        <article
                                                            key={`${inv.investmentId}-mobile`}
                                                            className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedInvestment(inv)}
                                                                className="w-full text-left"
                                                                aria-label={`Abrir detalhes de ${inv.productName}`}
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-bold text-gray-900 dark:text-white">{inv.productName}</p>
                                                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{inv.issuer}</p>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-2">
                                                                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                                                            {allocationPct}% da carteira
                                                                        </span>
                                                                        {maturityBadge && (
                                                                            <span className={`inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-bold ${maturityBadge.className}`}>
                                                                                {maturityBadge.label}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {opportunityBadge && (
                                                                    <span className={`mt-3 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${opportunityBadge.className}`}>
                                                                        {opportunityBadge.label}
                                                                    </span>
                                                                )}

                                                                <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                                                                    <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Aplicação</p>
                                                                        <p className="mt-1 text-xs font-semibold text-gray-800 dark:text-gray-200">{formatDatePtBr(inv.applicationDate)}</p>
                                                                    </div>
                                                                    <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Vencimento</p>
                                                                        <p className="mt-1 text-xs font-semibold text-gray-800 dark:text-gray-200">{formatDatePtBr(inv.maturityDate)}</p>
                                                                    </div>
                                                                    <div className="rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Rentabilidade</p>
                                                                        <p className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">{formatInvestmentRate(inv)}</p>
                                                                        {benchmarkDescriptor && (
                                                                            <p className="mt-1 text-[10px] text-blue-700/80 dark:text-blue-300/80">
                                                                                {benchmarkDescriptor.comparator}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className="rounded-xl bg-green-50 px-3 py-2 dark:bg-green-900/20">
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">Saldo Bruto</p>
                                                                        <p className="mt-1 text-sm font-bold text-green-700 dark:text-green-300">{formatCurrency(currentBookValue)}</p>
                                                                        {(inv as any).grossReturnPct !== undefined && (
                                                                            <p className={`mt-1 text-[10px] font-bold ${(inv as any).grossReturnPct >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
                                                                                {((inv as any).grossReturnPct * 100).toFixed(1)}% rend.
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="mt-3 grid grid-cols-2 gap-3 text-left">
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Principal</p>
                                                                        <p className="mt-1 text-xs font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(inv.amountInvested)}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Benchmark</p>
                                                                        <p className="mt-1 text-xs font-semibold text-gray-800 dark:text-gray-200">
                                                                            {benchmarkDescriptor ? benchmarkDescriptor.benchmark.replace('Benchmark: ', '') : 'Sem comparação'}
                                                                        </p>
                                                                        {typeof inv.excessReturnPct === 'number' && (
                                                                            <p className={`mt-1 text-[10px] font-bold ${getSignedClass(inv.excessReturnPct, 'text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400', 'text-gray-500 dark:text-gray-400')}`}>
                                                                                {formatPercentagePoints(inv.excessReturnPct)} {getBenchmarkExcessLabel(inv)}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </button>

                                                            <div className="mt-4 flex gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingInvestment(inv);
                                                                        setShowForm(true);
                                                                    }}
                                                                    className="btn-secondary flex-1"
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setInvestmentToDelete(inv)}
                                                                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                                                                >
                                                                    Excluir
                                                                </button>
                                                            </div>
                                                        </article>
                                                    );
                                                })}
                                            </div>

                                            <div className="scroll-area scrollbar-modern scrollbar-modern-inset hidden overflow-x-auto border-t border-gray-100 dark:border-gray-800 md:block">
                                                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                                <thead className="bg-white dark:bg-gray-900">
                                                    <tr>
                                                        {renderSortHeader('Ativo', 'productName')}
                                                        {renderSortHeader('Aplicação', 'applicationDate')}
                                                        {renderSortHeader('Vencimento', 'maturityDate')}
                                                        {renderSortHeader('Rentabilidade', 'rate')}
                                                        {renderSortHeader('Principal', 'amountInvested')}
                                                        {renderSortHeader('Saldo Bruto', 'currentValue')}
                                                        {renderSortHeader('% Alocada', 'allocation')}
                                                        <th className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 tracking-wide">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {pagedItems.map((inv) => {
                                                        const benchmarkDescriptor = getBenchmarkDescriptor(inv);
                                                        const opportunityBadge = getOpportunityBadge(inv.investmentId);
                                                        const maturityBadge = getMaturityBadge(inv);

                                                        return (
                                                        <tr
                                                            key={inv.investmentId}
                                                            onClick={() => setSelectedInvestment(inv)}
                                                            className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                                                        >
                                                            <td className="px-6 py-4">
                                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{inv.productName}</p>
                                                                <p className="text-xs text-gray-400">{inv.issuer}</p>
                                                                {opportunityBadge && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            navigate(`/oportunidades#opportunity-${inv.investmentId}`);
                                                                        }}
                                                                        className={`mt-2 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold transition-colors ${opportunityBadge.className}`}
                                                                    >
                                                                        {opportunityBadge.label}
                                                                    </button>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                {formatDatePtBr(inv.applicationDate)}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                <div className="flex flex-col gap-1">
                                                                    <span>{formatDatePtBr(inv.maturityDate)}</span>
                                                                    {maturityBadge && (
                                                                        <span className={`inline-flex w-fit text-[10px] font-bold px-2 py-0.5 rounded-full ${maturityBadge.className}`}>
                                                                            {maturityBadge.label}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                                                    {formatInvestmentRate(inv)}
                                                                </span>
                                                                {(benchmarkDescriptor || typeof inv.excessReturnPct === 'number') && (
                                                                    <div className="mt-1 flex flex-col gap-0.5">
                                                                        {benchmarkDescriptor && (
                                                                            <>
                                                                                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                                                                    {benchmarkDescriptor.benchmark}
                                                                                </span>
                                                                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                                                    {benchmarkDescriptor.comparator}
                                                                                </span>
                                                                            </>
                                                                        )}
                                                                        {typeof inv.excessReturnPct === 'number' && (
                                                                            <span className={`text-[10px] font-bold ${getSignedClass(inv.excessReturnPct, 'text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400', 'text-gray-500 dark:text-gray-400')}`}>
                                                                                {formatPercentagePoints(inv.excessReturnPct)} {getBenchmarkExcessLabel(inv)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                                {formatCurrency(inv.amountInvested)}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                                                    {formatCurrency(getCurrentBookValue(inv))}
                                                                </p>
                                                                {(inv as any).grossReturnPct !== undefined && (
                                                                    <p className={`text-[10px] font-bold ${(inv as any).grossReturnPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                        {((inv as any).grossReturnPct * 100).toFixed(1)}% rend.
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <p className="text-xs font-bold text-gray-500">
                                                                    {((getCurrentBookValue(inv) / (totalCurrentValue || 1)) * 100).toFixed(1)}%
                                                                </p>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <div className="flex justify-center gap-3">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingInvestment(inv);
                                                                            setShowForm(true);
                                                                        }}
                                                                        aria-label={`Editar ${inv.productName}`}
                                                                        className="icon-action-button"
                                                                    >
                                                                        <Pencil size={16} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setInvestmentToDelete(inv);
                                                                        }}
                                                                        aria-label={`Excluir ${inv.productName}`}
                                                                        className="icon-action-button-danger"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                </table>
                                            </div>

                                            {totalPages > 1 && (
                                                <div className="mt-6 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        Página {page} de {totalPages} - exibindo {pagedItems.length} de {items.length} ativos
                                                    </p>
                                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setGroupPagination(prev => ({ ...prev, [type]: Math.max(1, page - 1) }));
                                                            }}
                                                            disabled={page === 1}
                                                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
                                                        >
                                                            <ChevronLeft size={14} />
                                                            Anterior
                                                        </button>

                                                        {pageWindowStart > 1 && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setGroupPagination(prev => ({ ...prev, [type]: 1 }));
                                                                    }}
                                                                    className="h-9 w-9 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 transition-colors hover:border-blue-500 dark:border-gray-700 dark:text-gray-200"
                                                                >
                                                                    1
                                                                </button>
                                                                {pageWindowStart > 2 && (
                                                                    <span className="px-1 text-xs text-gray-400">...</span>
                                                                )}
                                                            </>
                                                        )}

                                                        {visiblePageNumbers.map((pageNumber) => (
                                                            <button
                                                                key={`${type}-page-${pageNumber}`}
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setGroupPagination(prev => ({ ...prev, [type]: pageNumber }));
                                                                }}
                                                                aria-label={`Página ${pageNumber} de ${totalPages}`}
                                                                className={`h-9 w-9 rounded-xl border text-xs font-bold transition-colors ${
                                                                    pageNumber === page
                                                                        ? 'bg-blue-600 border-blue-600 text-white'
                                                                        : 'border-gray-200 text-gray-700 hover:border-blue-500 dark:border-gray-700 dark:text-gray-200'
                                                                }`}
                                                            >
                                                                {pageNumber}
                                                            </button>
                                                        ))}

                                                        {pageWindowEnd < totalPages && (
                                                            <>
                                                                {pageWindowEnd < totalPages - 1 && (
                                                                    <span className="px-1 text-xs text-gray-400">...</span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setGroupPagination(prev => ({ ...prev, [type]: totalPages }));
                                                                    }}
                                                                    className="h-9 w-9 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 transition-colors hover:border-blue-500 dark:border-gray-700 dark:text-gray-200"
                                                                >
                                                                    {totalPages}
                                                                </button>
                                                            </>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setGroupPagination(prev => ({ ...prev, [type]: Math.min(totalPages, page + 1) }));
                                                            }}
                                                            disabled={page === totalPages}
                                                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
                                                        >
                                                            Próxima
                                                            <ChevronRight size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
            </AppShell>

            {/* Details Modal */}
            {selectedInvestment && (
                <div className="fixed inset-0 z-50 bg-black/60 transition-opacity animate-in fade-in duration-300 sm:flex sm:items-center sm:justify-center sm:p-4">
                    <div
                        ref={detailsModalRef}
                        className="card relative flex h-full w-full flex-col overflow-hidden rounded-none border-0 bg-white p-0 shadow-xl animate-fade-in-up dark:bg-gray-900 sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:max-w-2xl sm:rounded-[30px] sm:border sm:border-gray-100 dark:sm:border-gray-800"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="investment-details-title"
                    >
                        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6">
                            <div className="min-w-0">
                                <h3 id="investment-details-title" className="text-xl font-bold text-gray-900 dark:text-white">{selectedInvestment.productName}</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedInvestment.issuer} • {selectedInvestment.type}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedInvestment(null)}
                                aria-label="Fechar detalhes do investimento"
                                className="icon-action-button shrink-0"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="scroll-area scroll-area-contained scrollbar-modern scrollbar-modern-inset flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
                        <div className="space-y-4">
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                <span className="text-gray-600 dark:text-gray-400">Valor Investido</span>
                                <span className="font-semibold">{formatCurrency(selectedInvestment.amountInvested)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                                    Valor Atual Antes do IR
                                    <InfoPopover
                                        tooltipId="investment-current-gross"
                                        title="Valor Atual Antes do IR"
                                        description="Mostra quanto o investimento vale hoje antes de descontar imposto. Serve para enxergar o valor bruto da posição."
                                        activeTooltip={activeTooltip}
                                        onToggle={setActiveTooltip}
                                    />
                                </span>
                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    {formatCurrency(selectedInvestment.currentValue || selectedInvestment.amountInvested)}
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                <span className="text-gray-600 dark:text-gray-400">Rendimento Bruto</span>
                                <span className={`font-semibold ${getSignedClass((selectedInvestment as any).grossReturn || 0)}`}>
                                    {formatCurrency((selectedInvestment as any).grossReturn || 0)}
                                    <span className="text-xs ml-1">({(((selectedInvestment as any).grossReturnPct || 0) * 100).toFixed(2)}%)</span>
                                </span>
                            </div>

                            {(selectedInvestment as any).taxAmount !== undefined && (
                                <>
                                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                                        <div className="flex flex-col">
                                            <span className="text-gray-600 dark:text-gray-400">Imposto de Renda (IR)</span>
                                            <span className="text-[10px] text-gray-400 italic">
                                                {((selectedInvestment as any).taxRate * 100).toFixed(1)}% na faixa ({Math.floor((selectedInvestment as any).daysElapsed || 0)} dias)
                                            </span>
                                        </div>
                                        <span className="font-semibold text-red-500">
                                            -{formatCurrency((selectedInvestment as any).taxAmount)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between pt-2">
                                        <span className="flex items-center gap-1 font-bold text-gray-800 dark:text-gray-200">
                                            Valor Atual Líquido
                                            <InfoPopover
                                                tooltipId="investment-current-net"
                                                title="Valor Atual Líquido"
                                                description="Mostra quanto você receberia hoje depois do desconto de imposto, quando aplicável."
                                                activeTooltip={activeTooltip}
                                                onToggle={setActiveTooltip}
                                            />
                                        </span>
                                        <span className={`font-bold text-xl ${getSignedClass(((selectedInvestment as any).netValue || selectedInvestment.amountInvested) - selectedInvestment.amountInvested, 'text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400', 'text-blue-600 dark:text-blue-400')}`}>
                                            {formatCurrency((selectedInvestment as any).netValue || selectedInvestment.amountInvested)}
                                        </span>
                                    </div>

                                    {selectedInvestmentIsPastMaturity ? (
                                        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
                                            <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-3">Status de Vencimento</h4>
                                            <div className="space-y-2">
                                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                                    {selectedInvestmentStatus === 'MATURES_TODAY' ? 'Este investimento vence hoje.' : 'Este investimento já venceu e aguarda tratativa.'}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    Data de vencimento: {formatDatePtBr(selectedInvestment.maturityDate)}
                                                </div>
                                                <div className={`text-lg font-bold ${getSignedClass(((selectedInvestment as any).maturityNetValue || selectedInvestment.amountInvested) - selectedInvestment.amountInvested, 'text-green-700 dark:text-green-300', 'text-red-600 dark:text-red-400', 'text-blue-600 dark:text-blue-400')}`}>
                                                    {formatCurrency((selectedInvestment as any).maturityNetValue || selectedInvestment.amountInvested)}
                                                </div>
                                                <div className="text-[10px] text-amber-700 dark:text-amber-300 font-bold">
                                                    Valor no Vencimento (Líquido)
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                            <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-3">Simulação Futura</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="bg-white/50 dark:bg-gray-800/50 p-2 rounded-lg">
                                                    <div className="text-[10px] text-gray-500">Ganho no Próximo Mês</div>
                                                    <div className={`font-bold ${getSignedClass((selectedInvestment as any).monthlyProjection || 0)}`}>{formatCurrency((selectedInvestment as any).monthlyProjection || 0)}</div>
                                                </div>
                                                <div className="bg-white/50 dark:bg-gray-800/50 p-2 rounded-lg">
                                                    <div className="text-[10px] text-gray-500">Ganho no Próximo Ano</div>
                                                    <div className={`font-bold ${getSignedClass((selectedInvestment as any).yearlyProjection || 0)}`}>{formatCurrency((selectedInvestment as any).yearlyProjection || 0)}</div>
                                                </div>
                                                {selectedInvestment.maturityDate && (
                                                    <div className="sm:col-span-2 bg-green-600/10 p-3 rounded-lg border border-green-200 dark:border-green-800/50">
                                                        <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-bold">
                                                            Se Mantiver Até o Vencimento
                                                            <InfoPopover
                                                                tooltipId="investment-hold-to-maturity"
                                                                title="Se Mantiver Até o Vencimento"
                                                                description="Estimativa do valor líquido caso o investimento seja mantido até a data final, considerando a regra de imposto válida no vencimento."
                                                                activeTooltip={activeTooltip}
                                                                onToggle={setActiveTooltip}
                                                            />
                                                        </div>
                                                        <div className={`text-lg font-bold ${getSignedClass(((selectedInvestment as any).maturityNetValue || selectedInvestment.amountInvested) - selectedInvestment.amountInvested, 'text-green-700 dark:text-green-300', 'text-red-600 dark:text-red-400', 'text-blue-600 dark:text-blue-400')}`}>
                                                            {formatCurrency((selectedInvestment as any).maturityNetValue || selectedInvestment.amountInvested)}
                                                        </div>
                                                        <div className="flex justify-between items-center mt-1 text-[10px] text-green-600/70 dark:text-green-400/70 italic">
                                                            <span>Vencimento: {formatDatePtBr(selectedInvestment.maturityDate)}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {selectedInvestmentComparisonSummary && (
                            <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800/50">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-1">
                                                <h4 className="text-xs font-bold text-violet-700 dark:text-violet-300">
                                                    Seu Investimento vs {getComparisonBenchmarkName(selectedInvestment)}
                                                </h4>
                                                <InfoPopover
                                                    tooltipId="investment-comparison-header"
                                                    title={`Seu Investimento vs ${getComparisonBenchmarkName(selectedInvestment)}`}
                                                    description="Compara o rendimento deste investimento com o índice de referência no mesmo período para mostrar se ele ficou acima ou abaixo da base usada pelo mercado."
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                />
                                            </div>
                                            <p className="mt-1 text-[10px] text-violet-700/80 dark:text-violet-300/80">
                                                {getChartPeriodLabel(selectedInvestmentComparisonSummary.period)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <p className="text-[10px] font-semibold tracking-wide text-gray-500 dark:text-gray-400">
                                                    Comparação justa: {normalizeBenchmarkComparatorLabel(selectedInvestment.benchmarkComparatorLabel)}
                                                </p>
                                                <InfoPopover
                                                    tooltipId="investment-comparison-method"
                                                    title={normalizeBenchmarkComparatorLabel(selectedInvestment.benchmarkComparatorLabel)}
                                                    description={getComparatorDescription(selectedInvestment)}
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                    align="left"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {formatDatePtBr(selectedInvestmentComparisonSummary.startDate)} até {formatDatePtBr(selectedInvestmentComparisonSummary.endDate)}
                                            </p>
                                        </div>
                                    </div>

                                    <p className="rounded-lg bg-white/50 px-3 py-2 text-xs leading-relaxed text-violet-900/85 dark:bg-gray-800/40 dark:text-violet-100/90">
                                        {getComparisonSummarySentence(selectedInvestment, selectedInvestmentComparisonSummary)}
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="bg-white/60 dark:bg-gray-800/50 rounded-lg p-3">
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Seu Investimento</div>
                                            <div className={`mt-1 text-lg font-bold ${getSignedClass(selectedInvestmentComparisonSummary.portfolioReturnPct)}`}>
                                                {formatPercentValue(selectedInvestmentComparisonSummary.portfolioReturnPct)}
                                            </div>
                                        </div>
                                        <div className="bg-white/60 dark:bg-gray-800/50 rounded-lg p-3">
                                            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                {getComparisonBenchmarkName(selectedInvestment)}
                                                <InfoPopover
                                                    tooltipId="investment-comparison-benchmark"
                                                    title={getComparisonBenchmarkName(selectedInvestment)}
                                                    description={selectedInvestment.benchmarkLabel === 'CDI'
                                                        ? 'Taxa de referência usada em muitos investimentos de renda fixa no Brasil.'
                                                        : selectedInvestment.benchmarkLabel === 'SELIC'
                                                            ? 'Taxa básica de juros da economia brasileira, usada como referência para investimentos pós-fixados ligados à SELIC.'
                                                            : 'Índice de inflação usado como referência para investimentos atrelados ao IPCA.'}
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                    align="left"
                                                />
                                            </div>
                                            <div className={`mt-1 text-lg font-bold ${getSignedClass(selectedInvestmentComparisonSummary.benchmarkReturnPct || 0, 'text-blue-600 dark:text-blue-400', 'text-blue-600 dark:text-blue-400', 'text-blue-600 dark:text-blue-400')}`}>
                                                {formatPercentValue(selectedInvestmentComparisonSummary.benchmarkReturnPct || 0)}
                                            </div>
                                        </div>
                                        <div className="bg-white/60 dark:bg-gray-800/50 rounded-lg p-3">
                                            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                {getRelativeComparisonLabel(getComparisonBenchmarkName(selectedInvestment), selectedInvestmentComparisonSummary.excessReturnPct || 0)}
                                                <InfoPopover
                                                    tooltipId="investment-comparison-gap"
                                                    title={getRelativeComparisonLabel(getComparisonBenchmarkName(selectedInvestment), selectedInvestmentComparisonSummary.excessReturnPct || 0)}
                                                    description={`Diferença, em pontos percentuais, entre o rendimento do seu investimento e o ${getComparisonBenchmarkName(selectedInvestment)} no mesmo período.`}
                                                    activeTooltip={activeTooltip}
                                                    onToggle={setActiveTooltip}
                                                    align="left"
                                                />
                                            </div>
                                            <div className={`mt-1 text-lg font-bold ${getSignedClass(selectedInvestmentComparisonSummary.excessReturnPct || 0)}`}>
                                                {formatPercentagePoints(selectedInvestmentComparisonSummary.excessReturnPct || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <Suspense fallback={<div className="py-12"><Loader size="lg" text="Carregando gráfico..." /></div>}>
                            <LazyYieldEvolutionChart
                                investmentId={selectedInvestment.investmentId}
                                amountInvested={selectedInvestment.amountInvested}
                                showAssetTypeFilter={false}
                                compact
                                onPeriodSummaryChange={setSelectedInvestmentPeriodSummary}
                            />
                        </Suspense>
                        </div>

                        <div className="shrink-0 border-t border-gray-100 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6">
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={handleExportHistory}
                                    disabled={isExportingHistory}
                                    className="btn-secondary flex-1 justify-center py-2"
                                >
                                    <ArrowDown size={14} className="mr-2" />
                                    {isExportingHistory ? 'Exportando...' : 'Exportar Histórico'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedInvestment(null)}
                                    className="btn-primary flex-1 py-2"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {investmentToDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] transition-opacity animate-in fade-in duration-300">
                    <div className="card p-6 w-full max-w-sm shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-bold mb-2">Excluir investimento?</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">Esta ação não pode ser desfeita. Deseja realmente remover <strong>{investmentToDelete.productName}</strong>?</p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setInvestmentToDelete(null)} className="btn-secondary flex-1">Cancelar</button>
                            <button
                                type="button"
                                onClick={handleDeleteInvestment}
                                disabled={deletingInvestmentId === investmentToDelete.investmentId}
                                className="btn-primary bg-red-600 hover:bg-red-700 border-red-600 text-white flex-1"
                            >
                                {deletingInvestmentId === investmentToDelete.investmentId ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ToastStack toasts={toasts} onDismiss={dismissToast} />
        </>
    );
}




