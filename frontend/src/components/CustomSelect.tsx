import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    id?: string;
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
    describedBy?: string;
    required?: boolean;
}

export function CustomSelect({
    id,
    options,
    value,
    onChange,
    label,
    placeholder,
    className,
    ariaLabel,
    describedBy,
    required = false,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const reactId = useId();

    const baseId = id || `custom-select-${reactId}`;
    const labelId = `${baseId}-label`;
    const valueId = `${baseId}-value`;
    const listboxId = `${baseId}-listbox`;
    const selectedOption = options.find((option) => option.value === value);
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

    const openMenuAndFocus = (index = selectedIndex) => {
        setIsOpen(true);
        requestAnimationFrame(() => {
            optionRefs.current[index]?.focus();
        });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenuAndFocus(selectedIndex);
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen((current) => !current);
            return;
        }

        if (event.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            optionRefs.current[(index + 1) % options.length]?.focus();
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            optionRefs.current[(index - 1 + options.length) % options.length]?.focus();
            return;
        }

        if (event.key === 'Home') {
            event.preventDefault();
            optionRefs.current[0]?.focus();
            return;
        }

        if (event.key === 'End') {
            event.preventDefault();
            optionRefs.current[options.length - 1]?.focus();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
            triggerRef.current?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onChange(options[index]?.value || value);
            setIsOpen(false);
            triggerRef.current?.focus();
        }
    };

    return (
        <div className={cn('relative w-full', className)} ref={containerRef}>
            {label && (
                <label id={labelId} className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span>{label}</span>
                    {required && (
                        <>
                            <span aria-hidden="true" className="text-red-500">*</span>
                            <span className="sr-only">(obrigatório)</span>
                        </>
                    )}
                </label>
            )}

            <button
                ref={triggerRef}
                id={baseId}
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                onKeyDown={handleTriggerKeyDown}
                className={cn(
                    'input-field mt-0 flex min-h-[52px] items-center justify-between transition-all duration-200',
                    isOpen && 'border-blue-500 ring-2 ring-blue-500'
                )}
                aria-label={label ? undefined : ariaLabel}
                aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
                aria-describedby={describedBy}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-expanded={isOpen}
                aria-required={required}
            >
                <span id={valueId} className={cn('block truncate', !selectedOption && 'text-gray-400')}>
                    {selectedOption ? selectedOption.label : placeholder || 'Selecione...'}
                </span>
                <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform duration-200', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
                <ul
                    id={listboxId}
                    className="scroll-area scroll-area-contained scrollbar-modern scrollbar-modern-inset absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-2xl border border-gray-200 bg-white py-1 shadow-xl focus:outline-none animate-in fade-in zoom-in-95 duration-100 dark:border-gray-700 dark:bg-gray-800"
                    role="listbox"
                    aria-labelledby={label ? labelId : undefined}
                >
                    {options.map((option, index) => (
                        <li key={option.value} role="presentation">
                            <button
                                ref={(node) => {
                                    optionRefs.current[index] = node;
                                }}
                                type="button"
                                className={cn(
                                    'relative flex w-full cursor-pointer items-center py-2.5 pl-10 pr-4 text-left text-sm transition-colors',
                                    option.value === value
                                        ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                                )}
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                    triggerRef.current?.focus();
                                }}
                                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                                role="option"
                                aria-selected={option.value === value}
                            >
                                <span className="block truncate">{option.label}</span>
                                {option.value === value && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600 dark:text-blue-400">
                                        <Check className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
