import type { ChangeEventHandler, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, LayoutDashboard, PieChart, Search } from 'lucide-react';

type ActivePath = 'dashboard' | 'opportunities';

interface AppShellProps {
    activePath: ActivePath;
    searchTerm: string;
    onSearchTermChange: ChangeEventHandler<HTMLInputElement>;
    opportunityCount?: number;
    rightActions?: ReactNode;
    children: ReactNode;
}

function getNavLinkClass(isActive: boolean) {
    return isActive
        ? 'flex items-center px-3 py-2 text-sm font-medium rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        : 'flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800/50 transition-colors';
}

export function AppShell({
    activePath,
    searchTerm,
    onSearchTermChange,
    opportunityCount = 0,
    rightActions,
    children,
}: AppShellProps) {
    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
            <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex-col hidden md:flex">
                <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-800">
                    <h1 className="text-xl font-bold dark:text-white flex items-center gap-2">
                        <PieChart className="h-6 w-6 text-blue-600" />
                        InvestAdmin
                    </h1>
                </div>
                <div className="px-4 py-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-wide mb-2">Menu Principal</p>
                    <nav className="space-y-1">
                        <NavLink to="/" end className={({ isActive }) => getNavLinkClass(isActive || activePath === 'dashboard')}>
                            <LayoutDashboard className="mr-3 h-5 w-5" />
                            Dashboard
                        </NavLink>
                        <NavLink to="/oportunidades" className={({ isActive }) => getNavLinkClass(isActive || activePath === 'opportunities')}>
                            <Bell className="mr-3 h-5 w-5" />
                            <span>Oportunidades</span>
                            {opportunityCount > 0 && (
                                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[11px] font-bold flex items-center justify-center">
                                    {opportunityCount}
                                </span>
                            )}
                        </NavLink>
                        <div className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-400 dark:text-gray-600 cursor-not-allowed group">
                            <PieChart className="mr-3 h-5 w-5" />
                            <span>Portfólios</span>
                            <span className="ml-auto text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Em breve</span>
                        </div>
                    </nav>
                </div>
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 z-10 transition-colors">
                    <div className="flex items-center">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar produto, emissor ou índice..."
                                value={searchTerm}
                                onChange={onSearchTermChange}
                                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-950 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-gray-200 w-80 transition-all"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        {rightActions}
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
