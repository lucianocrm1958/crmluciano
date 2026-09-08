import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ChevronLeft, ChevronRight, MapPin, Video, LayoutList, CalendarDays, Ban } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppointmentForm from "../components/AppointmentForm";
import UnavailabilityForm from "../components/UnavailabilityForm";
import { startOfWeek, addDays, toISODate, WEEKDAY_LABELS, formatDayLabel, formatWeekRangeLabel } from "../lib/dateUtils";

const STATUS_LABELS = {
  programmato: "Programmato",
  svolto: "Svolto",
  da_rifissare: "Da rifissare",
  non_effettuato: "Non effettuato",
};

const STATUS_COLORS = {
  programmato: "bg-navy-50 text-navy-600",
  svolto: "bg-emerald-50 text-emerald-600",
  da_rifissare: "bg-amber-50 text-amber-600",
  non_effettuato: "bg-rose-50 text-rose-600",
};

export default function Appuntamenti() {
  const [view, setView] = useState("settimana");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [newAppointmentDate, setNewAppointmentDate] = useState(null);

  const [blocks, setBlocks] = useState([]);
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  const [newBlockDate, setNewBlockDate] = useState(null);

  async function loadAppointments() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, mode, address, status, outcome_notes, contact_id, operator_id, contacts(first_name, last_name, company, phone), operators(initials)"
      )
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare gli appuntamenti.");
    } else {
      setAppointments(data || []);
    }
    setLoading(false);
  }

  async function loadBlocks() {
    const { data, error: err } = await supabase
      .from("unavailability_blocks")
      .select("id, block_date, start_time, end_time, reason")
      .order("block_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (err) {
      console.error(err);
    } else {
      setBlocks(data || []);
    }
  }

  useEffect(() => {
    loadAppointments();
    loadBlocks();
  }, []);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  function appointmentsForDay(day) {
    const iso = toISODate(day);
    return appointments.filter((a) => a.appointment_date === iso);
  }

  function blocksForDay(day) {
    const iso = toISODate(day);
    return blocks.filter((b) => b.block_date === iso);
  }

  const filteredList = useMemo(() => {
    if (!statusFilter) return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

  function openNew(presetDate) {
    setEditingAppointment(null);
    setNewAppointmentDate(presetDate || null);
    setFormOpen(true);
  }

  function openEdit(appt) {
    setEditingAppointment(appt);
    setFormOpen(true);
  }

  function openNewBlock(presetDate) {
    setEditingBlock(null);
    setNewBlockDate(presetDate || null);
    setBlockFormOpen(true);
  }

  function openEditBlock(block) {
    setEditingBlock(block);
    setBlockFormOpen(true);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Appuntamenti</h1>
          <p className="text-sm text-slate-500">{appointments.length} appuntamenti registrati</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setView("settimana")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                view === "settimana" ? "bg-white shadow-sm text-navy-700" : "text-slate-500"
              }`}
            >
              <CalendarDays size={14} /> Settimana
            </button>
            <button
              onClick={() => setView("lista")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${
                view === "lista" ? "bg-white shadow-sm text-navy-700" : "text-slate-500"
              }`}
            >
              <LayoutList size={14} /> Lista
            </button>
          </div>
          <button
            onClick={() => openNewBlock(null)}
            className="flex items-center gap-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Ban size={16} /> Blocca fascia oraria
          </button>
          <button
            onClick={() => openNew(null)}
            className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Plus size={16} /> Nuovo appuntamento
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={18} /> Caricamento...
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : view === "settimana" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium text-slate-600">{formatWeekRangeLabel(weekStart)}</p>
            <button
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {weekDays.map((day, i) => {
              const dayAppointments = appointmentsForDay(day);
              const dayBlocks = blocksForDay(day);
              const isToday = toISODate(day) === toISODate(new Date());
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-xl p-2 min-h-[160px] ${
                    isToday ? "border-navy-400" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-xs font-semibold ${isToday ? "text-navy-600" : "text-slate-500"}`}>
                      {WEEKDAY_LABELS[i]} {formatDayLabel(day)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openNewBlock(toISODate(day))}
                        className="text-slate-300 hover:text-rose-500 text-xs"
                        title="Blocca fascia oraria"
                      >
                        <Ban size={13} />
                      </button>
                      <button
                        onClick={() => openNew(toISODate(day))}
                        className="text-slate-300 hover:text-navy-500 text-xs"
                        title="Nuovo appuntamento"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {dayBlocks.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => openEditBlock(b)}
                        className="w-full text-left rounded-md px-2 py-1.5 text-xs bg-rose-50 text-rose-600 border border-dashed border-rose-200"
                      >
                        <p className="font-medium flex items-center gap-1">
                          <Ban size={11} />
                          {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                        </p>
                        {b.reason && <p className="truncate">{b.reason}</p>}
                      </button>
                    ))}
                    {dayAppointments.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => openEdit(a)}
                        className={`w-full text-left rounded-md px-2 py-1.5 text-xs ${STATUS_COLORS[a.status]}`}
                      >
                        <p className="font-medium flex items-center justify-between">
                          <span>{a.appointment_time?.slice(0, 5)}</span>
                          {a.operators?.initials && (
                            <span className="text-[9px] bg-white/60 rounded px-1">{a.operators.initials}</span>
                          )}
                        </p>
                        <p className="truncate">
                          {a.contacts?.first_name} {a.contacts?.last_name || ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <select className="input max-w-[200px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="programmato">Programmato</option>
            <option value="svolto">Svolto</option>
            <option value="da_rifissare">Da rifissare</option>
            <option value="non_effettuato">Non effettuato</option>
          </select>

          {filteredList.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
              Nessun appuntamento trovato.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {filteredList.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openEdit(a)}
                  className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-navy-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center w-14">
                      <p className="text-sm font-semibold text-navy-700">
                        {new Date(a.appointment_date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                      </p>
                      <p className="text-xs text-slate-400">{a.appointment_time?.slice(0, 5)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {a.contacts?.first_name} {a.contacts?.last_name || ""}
                        {a.contacts?.company ? ` · ${a.contacts.company}` : ""}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        {a.mode === "online" ? <Video size={11} /> : <MapPin size={11} />}
                        {a.mode === "online" ? "Online" : a.address || "In presenza"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.operators?.initials && (
                      <span className="w-6 h-6 rounded-full bg-navy-50 text-navy-600 text-[10px] font-bold flex items-center justify-center">
                        {a.operators.initials}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <AppointmentForm
          appointment={editingAppointment}
          initialDate={newAppointmentDate}
          onClose={() => setFormOpen(false)}
          onSaved={loadAppointments}
          onDeleted={loadAppointments}
        />
      )}

      {blockFormOpen && (
        <UnavailabilityForm
          block={editingBlock}
          initialDate={newBlockDate}
          onClose={() => setBlockFormOpen(false)}
          onSaved={loadBlocks}
          onDeleted={loadBlocks}
        />
      )}
    </div>
  );
}

