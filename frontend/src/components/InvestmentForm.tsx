import { useState, useEffect } from 'react';
import { useInvestments } from '../hooks/useInvestments';
import type { Investment } from '../hooks/useInvestments';
import { CustomSelect } from './CustomSelect';
import { Loader } from '../components/Loader';
import { getDefaultIndexerForType, getModalityOptionsForType, getRateFieldConfig, isIndexerAllowedForType } from '../features/investments/productRules';

export function InvestmentForm({ onSuccess, onCancel, initialData }: { onSuccess: () => void, onCancel: () => void, initialData?: Investment | null }) {
    const { addInvestment, updateInvestment } = useInvestments();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const today = new Date().toISOString().split('T')[0] || '';

    const [formData, setFormData] = useState({
        type: 'CDB',
        indexer: 'CDI',
        issuer: '',
        productName: '',
        rate: '',
        applicationDate: today,
        maturityDate: '',
        amountInvested: '',
        liquidity: 'D+0',
        cnpj: '',
        quantity: '',
        purchaseQuoteValue: '',
    });

    useEffect(() => {
        if (initialData) {
            const sanitizedIndexer = initialData.type === 'FUNDO' || isIndexerAllowedForType(initialData.type, initialData.indexer)
                ? initialData.indexer
                : getDefaultIndexerForType(initialData.type);
            setFormData({
                type: initialData.type,
                indexer: sanitizedIndexer,
                issuer: initialData.issuer,
                productName: initialData.productName,
                rate: Number(initialData.rate).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false }),
                applicationDate: initialData.applicationDate.split('T')[0],
                maturityDate: initialData.maturityDate ? initialData.maturityDate.split('T')[0] : '',
                amountInvested: Math.round(initialData.amountInvested * 100).toString(),
                liquidity: initialData.liquidity || 'D+0',
                cnpj: initialData.cnpj || '',
                quantity: initialData.quantity?.toString() || '',
                purchaseQuoteValue: initialData.purchaseQuoteValue?.toString() || '',
            });
        }
    }, [initialData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        setFormData({ ...formData, amountInvested: rawValue });
    };

    const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^\d.,]/g, '');
        setFormData({ ...formData, rate: value });
    };

    const displayAmount = formData.amountInvested
        ? (Number(formData.amountInvested) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '';

    const modalityOptions = getModalityOptionsForType(formData.type as Investment['type']);
    const rateFieldConfig = getRateFieldConfig(formData.indexer as Investment['indexer']);

    const handleTypeChange = (value: string) => {
        const nextType = value as Investment['type'];
        const nextIndexer = nextType === 'FUNDO'
            ? formData.indexer
            : isIndexerAllowedForType(nextType, formData.indexer)
                ? formData.indexer
                : getDefaultIndexerForType(nextType);

        setFormData((current) => ({
            ...current,
            type: nextType,
            indexer: nextIndexer,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const numRate = formData.type === 'FUNDO' ? 0 : Number(formData.rate.replace(',', '.'));
            const isFund = formData.type === 'FUNDO';

            let numAmount = 0;
            if (isFund) {
                const qty = Number(formData.quantity);
                const purchaseQuote = Number(formData.purchaseQuoteValue);
                numAmount = qty * purchaseQuote;
            } else {
                numAmount = Number(formData.amountInvested) / 100;
            }

            if (numAmount <= 0) {
                setError('O valor investido deve ser maior que zero.');
                setLoading(false);
                return;
            }

            if (!isFund && numRate <= 0) {
                setError('A taxa de rentabilidade deve ser maior que zero.');
                setLoading(false);
                return;
            }

            if (!isFund) {
                if (formData.indexer === 'PREFIXADO' && numRate > 40) {
                    setError('Para prefixado, informe uma taxa anual de até 40% a.a.');
                    setLoading(false);
                    return;
                }

                if ((formData.indexer === 'CDI' || formData.indexer === 'SELIC') && numRate > 300) {
                    setError('Para CDI/SELIC, informe um percentual do indexador de até 300%.');
                    setLoading(false);
                    return;
                }

                if (formData.indexer === 'IPCA' && numRate > 30) {
                    setError('Para IPCA+, informe um spread anual de até 30%.');
                    setLoading(false);
                    return;
                }
            }

            if (formData.applicationDate) {
                const appYear = parseInt(formData.applicationDate.split('-')[0] || '', 10);
                if (appYear < 1900 || appYear > 2100) {
                    setError('O ano da data de aplicação é inválido.');
                    setLoading(false);
                    return;
                }

                if (formData.applicationDate > today) {
                    setError('A data de aplicação não pode estar no futuro.');
                    setLoading(false);
                    return;
                }
            }

            if (formData.maturityDate) {
                const appStr = formData.applicationDate;
                const matStr = formData.maturityDate;
                if (matStr <= appStr) {
                    setError('A data de vencimento deve ser posterior à data de aplicação.');
                    setLoading(false);
                    return;
                }
            }

            const dataToSubmit = {
                ...formData,
                rate: numRate,
                amountInvested: numAmount,
                maturityDate: formData.maturityDate || null,
                type: formData.type as any,
                indexer: (isFund ? 'PREFIXADO' : formData.indexer) as any,
                quantity: isFund ? Number(formData.quantity) : undefined,
                purchaseQuoteValue: isFund ? Number(formData.purchaseQuoteValue) : undefined,
                cnpj: isFund ? formData.cnpj : undefined,
            };

            if (initialData) {
                await updateInvestment(initialData.investmentId, dataToSubmit);
            } else {
                await addInvestment(dataToSubmit);
            }
            onSuccess();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card p-6">
            {error && <div className="mb-4 bg-red-50 text-red-500 p-3 rounded-md text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CustomSelect
                        label="Tipo"
                        options={[
                            { value: 'CDB', label: 'CDB' },
                            { value: 'TESOURO', label: 'Tesouro Direto' },
                            { value: 'LCI', label: 'LCI' },
                            { value: 'LCA', label: 'LCA' },
                            { value: 'FUNDO', label: 'Fundo de Investimento' },
                        ]}
                        value={formData.type}
                        onChange={handleTypeChange}
                    />

                    {formData.type !== 'FUNDO' && (
                        <CustomSelect
                            label="Modalidade"
                            options={modalityOptions}
                            value={formData.indexer}
                            onChange={(val) => setFormData({ ...formData, indexer: val })}
                        />
                    )}

                    {formData.type === 'FUNDO' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CNPJ do Fundo</label>
                            <input type="text" name="cnpj" required value={formData.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" className="input-field" />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emissor</label>
                        <input type="text" name="issuer" required value={formData.issuer} onChange={handleChange} placeholder="Ex: Banco Inter" className="input-field" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Produto / Nome do Fundo</label>
                        <input type="text" name="productName" required value={formData.productName} onChange={handleChange} placeholder="Ex: Alaska Black FIC FIA" className="input-field" />
                    </div>

                    {formData.type !== 'FUNDO' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{rateFieldConfig.label}</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    required
                                    name="rate"
                                    value={formData.rate}
                                    onChange={handleRateChange}
                                    placeholder={rateFieldConfig.placeholder}
                                    className="input-field pr-10"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cotas Adquiridas</label>
                            <input type="number" step="any" name="quantity" required value={formData.quantity} onChange={handleChange} placeholder="0.000000" className="input-field" />
                        </div>
                    )}

                    {formData.type !== 'FUNDO' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Investido (R$)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                                <input
                                    type="text"
                                    required
                                    name="amountInvested"
                                    value={displayAmount}
                                    onChange={handleAmountChange}
                                    placeholder="0,00"
                                    className="input-field pl-10"
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor da Cota na Compra</label>
                            <input type="number" step="any" name="purchaseQuoteValue" required value={formData.purchaseQuoteValue} onChange={handleChange} placeholder="1.23456" className="input-field" />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de Aplicação</label>
                        <input type="date" required name="applicationDate" value={formData.applicationDate} onChange={handleChange} max={today} className="input-field" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vencimento (Opcional)</label>
                        <input type="date" name="maturityDate" value={formData.maturityDate} onChange={handleChange} className="input-field" />
                    </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={onCancel} className="btn-secondary">
                        Cancelar
                    </button>
                    <button type="submit" disabled={loading} className={`btn-primary ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}>
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader size="sm" className="text-white dark:text-white" />
                                Salvando...
                            </span>
                        ) : (
                            'Salvar Investimento'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}


