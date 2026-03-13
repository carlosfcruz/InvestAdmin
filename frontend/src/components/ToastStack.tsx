import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type ToastTone = 'success' | 'error';

export interface ToastItem {
    id: number;
    title: string;
    description?: string;
    tone: ToastTone;
}

interface ToastStackProps {
    toasts: ToastItem[];
    onDismiss: (toastId: number) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
    if (toasts.length === 0) {
        return null;
    }

    return (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
            {toasts.map((toast) => {
                const Icon = toast.tone === 'success' ? CheckCircle2 : AlertCircle;

                return (
                    <div
                        key={toast.id}
                        role="status"
                        className={`toast-card ${toast.tone === 'success' ? 'toast-card-success' : 'toast-card-error'}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`${toast.tone === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{toast.title}</p>
                                {toast.description && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{toast.description}</p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => onDismiss(toast.id)}
                                className="icon-action-button h-9 w-9"
                                aria-label="Fechar aviso"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
