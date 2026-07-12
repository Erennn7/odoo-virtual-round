import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Boxes, Package, ArrowLeftRight, CalendarClock, Wrench,
  ClipboardCheck, BarChart3, ScrollText, Building2, FolderTree, Users,
  Settings2, Backpack, X, Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Navigation is role-filtered: items list the roles that may see them. */
const NAV = [
  {
    section: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/my-assets', label: 'My Assets', icon: Backpack },
    ],
  },
  {
    section: 'Asset Operations',
    items: [
      { to: '/assets', label: 'Asset Directory', icon: Boxes },
      { to: '/allocations', label: 'Allocations', icon: Package, roles: ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'] },
      { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
      { to: '/bookings', label: 'Resource Booking', icon: CalendarClock },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench },
      { to: '/audits', label: 'Audits', icon: ClipboardCheck, roles: ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'] },
    ],
  },
  {
    section: 'Insights',
    items: [
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3, roles: ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'] },
      { to: '/activity', label: 'Activity Logs', icon: ScrollText, roles: ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/employees', label: 'Employee Directory', icon: Users, roles: ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'] },
      { to: '/departments', label: 'Departments', icon: FolderTree, roles: ['ADMIN'] },
      { to: '/categories', label: 'Asset Categories', icon: Layers, roles: ['ADMIN', 'ASSET_MANAGER'] },
      { to: '/organization', label: 'Organization', icon: Building2, roles: ['ADMIN'] },
    ],
  },
];

function NavItems({ onNavigate }) {
  const { user } = useAuth();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.roles || i.roles.includes(user?.role));
        if (!items.length) return null;
        return (
          <div key={group.section}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-500/15 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={17} className={isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'} />
                        {label}
                        {isActive && (
                          <motion.span layoutId="nav-pill" className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-lg shadow-indigo-900/40">
        A
      </div>
      <div>
        <p className="text-[15px] font-bold tracking-tight text-white">AssetFlow</p>
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Enterprise ERP</p>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 lg:flex">
        <Brand />
        <NavItems />
        <p className="border-t border-white/5 px-5 py-3 text-[11px] text-slate-600">AssetFlow v1.0 · PostgreSQL on Neon</p>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 lg:hidden"
            >
              <div className="flex items-center justify-between pr-3">
                <Brand />
                <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
              <NavItems onNavigate={onClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
