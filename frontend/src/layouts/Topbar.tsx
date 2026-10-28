import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';
import { Icon } from '../components/Icon';
import { findNavigationItem } from '../config/navigation';
import { formatToday } from '../lib/format';

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const current = findNavigationItem(location.pathname, user?.role);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenSidebar}
        >
          <Icon name="menu" />
        </button>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Barangay 2 BMIS
          </p>
          <h1 className="truncate text-base font-semibold text-slate-900">
            {current?.label ?? 'Workspace'}
          </h1>
        </div>

        <div className="ml-auto hidden text-right sm:block">
          <p className="text-xs font-medium text-slate-500">
            {formatToday()}
          </p>
          <p className="text-xs text-slate-400">
            {user ? ROLE_LABELS[user.role] : ''}
          </p>
        </div>
      </div>
    </header>
  );
}
