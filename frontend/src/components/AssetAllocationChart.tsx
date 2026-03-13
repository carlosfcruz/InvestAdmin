import { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import type { Investment } from '../hooks/useInvestments';
import { ChevronDown, Wallet } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

interface AllocationData {
    name: string;
    originalName: string;
    value: number;
    percentage: string;
}

export function AssetAllocationChart({ investments }: { investments: Investment[] }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [filterType, setFilterType] = useState<string>('ALL');

    const getAssetTypeLabel = (id: string) => {
        const labels: Record<string, string> = {
            'ALL': 'Todos os Tipos',
            'FUNDOS': 'Fundos',
            'TESOURO': 'Tesouro Direto',
            'RENDA_FIXA': 'Renda Fixa',
            'VARIAVEL': 'Renda Variável',
            'ACOES': 'Ações',
            'FII': 'FIIs',
            'CDB': 'CDB',
            'LCI_LCA': 'LCI/LCA',
            'LCI': 'LCI',
            'LCA': 'LCA',
            'CRIPTOMOEDA': 'Cripto',
            'OUTROS': 'Outros'
        };
        return labels[id] || id;
    };

    const getDisplayGroupKey = (type: Investment['type']) => {
        return type === 'LCI' || type === 'LCA' ? 'LCI_LCA' : type.toUpperCase();
    };

    const filteredInvestments = useMemo(() => {
        if (filterType === 'ALL') return investments;

        const typeMapping: Record<string, string[]> = {
            'TESOURO': ['TESOURO', 'Tesouro direto', 'TESOURO_DIRETO'],
            'RENDA_FIXA': ['CDB', 'LCI', 'LCA', 'LC', 'DEBENTURE', 'RENDA_FIXA', 'IPCA', 'CDI', 'SELIC'],
            'VARIAVEL': ['ACAO', 'FII', 'STOCK', 'REIT', 'VARIAVEL', 'RENDA_VARIAVEL'],
            'FUNDOS': ['FUNDO', 'FUNDO_INVESTIMENTO', 'FUNDOS'],
            'OUTROS': ['CRIPTOMOEDA', 'OUTROS', 'CRIPTO_ZUMBI']
        };

        const allowedTypes = typeMapping[filterType] || [filterType];
        return investments.filter(inv =>
            allowedTypes.includes(inv.type.toUpperCase()) ||
            allowedTypes.includes(inv.type)
        );
    }, [investments, filterType]);

    const allocationData: AllocationData[] = useMemo(() => {
        const groups: Record<string, number> = {};
        let total = 0;

        filteredInvestments.forEach(inv => {
            const val = inv.currentValue || inv.amountInvested;
            const key = getDisplayGroupKey(inv.type);
            groups[key] = (groups[key] || 0) + val;
            total += val;
        });

        return Object.entries(groups).map(([name, value]) => ({
            name: getAssetTypeLabel(name),
            originalName: name,
            value,
            percentage: ((value / (total || 1)) * 100).toFixed(1) + '%'
        })).sort((a, b) => b.value - a.value);
    }, [filteredInvestments]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const tooltipBg = isDark ? '#1f2937' : '#ffffff';
    const tooltipColor = isDark ? '#f3f4f6' : '#111827';
    const tooltipBorder = isDark ? '#374151' : '#e5e7eb';

    if (investments.length === 0) return null;

    return (
        <div className="w-full h-full min-h-[350px] flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Composição da Carteira</h4>

                {/* Type Selector */}
                <div className="relative group">
                    <button className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-blue-500 transition-colors">
                        <Wallet size={14} className="text-gray-400" />
                        <span>{getAssetTypeLabel(filterType)}</span>
                        <ChevronDown size={14} className="text-gray-400" />
                    </button>
                    <div className="absolute top-full right-0 mt-2 w-44 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                        {[
                            { id: 'ALL', label: 'Todos os Tipos' },
                            { id: 'FUNDOS', label: 'Fundos' },
                            { id: 'TESOURO', label: 'Tesouro Direto' },
                            { id: 'RENDA_FIXA', label: 'Renda Fixa' },
                            { id: 'ACOES', label: 'Ações' },
                            { id: 'FII', label: 'FIIs' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setFilterType(t.id)}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row items-center justify-center">
                <div className="w-full h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={allocationData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                                animationDuration={1000}
                                animationBegin={200}
                            >
                                {allocationData.map((_entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: any, _name: any, props: any) => {
                                    const { payload } = props;
                                    return [
                                        <div key="tooltip" className="flex flex-col gap-1">
                                            <span className="text-sm font-bold">{formatCurrency(Number(value))}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{payload.percentage} da carteira</span>
                                        </div>,
                                        ''
                                    ];
                                }}
                                contentStyle={{
                                    backgroundColor: tooltipBg,
                                    borderColor: tooltipBorder,
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                    color: tooltipColor,
                                    border: `1px solid ${tooltipBorder}`,
                                    padding: '8px 12px'
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend with Percentages */}
                <div className="mt-4 lg:mt-0 lg:ml-6 w-full lg:w-1/2 space-y-2 overflow-y-auto max-h-[180px] custom-scrollbar pr-2">
                    {allocationData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 truncate">
                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate">{entry.name}</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200">{entry.percentage}</span>
                        </div>
                    ))}
                    {allocationData.length === 0 && (
                        <p className="text-xs text-gray-400 italic text-center">Nenhum ativo nesta categoria</p>
                    )}
                </div>
            </div>
        </div>
    );
}

