import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  CalendarDays,
  BellRing,
  FileSignature,
  Archive,
  Settings,
  X,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/contatti", label: "Contatti", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/appuntamenti", label: "Appuntamenti", icon: CalendarDays },
  { to: "/follow-up", label: "Follow-up", icon: BellRing },
  { to: "/contratti", label: "Contratti", icon: FileSignature },
  { to: "/archivio", label: "Archivio", icon: Archive },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-navy-700 text-navy-50 flex flex-col z-40 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-navy-600/60">
          <div>
            <p className="text-white font-bold text-lg leading-tight">
              CRM Vendite
            </p>
            <p className="text-navy-300 text-xs mt-0.5">
              Il Sole 24 Ore Professionale
            </p>
          </div>
          <button
            className="md:hidden text-navy-300 hover:text-white"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-navy-600 text-white"
                    : "text-navy-200 hover:bg-navy-600/60 hover:text-white"
                }`
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-navy-600/60 text-navy-400 text-xs">
          CRM personale · uso interno
        </div>
      </aside>
    </>
  );
}
