import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
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
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
}

export function CustomSelect({ options, value, onChange, label, placeholder, className, ariaLabel }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}

            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "input-field flex items-center justify-between transition-all duration-200",
                    isOpen && "ring-2 ring-blue-500 border-blue-500"
                )}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className={cn("block truncate", !selectedOption && "text-gray-400")}>
                    {selectedOption ? selectedOption.label : placeholder || "Selecione..."}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <ul
                    className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl py-1 overflow-auto max-h-60 focus:outline-none animate-in fade-in zoom-in-95 duration-100"
                    role="listbox"
                >
                    {options.map((option) => (
                        <li
                            key={option.value}
                            className={cn(
                                "relative cursor-pointer select-none py-2.5 pl-10 pr-4 text-sm transition-colors",
                                option.value === value
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold"
                                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            )}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            role="option"
                            aria-selected={option.value === value}
                        >
                            <span className="block truncate">{option.label}</span>
                            {option.value === value && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600 dark:text-blue-400">
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
