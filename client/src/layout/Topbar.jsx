import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, Menu, Search, Boxes, User as UserIcon, Wrench, CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge } from '../components/ui';
import { ROLES, ASSET_STATUS } from '../utils/constants';
import { fmtAgo } from '../utils/format';

/* ---------- Global search ---------- */
function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const debounce = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        boxRef.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const onChange = (value) => {
    setQuery(value);
    clearTimeout(debounce.current);
    if (value.trim().length < 2) { setResults(null); return; }
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.get('/search', { params: { q: value } });
        setResults(res.data.data);
        setOpen(true);
      } catch { /* search is best-effort */ }
    }, 300);
  };

  const go = (path) => { setOpen(false); setQuery(''); setResults(null); navigate(path); };
  const hasResults = results && (results.assets.length || results.users.length || results.maintenance.length);

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder="Search assets, people, requests…"
        className="input pl-9 pr-12 bg-slate-50 border-slate-200"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">
        ⌘K
      </kbd>
      <AnimatePresence>
        {open && results && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-900/10"
          >
            {!hasResults && <p className="px-3 py-6 text-center text-sm text-slate-400">No matches for “{query}”</p>}
            {results.assets.length > 0 && (
              <div className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Assets</p>
                {results.assets.map((a) => (
                  <button key={a.id} onClick={() => go(`/assets/${a.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                    <Boxes size={15} className="text-slate-400 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{a.name}
                      <span className="ml-2 text-xs text-slate-400">{a.assetTag}</span>
                    </span>
                    <Badge meta={ASSET_STATUS[a.status]} withDot={false} />
                  </button>
                ))}
              </div>
            )}
            {results.users.length > 0 && (
              <div className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">People</p>
                {results.users.map((u) => (
                  <button key={u.id} onClick={() => go('/employees')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                    <Avatar name={u.fullName} color={u.avatarColor} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{u.fullName}
                      <span className="ml-2 text-xs text-slate-400">{u.departmentName ?? ''}</span>
                    </span>
                    <Badge meta={ROLES[u.role]} withDot={false} />
                  </button>
                ))}
              </div>
            )}
            {results.maintenance.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Maintenance</p>
                {results.maintenance.map((m) => (
                  <button key={m.id} onClick={() => go('/maintenance')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                    <Wrench size={15} className="text-slate-400 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{m.title}
                      <span className="ml-2 text-xs text-slate-400">{m.assetName}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Notifications ---------- */
const NOTIF_ICONS = { ASSIGNMENT: '📦', RETURN: '↩️', TRANSFER: '🔁', MAINTENANCE: '🔧', BOOKING: '📅', AUDIT: '📋', OVERDUE: '⚠️', SYSTEM: '🔔' };

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await api.get('/notifications');
      setItems(res.data.data);
      setUnread(res.data.unreadCount);
    } catch { /* polling is best-effort */ }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => { clearInterval(interval); document.removeEventListener('mousedown', onClick); };
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.isRead) {
      api.patch(`/notifications/${n.id}/read`).then(load).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    load();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell size={19} />
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              {unread > 0 && (
                <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="py-10 text-center text-sm text-slate-400">You're all caught up 🎉</p>}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 ${!n.isRead ? 'bg-indigo-50/40' : ''}`}
                >
                  <span className="text-lg leading-none mt-0.5">{NOTIF_ICONS[n.type] ?? '🔔'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${!n.isRead ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}`}>{n.title}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{fmtAgo(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500 line-clamp-2">{n.message}</span>
                  </span>
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- User menu ---------- */
function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-slate-100">
        <Avatar name={user?.fullName} color={user?.avatarColor} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight text-slate-800">{user?.fullName}</span>
          <span className="block text-[11px] leading-tight text-slate-500">{ROLES[user?.role]?.label}</span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-900/10"
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
              <p className="mt-1 text-[11px] text-slate-400">{user?.employeeCode} · {user?.departmentName ?? 'No department'}</p>
            </div>
            <button
              onClick={() => { setOpen(false); navigate('/my-assets'); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              <UserIcon size={15} /> My assets & requests
            </button>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut size={15} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Topbar({ onMenu }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
        <Menu size={20} />
      </button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        <NotificationsBell />
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <UserMenu />
      </div>
    </header>
  );
}
