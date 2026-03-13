import { useMemo, useState } from 'react';
import { AlertCircle, LogOut, MoonIcon, SlidersHorizontal, SunIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Loader } from '../components/Loader';
import { AppShell } from '../components/AppShell';
import { CustomSelect } from '../components/CustomSelect';
import { useInvestmentOpportunities } from '../hooks/useInvestmentOpportunities';
import {
    createDefaultOpportunityFilters,
    filterOpportunityItems,
    groupOpportunityItems,
    summarizeOpportunityItems,
    type OpportunityBenchmarkFilter,
    type OpportunityComparatorFilter,
    type OpportunityFilters,
    type OpportunitySeverityFilter,
    type OpportunitySortBy,
    type OpportunityTypeFilter,
} from '../features/opportunities/opportunityPageModel';
import {
    formatOpportunityPercentagePoints,
    getOpportunityCurrentRateLabel,
    getOpportunitySeverityClasses,
    getOpportunitySeverityLabel,
} from '../features/opportunities/opportunityPresentation';

const typeOptions = [
    { value: 'ALL', label: 'Todos os Tipos' },
    { value: 'CDB', label: 'CDB' },
    { value: 'LCI_LCA', label: 'LCI/LCA' },
    { value: 'TESOURO', label: 'Tesouro' },
];

const benchmarkOptions = [
    { value: 'ALL', label: 'Todos os Benchmarks' },
    { value: 'CDI', label: 'CDI' },
    { value: 'SELIC', label: 'SELIC' },
];

const comparatorOptions = [
    { value: 'ALL', label: 'Todas as Regras' },
    { value: 'MINIMUM', label: 'Régua Mínima' },
    { value: 'NET_EQUIVALENT', label: 'Equivalente Líquido' },
];

const severityOptions = [
    { value: 'ALL', label: 'Todas as Severidades' },
    { value: 'HIGH', label: 'Alta Prioridade' },
    { value: 'MEDIUM', label: 'Revisar' },
    { value: 'LOW', label: 'Monitorar' },
];

const sortOptions = [
    { value: 'WORST_GAP', label: 'Maior Gap' },
    { value: 'WORST_EXCESS', label: 'Pior Excesso' },
    { value: 'LOWEST_RATE', label: 'Menor Taxa Atual' },
    { value: 'HIGHEST_RATE', label: 'Maior Taxa Atual' },
];

function formatDatePtBr(value?: string | null) {
    if (!value) return '--';

    const datePart = value.split('T')[0] || value;
    const parts = datePart.split('-');
    if (parts.length !== 3) {
        return new Date(value).toLocaleDateString('pt-BR');
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatRateGap(value: number) {
    return `${value >= 0 ? '+' : ''}${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} p.p.`;
}

function hasActiveFilters(filters: OpportunityFilters) {
    return filters.type !== 'ALL'
        || filters.benchmark !== 'ALL'
        || filters.comparator !== 'ALL'
        || filters.severity !== 'ALL'
        || filters.sortBy !== 'WORST_GAP'
        || filters.searchTerm.trim() !== '';
}

export function Opportunities() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { opportunities, loading, error } = useInvestmentOpportunities();
    const [filters, setFilters] = useState<OpportunityFilters>(createDefaultOpportunityFilters);

    const filteredItems = useMemo(() => (
        filterOpportunityItems(opportunities?.items || [], filters)
    ), [opportunities?.items, filters]);

    const groupedItems = useMemo(() => (
        groupOpportunityItems(filteredItems, filters.sortBy)
    ), [filteredItems, filters.sortBy]);

    const filteredSummary = useMemo(() => (
        summarizeOpportunityItems(filteredItems)
    ), [filteredItems]);

    const summary = opportunities?.summary || {
        activeCount: 0,
        analyzedCount: 0,
        underperformingCount: 0,
        highSeverityCount: 0,
    };

    const showEmptyState = !loading && !error && (opportunities?.items.length || 0) === 0;
    const showFilteredEmptyState = !loading && !error && (opportunities?.items.length || 0) > 0 && filteredItems.length === 0;

    function updateFilter<K extends keyof OpportunityFilters>(key: K, value: OpportunityFilters[K]) {
        setFilters((current) => ({
            ...current,
            [key]: value,
        }));
    }

    function resetFilters() {
        setFilters(createDefaultOpportunityFilters());
    }

    return (
        <AppShell
            activePath="opportunities"
            searchTerm={filters.searchTerm}
            onSearchTermChange={(event) => updateFilter('searchTerm', event.target.value)}
            opportunityCount={summary.underperformingCount}
            rightActions={
                <>
                    <span className="text-sm font-medium dark:text-gray-200">{user?.email}</span>
                    <button
                        onClick={toggleTheme}
                        className="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full transition-colors"
                        aria-label="Alternar tema"
                    >
                        {theme === 'light' ? <MoonIcon size={20} /> : <SunIcon size={20} />}
                    </button>
                    <button onClick={logout} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Sair" aria-label="Sair">
                        <LogOut size={20} />
                    </button>
                </>
            }
        >
            <div className="space-y-6">
                <section className="card p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Oportunidades na Carteira</h2>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
                                Esta análise identifica títulos pós-fixados abaixo da régua mínima da categoria ou do equivalente líquido.
                                Nesta fase, a tela sugere faixas-alvo comparáveis, sem indicar um produto específico.
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                            <AlertCircle size={14} />
                            Regras automáticas para pós-fixados CDI e SELIC
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="card p-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Oportunidades Encontradas</p>
                        <p className="mt-2 text-3xl font-bold text-gray-100">{filteredSummary.total}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Mostrando a seleção atual</p>
                    </div>
                    <div className="card p-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Alta Prioridade</p>
                        <p className="mt-2 text-3xl font-bold text-red-400">{filteredSummary.highPriority}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Maiores gaps contra a faixa-alvo</p>
                    </div>
                    <div className="card p-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Régua Mínima</p>
                        <p className="mt-2 text-3xl font-bold text-amber-400">{filteredSummary.minimumRule}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Produtos tributados abaixo do mínimo</p>
                    </div>
                    <div className="card p-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Equivalente Líquido</p>
                        <p className="mt-2 text-3xl font-bold text-blue-400">{filteredSummary.netEquivalent}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Produtos isentos abaixo do comparável líquido</p>
                    </div>
                </section>

                <section className="card p-5">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                                <SlidersHorizontal size={16} />
                                Filtros
                            </div>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                {filteredItems.length} de {summary.underperformingCount} oportunidades exibidas • {summary.analyzedCount} ativos analisados • {summary.activeCount} ativos ativos
                            </p>
                        </div>
                        {hasActiveFilters(filters) && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:text-blue-500 transition-colors"
                            >
                                Limpar filtros
                            </button>
                        )}
                    </div>

                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        <CustomSelect
                            ariaLabel="Filtrar oportunidades por tipo"
                            options={typeOptions}
                            value={filters.type}
                            onChange={(value) => updateFilter('type', value as OpportunityTypeFilter)}
                            label="Tipo"
                        />
                        <CustomSelect
                            ariaLabel="Filtrar oportunidades por benchmark"
                            options={benchmarkOptions}
                            value={filters.benchmark}
                            onChange={(value) => updateFilter('benchmark', value as OpportunityBenchmarkFilter)}
                            label="Benchmark"
                        />
                        <CustomSelect
                            ariaLabel="Filtrar oportunidades por regra"
                            options={comparatorOptions}
                            value={filters.comparator}
                            onChange={(value) => updateFilter('comparator', value as OpportunityComparatorFilter)}
                            label="Regra"
                        />
                        <CustomSelect
                            ariaLabel="Filtrar oportunidades por severidade"
                            options={severityOptions}
                            value={filters.severity}
                            onChange={(value) => updateFilter('severity', value as OpportunitySeverityFilter)}
                            label="Severidade"
                        />
                        <CustomSelect
                            ariaLabel="Ordenar oportunidades"
                            options={sortOptions}
                            value={filters.sortBy}
                            onChange={(value) => updateFilter('sortBy', value as OpportunitySortBy)}
                            label="Ordenar por"
                        />
                    </div>
                </section>

                {loading ? (
                    <div className="card p-16 flex justify-center items-center">
                        <Loader size="lg" text="Analisando oportunidades..." />
                    </div>
                ) : error ? (
                    <div className="card p-6 border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">Falha ao carregar oportunidades</p>
                        <p className="mt-2 text-sm text-red-600/80 dark:text-red-300/80">{error}</p>
                    </div>
                ) : showEmptyState ? (
                    <div className="card p-10 text-center">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Nenhuma oportunidade pendente</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Os títulos pós-fixados elegíveis estão dentro da régua automática atual.
                        </p>
                    </div>
                ) : showFilteredEmptyState ? (
                    <div className="card p-10 text-center">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Nenhum resultado para os filtros atuais</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Ajuste os filtros ou limpe a busca para voltar à visão completa de oportunidades.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {groupedItems.map((group) => (
                            <article key={group.key} className="card p-5">
                                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                                {group.comparatorLabel}
                                            </span>
                                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                                {group.count} ativos
                                            </span>
                                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                                {group.typeLabel}
                                            </span>
                                        </div>
                                        <h3 className="mt-3 text-xl font-bold text-gray-800 dark:text-gray-100">{group.title}</h3>
                                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{group.recommendation}</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:min-w-[420px]">
                                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 p-3">
                                            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Faixa-Alvo</div>
                                            <div className="mt-1 text-base font-bold text-blue-600 dark:text-blue-400">{group.targetRateLabel}</div>
                                        </div>
                                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 p-3">
                                            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Pior Gap</div>
                                            <div className="mt-1 text-base font-bold text-red-500">{formatRateGap(group.worstGap)}</div>
                                        </div>
                                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 p-3">
                                            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Benchmark</div>
                                            <div className="mt-1 text-base font-bold text-gray-800 dark:text-gray-100">{group.benchmarkLabel}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/40 dark:bg-gray-900/30">
                                    <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                        <span>Ativo</span>
                                        <span>Taxa Atual</span>
                                        <span>Gap vs Alvo</span>
                                        <span>Excesso Atual</span>
                                        <span>Severidade</span>
                                    </div>
                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {group.items.map((item) => (
                                            <div
                                                key={item.investmentId}
                                                id={`opportunity-${item.investmentId}`}
                                                className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-4"
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{item.productName}</div>
                                                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.issuer} • {item.type}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 md:hidden">Taxa Atual</div>
                                                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{getOpportunityCurrentRateLabel(item)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 md:hidden">Gap vs Alvo</div>
                                                    <div className="mt-1 text-sm font-semibold text-red-500">{formatRateGap(item.rateGap)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 md:hidden">Excesso Atual</div>
                                                    <div className={`mt-1 text-sm font-semibold ${typeof item.excessReturnPct === 'number' && item.excessReturnPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {formatOpportunityPercentagePoints(item.excessReturnPct)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 md:hidden">Severidade</div>
                                                    <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${getOpportunitySeverityClasses(item.severity)}`}>
                                                        {getOpportunitySeverityLabel(item.severity)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                    Base: {group.benchmarkLabel} • Último índice em {formatDatePtBr(group.lastIndexDate)}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
