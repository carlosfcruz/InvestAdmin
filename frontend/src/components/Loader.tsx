import { Loader2 } from 'lucide-react';

interface LoaderProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    text?: string;
}

export function Loader({ size = 'md', className = '', text }: LoaderProps) {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    return (
        <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
            <Loader2 className={`animate-spin text-blue-600 dark:text-blue-500 ${sizeClasses[size]}`} />
            {text && <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">{text}</p>}
        </div>
    );
}
