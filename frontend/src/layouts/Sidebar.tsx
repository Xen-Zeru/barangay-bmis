import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import { navigationForRole } from '../config/navigation';
import { initials } from '../lib/format';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

export function Sidebar({ open, onClose, onLogout, loggingOut }: SidebarProps) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const items = navigationForRole(user.role);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-white/10 bg-brand-950 text-brand-100 shadow-2xl transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-wide text-white">
              Barangay 2 BMIS
            </p>
            <p className="truncate text-xs text-brand-300">
              Sipalay City, Negros Occ.
            </p>
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-brand-300 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <Icon name="menu" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
            Workspace
          </p>
          <ul className="space-y-1">
            {items.map((item) =>
              (item.enabled ?? item.phase === 1) ? (
                <li key={item.key}>
                  <NavLink
                    to={item.to}
                    end
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? 'bg-white/12 text-white shadow-inner ring-1 ring-white/10'
                          : 'text-brand-200 hover:bg-white/8 hover:text-white'
                      }`
                    }
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ) : (
                <li key={item.key}>
                  <div
                    className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-400/80"
                    title={`${item.description} - planned for Phase 2`}
                    aria-disabled="true"
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300">
                      Soon
                    </span>
                  </div>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-800 text-sm font-semibold text-white ring-1 ring-white/15">
              {initials(user.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {user.fullName}
              </p>
              <p className="truncate text-xs text-brand-300">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-200 transition hover:bg-white/8 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loggingOut ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <Icon name="logout" className="h-5 w-5" />
            )}
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>
    </>
  );
}
