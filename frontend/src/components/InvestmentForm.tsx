import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { useInvestments } from '../hooks/useInvestments';
import type { Investment } from '../hooks/useInvestments';
import { CustomSelect } from './CustomSelect';
import { Loader } from '../components/Loader';
import { getDefaultIndexerForType, getModalityOptionsForType, getRateFieldConfig, isIndexerAllowedForType } from '../features/investments/productRules';

interface InvestmentFormProps {
    onSuccess: () => void;
    onCancel: () => void;
    initialData?: Investment | null;
}

export function InvestmentForm({ onSuccess, onCancel, initialData }: InvestmentFormProps) {
    const { addInvestment, updateInvestment } = useInvestments();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const today = new Date().toISOString().split('T')[0] || '';
    const formId = useId();
    const helpTextId = `${formId}-help`;

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
        if (!initialData) {
            return;
        }

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
    }, [initialData]);

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
    };

    const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value.replace(/\D/g, '');
        setFormData((current) => ({ ...current, amountInvested: rawValue }));
    };

    const handleRateChange = (event: ChangeEvent<HTMLInputElement>) => {
        const sanitizedValue = event.target.value.replace(/[^\d.,]/g, '');
        setFormData((current) => ({ ...current, rate: sanitizedValue }));
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

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');

        try {
            const numRate = formData.type === 'FUNDO' ? 0 : Number(formData.rate.replace(',', '.'));
            const isFund = formData.type === 'FUNDO';

            let numAmount = 0;
            if (isFund) {
                const quantity = Number(formData.quantity);
                const purchaseQuote = Number(formData.purchaseQuoteValue);
                numAmount = quantity * purchaseQuote;
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

            if (formData.maturityDate && formData.maturityDate <= formData.applicationDate) {
                setError('A data de vencimento deve ser posterior à data de aplicação.');
                setLoading(false);
                return;
            }

            const dataToSubmit = {
                ...formData,
                rate: numRate,
                amountInvested: numAmount,
                maturityDate: formData.maturityDate || null,
                type: formData.type as Investment['type'],
                indexer: (isFund ? 'PREFIXADO' : formData.indexer) as Investment['indexer'],
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

    const panelClassName = 'card border-gray-100 bg-white/90 p-6 dark:border-gray-700 dark:bg-gray-800/90';
    const labelClassName = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300';
    const requiredMark = <span aria-hidden="true" className="ml-1 text-red-500">*</span>;

    return (
        <div className={panelClassName}>
            <div className="mb-5 flex flex-col gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {initialData ? 'Atualize os dados do ativo' : 'Preencha os dados do novo ativo'}
                </p>
                <p id={helpTextId} className="text-xs text-gray-500 dark:text-gray-400">
                    Campos marcados com * são obrigatórios. O vencimento é opcional e pode ser adicionado depois.
                </p>
            </div>

            {error && (
                <div role="alert" aria-live="polite" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <CustomSelect
                        id={`${formId}-type`}
                        label="Tipo"
                        required
                        describedBy={helpTextId}
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
                            id={`${formId}-indexer`}
                            label="Modalidade"
                            required
                            describedBy={helpTextId}
                            options={modalityOptions}
                            value={formData.indexer}
                            onChange={(nextValue) => setFormData((current) => ({ ...current, indexer: nextValue }))}
                        />
                    )}

                    {formData.type === 'FUNDO' && (
                        <div>
                            <label htmlFor={`${formId}-cnpj`} className={labelClassName}>CNPJ do Fundo{requiredMark}</label>
                            <input id={`${formId}-cnpj`} type="text" name="cnpj" required value={formData.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" className="input-field" />
                        </div>
                    )}

                    <div>
                        <label htmlFor={`${formId}-issuer`} className={labelClassName}>Emissor{requiredMark}</label>
                        <input id={`${formId}-issuer`} type="text" name="issuer" required value={formData.issuer} onChange={handleChange} placeholder="Ex: Banco Inter" className="input-field" />
                    </div>

                    <div>
                        <label htmlFor={`${formId}-product-name`} className={labelClassName}>Produto / Nome do Fundo{requiredMark}</label>
                        <input id={`${formId}-product-name`} type="text" name="productName" required value={formData.productName} onChange={handleChange} placeholder="Ex: Alaska Black FIC FIA" className="input-field" />
                    </div>

                    {formData.type !== 'FUNDO' ? (
                        <div>
                            <label htmlFor={`${formId}-rate`} className={labelClassName}>{rateFieldConfig.label}{requiredMark}</label>
                            <div className="relative">
                                <input
                                    id={`${formId}-rate`}
                                    type="text"
                                    required
                                    name="rate"
                                    value={formData.rate}
                                    onChange={handleRateChange}
                                    placeholder={rateFieldConfig.placeholder}
                                    className="input-field pr-10"
                                />
                                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label htmlFor={`${formId}-quantity`} className={labelClassName}>Cotas Adquiridas{requiredMark}</label>
                            <input id={`${formId}-quantity`} type="number" step="any" name="quantity" required value={formData.quantity} onChange={handleChange} placeholder="0.000000" className="input-field" />
                        </div>
                    )}

                    {formData.type !== 'FUNDO' ? (
                        <div>
                            <label htmlFor={`${formId}-amount-invested`} className={labelClassName}>Valor Investido (R$){requiredMark}</label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                                <input
                                    id={`${formId}-amount-invested`}
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
                            <label htmlFor={`${formId}-purchase-quote`} className={labelClassName}>Valor da Cota na Compra{requiredMark}</label>
                            <input id={`${formId}-purchase-quote`} type="number" step="any" name="purchaseQuoteValue" required value={formData.purchaseQuoteValue} onChange={handleChange} placeholder="1.23456" className="input-field" />
                        </div>
                    )}

                    <div>
                        <label htmlFor={`${formId}-application-date`} className={labelClassName}>Data de Aplicação{requiredMark}</label>
                        <input id={`${formId}-application-date`} type="date" required name="applicationDate" value={formData.applicationDate} onChange={handleChange} max={today} className="input-field" />
                    </div>

                    <div>
                        <label htmlFor={`${formId}-maturity-date`} className={labelClassName}>Vencimento (Opcional)</label>
                        <input id={`${formId}-maturity-date`} type="date" name="maturityDate" value={formData.maturityDate} onChange={handleChange} className="input-field" />
                    </div>
                </div>

                <div className="sticky bottom-0 -mx-6 mt-6 border-t border-gray-200 bg-white/95 px-6 pt-4 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button type="button" onClick={onCancel} className="btn-secondary">
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} className={`btn-primary ${loading ? 'cursor-not-allowed opacity-70' : ''}`}>
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
                </div>
            </form>
        </div>
    );
}
