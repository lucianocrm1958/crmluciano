import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCurrentUser } from "../lib/activityLog";
import { useSettings } from "../lib/useSettings";
import ContactCardModal from "../components/ContactCardModal";
import { Loader2, ChevronLeft, ChevronRight, Lock, Clock, LogIn, Coffee, FileText, ChevronDown, ChevronUp } from "lucide-react";

// Pagina riservata all'amministratore: per ogni giorno mostra, per ciascun
// operatore, a che ora ha aperto il CRM, quanti minuti ha lavorato davvero
// (finestra del CRM in primo piano e in uso), le pause lunghe e le schede aperte.
// I dati vengono dalla tabella activity_log, scritta in automatico dal CRM.

const PAUSE_MIN = 15; // un'interruzione di almeno 15 minuti viene mostrata come pausa
const SEGMENT_GAP_MIN = 6; // segnali distanti meno di così fanno parte dello stesso blocco di lavoro

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(date) {
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

// Supabase restituisce al massimo 1000 righe per richiesta: le leggiamo a blocchi.
async function fetchDayLog(dayStart, dayEnd) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, created_at, user_email, event, source, contact_id")
      .gte("created_at", dayStart.toISOString())
      .lt("created_at", dayEnd.toISOString())
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchContactNames(ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await supabase.from("contacts").select("id, first_name, last_name, company").in("id", chunk);
    (data || []).forEach((c) => {
      map[String(c.id)] = [`${c.first_name || ""} ${c.last_name || ""}`.trim(), c.company].filter(Boolean).join(" · ");
    });
  }
  return map;
}

function summarize(unsorted) {
  const events = [...unsorted].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const times = events.map((e) => new Date(e.created_at));
  const first = times[0];
  const last = times[times.length - 1];
  const firstAccess = events.find((e) => e.event === "accesso");

  // Minuti di lavoro effettivo = minuti distinti con un segnale "attivo".
  const activeMinuteKeys = new Set(
    events.filter((e) => e.event === "attivo").map((e) => e.created_at.slice(0, 16))
  );

  // Blocchi di lavoro continuo (per la barra della giornata e per le pause).
  const workTimes = events
    .filter((e) => e.event === "attivo" || e.event === "scheda")
    .map((e) => new Date(e.created_at).getTime());
  const segments = [];
  workTimes.forEach((t) => {
    const lastSeg = segments[segments.length - 1];
    if (lastSeg && t - lastSeg.end <= SEGMENT_GAP_MIN * 60000) {
      lastSeg.end = t;
    } else {
      segments.push({ start: t - 60000, end: t });
    }
  });

  const pauses = [];
  for (let i = 1; i < segments.length; i++) {
    const gap = Math.round((segments[i].start - segments[i - 1].end) / 60000);
    if (gap >= PAUSE_MIN) pauses.push({ from: new Date(segments[i - 1].end), to: new Date(segments[i].start), minutes: gap });
  }

  const cards = events.filter((e) => e.event === "scheda");

  return {
    first: firstAccess ? new Date(firstAccess.created_at) : first,
    last,
    activeMinutes: activeMinuteKeys.size,
    segments,
    pauses,
    cards,
    accessCount: events.filter((e) => e.event === "accesso").length,
  };
}

export default function AttivitaTelefoniste() {
  const { isAdmin, loading: userLoading } = useCurrentUser();
  const { operators } = useSettings();
  const [day, setDay] = useState(() => toISODate(new Date()));
  const [log, setLog] = useState([]);
  const [contactNames, setContactNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [openContactId, setOpenContactId] = useState(null);

  useEffect(() => {
    if (userLoading || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [y, m, d] = day.split("-").map(Number);
        const start = new Date(y, m - 1, d);
        const end = new Date(y, m - 1, d + 1);
        const rows = await fetchDayLog(start, end);
        const ids = [...new Set(rows.filter((r) => r.contact_id).map((r) => r.contact_id))];
        const names = ids.length ? await fetchContactNames(ids) : {};
        if (cancelled) return;
        setLog(rows);
        setContactNames(names);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Non sono riuscito a caricare il registro attività: " + (err.message || ""));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day, isAdmin, userLoading]);

  // Un riquadro per ogni persona: prima gli operatori con email collegata
  // (anche se oggi non hanno lavorato), poi eventuali altri account.
  const people = useMemo(() => {
    const byEmail = {};
    log.forEach((r) => {
      (byEmail[r.user_email] = byEmail[r.user_email] || []).push(r);
    });
    const list = [];
    const seen = new Set();
    operators
      .filter((o) => o.email)
      .forEach((o) => {
        const email = o.email.toLowerCase();
        seen.add(email);
        list.push({ key: email, email, operator: o, events: byEmail[email] || [] });
      });
    Object.keys(byEmail).forEach((email) => {
      if (!seen.has(email)) list.push({ key: email, email, operator: null, events: byEmail[email] });
    });
    return list.map((p) => ({ ...p, summary: p.events.length ? summarize(p.events) : null }));
  }, [log, operators]);

  // Estremi della barra della giornata: di norma 8–20, allargati se serve.
  const [axisStart, axisEnd] = useMemo(() => {
    const [y, m, d] = day.split("-").map(Number);
    let s = new Date(y, m - 1, d, 8).getTime();
    let e = new Date(y, m - 1, d, 20).getTime();
    people.forEach((p) => {
      p.summary?.segments.forEach((seg) => {
        if (seg.start < s) s = new Date(seg.start).setMinutes(0, 0, 0);
        if (seg.end > e) e = new Date(seg.end).setMinutes(60, 0, 0);
      });
    });
    return [s, e];
  }, [people, day]);

  function shiftDay(delta) {
    const [y, m, d] = day.split("-").map(Number);
    setDay(toISODate(new Date(y, m - 1, d + delta)));
  }

  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
          <Lock size={22} className="text-slate-400" />
          Questa pagina è riservata all'amministratore del CRM.
        </div>
      </div>
    );
  }

  const isToday = day === toISODate(new Date());
  const hours = [];
  for (let t = axisStart; t <= axisEnd; t += 3600000) hours.push(t);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Attività telefoniste</h1>
          <p className="text-sm text-slate-500">
            Accessi, tempo di lavoro effettivo nel CRM, pause e schede aperte, giorno per giorno.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDay(-1)} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50" title="Giorno precedente">
            <ChevronLeft size={16} />
          </button>
          <input type="date" className="input w-auto" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button
            onClick={() => shiftDay(1)}
            disabled={isToday}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
            title="Giorno successivo"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={18} /> Caricamento...
        </div>
      ) : people.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessuna attività registrata in questo giorno. Ricorda di indicare l'email di ogni operatore in Impostazioni →
          Operatori.
        </div>
      ) : (
        <div className="space-y-3">
          {people.map((p) => {
            const s = p.summary;
            const label = p.operator ? `${p.operator.initials}${p.operator.name ? ` · ${p.operator.name}` : ""}` : p.email;
            const isOpen = !!expanded[p.key];
            return (
              <div key={p.key} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full bg-navy-50 text-navy-700 text-xs font-bold flex items-center justify-center">
                      {p.operator?.initials || "?"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{label}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                    </div>
                  </div>
                  {!s && <span className="text-xs text-slate-400 bg-slate-50 rounded-full px-2.5 py-1">Nessun accesso</span>}
                </div>

                {s && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Stat icon={<LogIn size={14} />} label="Primo accesso" value={hhmm(s.first)} />
                      <Stat icon={<Clock size={14} />} label="Ultima attività" value={hhmm(s.last)} />
                      <Stat
                        icon={<Clock size={14} />}
                        label="Tempo attivo"
                        value={formatMinutes(s.activeMinutes)}
                        hint={`su ${formatMinutes(Math.max(0, Math.round((s.last - s.first) / 60000)))} di presenza`}
                      />
                      <Stat icon={<FileText size={14} />} label="Schede aperte" value={String(s.cards.length)} />
                    </div>

                    {/* Barra della giornata: blu = lavoro nel CRM, vuoto = assenza/pausa */}
                    <div>
                      <div className="relative h-5 bg-slate-100 rounded-md overflow-hidden">
                        {s.segments.map((seg, i) => {
                          const left = ((seg.start - axisStart) / (axisEnd - axisStart)) * 100;
                          const width = Math.max(0.4, ((seg.end - seg.start) / (axisEnd - axisStart)) * 100);
                          return (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0 bg-navy-500"
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${hhmm(new Date(seg.start))} – ${hhmm(new Date(seg.end))}`}
                            />
                          );
                        })}
                      </div>
                      <div className="relative h-4 mt-0.5">
                        {hours.map((t) => (
                          <span
                            key={t}
                            className="absolute text-[10px] text-slate-400 -translate-x-1/2"
                            style={{ left: `${((t - axisStart) / (axisEnd - axisStart)) * 100}%` }}
                          >
                            {new Date(t).getHours()}
                          </span>
                        ))}
                      </div>
                    </div>

                    {s.pauses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.pauses.map((pa, i) => (
                          <span key={i} className="text-xs bg-amber-50 text-amber-700 rounded-full px-2.5 py-1 flex items-center gap-1">
                            <Coffee size={12} /> Pausa {hhmm(pa.from)}–{hhmm(pa.to)} ({formatMinutes(pa.minutes)})
                          </span>
                        ))}
                      </div>
                    )}

                    {s.cards.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpanded((x) => ({ ...x, [p.key]: !x[p.key] }))}
                          className="text-xs font-medium text-navy-600 hover:text-navy-800 flex items-center gap-1"
                        >
                          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {isOpen ? "Nascondi" : "Mostra"} le schede aperte ({s.cards.length})
                        </button>
                        {isOpen && (
                          <div className="mt-2 border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                            {s.cards.map((c) => (
                              <div key={c.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                                <span className="text-slate-500 w-11 flex-shrink-0">{hhmm(new Date(c.created_at))}</span>
                                <button
                                  type="button"
                                  disabled={!c.contact_id}
                                  onClick={() => setOpenContactId(c.contact_id)}
                                  className="text-slate-700 hover:text-navy-700 hover:underline text-left truncate flex-1"
                                >
                                  {contactNames[c.contact_id] || "Contatto non più presente"}
                                </button>
                                <span className="text-[10px] text-slate-400 bg-slate-50 rounded px-1.5 py-0.5 flex-shrink-0">
                                  {c.source === "follow-up" ? "Esito follow-up" : "Scheda contatto"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Il tempo attivo conta i minuti in cui la finestra del CRM era in primo piano e usata (clic, tastiera, scorrimento)
        negli ultimi 5 minuti: è una stima del lavoro svolto nel CRM, non comprende il tempo passato su altri programmi.
      </p>

      {openContactId && (
        <ContactCardModal contactId={openContactId} onClose={() => setOpenContactId(null)} onChanged={() => {}} />
      )}
    </div>
  );
}

function Stat({ icon, label, value, hint }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-slate-500 flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-sm font-semibold text-navy-700">{value}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
