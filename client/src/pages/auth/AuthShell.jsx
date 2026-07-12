import { motion } from 'framer-motion';
import { Boxes, CalendarClock, ShieldCheck, BarChart3 } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Boxes, title: 'Full asset lifecycle', text: 'Register, allocate, transfer, maintain, audit and retire — with a complete history at every step.' },
  { icon: CalendarClock, title: 'Conflict-free booking', text: 'Calendar-based booking of rooms, vehicles and equipment with strict overlap protection.' },
  { icon: ShieldCheck, title: 'Role-based control', text: 'Admins, asset managers, department heads and employees each see exactly what they should.' },
  { icon: BarChart3, title: 'Live analytics', text: 'Utilization, idle assets, booking heatmaps and audit summaries — exportable in one click.' },
];

/** Shared split-screen shell for all auth pages. */
export function AuthShell({ children }) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-slate-950 p-10 lg:flex">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-lg shadow-indigo-950">
            A
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">AssetFlow</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Enterprise Asset Management</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-3xl font-bold leading-tight tracking-tight text-white"
          >
            Every asset, every booking,<br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">one source of truth.</span>
          </motion.h1>
          <div className="grid gap-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
                className="flex gap-3.5 rounded-xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <Icon size={17} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-600">© 2026 AssetFlow · Built on PostgreSQL + Neon</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
