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

function getMobileNavLinkClass(isActive: boolean) {
    return isActive
        ? 'flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm'
        : 'flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-2xl text-gray-500 dark:text-gray-400';
}

export function AppShell({
    activePath,
    searchTerm,
    onSearchTermChange,
    opportunityCount = 0,
    rightActions,
    children,
}: AppShellProps) {
    const pageTitle = activePath === 'dashboard' ? 'Dashboard' : 'Oportunidades';

    const searchInput = (
        <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
                type="text"
                placeholder="Buscar produto, emissor ou índice..."
                value={searchTerm}
                onChange={onSearchTermChange}
                className="input-field mt-0 w-full pl-10 pr-4 text-sm"
            />
        </div>
    );

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
            <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:flex">
                <div className="flex h-16 items-center border-b border-gray-200 px-6 dark:border-gray-800">
                    <h1 className="flex items-center gap-2 text-xl font-bold dark:text-white">
                        <PieChart className="h-6 w-6 text-blue-600" />
                        InvestAdmin
                    </h1>
                </div>
                <div className="px-4 py-4">
                    <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 dark:text-gray-500">Menu Principal</p>
                    <nav className="space-y-1">
                        <NavLink to="/" end className={({ isActive }) => getNavLinkClass(isActive || activePath === 'dashboard')}>
                            <LayoutDashboard className="mr-3 h-5 w-5" />
                            Dashboard
                        </NavLink>
                        <NavLink to="/oportunidades" className={({ isActive }) => getNavLinkClass(isActive || activePath === 'opportunities')}>
                            <Bell className="mr-3 h-5 w-5" />
                            <span>Oportunidades</span>
                            {opportunityCount > 0 && (
                                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                    {opportunityCount}
                                </span>
                            )}
                        </NavLink>
                        <div className="group flex cursor-not-allowed items-center rounded-md px-3 py-2 text-sm font-medium text-gray-400 dark:text-gray-600">
                            <PieChart className="mr-3 h-5 w-5" />
                            <span>Portfólios</span>
                            <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-800">Em breve</span>
                        </div>
                    </nav>
                </div>
            </aside>

            <div className="flex flex-1 flex-col overflow-hidden">
                <header className="z-10 border-b border-gray-200 bg-white transition-colors dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
                        <div className="flex min-w-0 flex-1 items-center">
                            <div className="hidden w-full max-w-xs md:block">
                                {searchInput}
                            </div>
                            <div className="flex min-w-0 items-center gap-3 md:hidden">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                                    <PieChart className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">InvestAdmin</p>
                                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{pageTitle}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 md:gap-4">
                            {rightActions}
                        </div>
                    </div>
                    <div className="px-4 pb-4 md:hidden">
                        {searchInput}
                    </div>
                </header>

                <main className="scroll-area scrollbar-modern scrollbar-modern-inset flex-1 overflow-auto p-4 pb-24 md:p-8 md:pb-8">
                    {children}
                </main>
            </div>

            <nav className="fixed inset-x-4 bottom-4 z-20 rounded-[28px] border border-gray-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 md:hidden">
                <div className="flex items-center gap-2">
                    <NavLink to="/" end className={({ isActive }) => getMobileNavLinkClass(isActive || activePath === 'dashboard')}>
                        <LayoutDashboard className="h-5 w-5" />
                        <span className="mt-1 text-[11px] font-semibold">Dashboard</span>
                    </NavLink>
                    <NavLink to="/oportunidades" className={({ isActive }) => getMobileNavLinkClass(isActive || activePath === 'opportunities')}>
                        <div className="relative flex items-center justify-center">
                            <Bell className="h-5 w-5" />
                            {opportunityCount > 0 && (
                                <span className="absolute -right-3 -top-2 min-w-[18px] rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-gray-900">
                                    {opportunityCount}
                                </span>
                            )}
                        </div>
                        <span className="mt-1 text-[11px] font-semibold">Oportunidades</span>
                    </NavLink>
                </div>
            </nav>
        </div>
    );
}
