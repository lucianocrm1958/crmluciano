import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Loader2, CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "../lib/format";

// Mostra, dentro la scheda di un contatto, lo storico di tutti i suoi appuntamenti
// passati (data, modalità, stato, esito) con le relative note, così le note prese
// durante un appuntamento restano visibili anche da Contatti, non solo da Appuntamenti.
// È di sola lettura: per modificare un appuntamento si passa dalla pagina Appuntamenti
// oppure, per telefono/email/nota generale, direttamente dal modulo dell'appuntamento.

const STATUS_LABELS = {
  programmato: "Programmato",
  svolto: "Svolto",
  da_rifissare: "Da rifissare",
  non_effettuato: "Non effettuato",
};

const RESULT_LABELS = {
  positivo: "Positivo",
  negativo: "Negativo",
  pending: "Pending",
};

export default function AppointmentHistory({ contactId }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: err } = await supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, mode, status, result, outcome_notes")
        .eq("contact_id", contactId)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
      if (cancelled) return;
      if (err) {
        console.error(err);
        setError("Non sono riuscito a caricare lo storico appuntamenti.");
      } else {
        setAppointments(data || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <CalendarClock size={13} /> Storico appuntamenti ({appointments.length})
        </p>
      </div>

      {error && <div className="px-3 py-2 text-xs text-rose-600 bg-rose-50">{error}</div>}

      {loading ? (
        <div className="p-3 text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Caricamento...
        </div>
      ) : appointments.length === 0 ? (
        <div className="p-3 text-xs text-slate-400">Nessun appuntamento registrato per questo contatto.</div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
          {appointments.map((a) => {
            const timeLabel = a.appointment_time ? a.appointment_time.slice(0, 5) : "";
            const modeLabel = a.mode === "online" ? "Online" : "In presenza";
            const statusLabel = STATUS_LABELS[a.status] || a.status;
            const resultLabel = a.result ? RESULT_LABELS[a.result] || a.result : null;
            const hasNote = !!(a.outcome_notes && a.outcome_notes.trim());
            const summaryParts = [modeLabel, statusLabel];
            if (resultLabel) summaryParts.push(resultLabel);
            return (
              <div key={a.id} className="p-2.5">
                <button
                  type="button"
                  onClick={() => hasNote && setExpandedId(expandedId === a.id ? null : a.id)}
                  className="w-full text-left flex items-center gap-1.5"
                  disabled={!hasNote}
                >
                  {hasNote ? (
                    expandedId === a.id ? (
                      <ChevronUp size={13} className="text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                    )
                  ) : (
                    <span className="w-[13px] flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-slate-700 flex-shrink-0">
                    {formatDate(a.appointment_date)} {timeLabel}
                  </span>
                  <span className="text-xs text-slate-400 truncate">· {summaryParts.join(" · ")}</span>
                </button>
                {hasNote && expandedId === a.id && (
                  <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap bg-slate-50 rounded p-2">
                    {a.outcome_notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
