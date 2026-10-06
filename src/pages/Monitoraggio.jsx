    import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, UserCheck, CircleDashed, Activity, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import KpiCard from "../components/KpiCard";

// Monitoraggio del lavoro per operatore: per ogni operatore mostra quanti contatti
// assegnati si trovano in ciascuna fase della pipeline (compresa "Nessuna fase") e
// quanti hanno ciascun esito chiamata (compreso "Nessun esito" = ancora da lavorare).
// Cliccando su un numero si apre l'elenco dei contatti corrispondenti.

const PAGE = 1000;
const NONE = "__none__"; // chiave per "Nessuna fase" / "Nessun esito" / "Senza operatore"

// Supabase limita ogni lettura a 1000 righe: leggiamo pagina per pagina.
async function fetchAll(buildQuery) {
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

const RECENT_OPTIONS = [
  { value: "", label: "Tutti i contatti" },
  { value: "1", label: "Aggiornati oggi" },
  { value: "7", label: "Aggiornati ultimi 7 giorni" },
  { value: "30", label: "Aggiornati ultimi 30 giorni" },
];

function pct(n, tot) {
  if (!tot) return "";
  return `${Math.round((n / tot) * 100)}%`;
}

export default function Monitoraggio() {
  const navigate = useNavigate();
  const { operators, pipelineStages, callOutcomes } = useSettings();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filterList, setFilterList] = useState("");
  const [filterStatus, setFilterStatus] = useState("attivo");
  const [filterRecent, setFilterRecent] = useState("");
  const [showNoOperator, setShowNoOperator] = useState(false);
  const [view, setView] = useState("fasi"); // "fasi" | "esiti"

  // Cella selezionata: { operatorId, key, title }
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAll(() =>
        supabase
          .from("contacts")
          .select(
            "id, first_name, last_name, company, phone, status, list_name, operator_id, pipeline_stage_id, call_outcome_id, updated_at, created_at"
          )
          .order("created_at", { ascending: false })
      );
      setContacts(data);
    } catch (err) {
      console.error(err);
      setError("Non sono riuscito a caricare i contatti.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const listNames = useMemo(() => {
    const names = new Set(contacts.map((c) => c.list_name).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  // Contatti dopo i filtri generali (lista, stato, periodo di aggiornamento)
  const filtered = useMemo(() => {
    let since = null;
    if (filterRecent) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (Number(filterRecent) - 1));
      since = d.getTime();
    }
    return contacts.filter((c) => {
      if (filterList && c.list_name !== filterList) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (since) {
        const t = new Date(c.updated_at || c.created_at).getTime();
        if (!(t >= since)) return false;
      }
      return true;
    });
  }, [contacts, filterList, filterStatus, filterRecent]);

  // Colonne della tabella in base alla vista scelta
  const columns = useMemo(() => {
    if (view === "fasi") {
      return [
        ...pipelineStages.map((s) => ({ key: s.id, label: s.name, color: s.color })),
        { key: NONE, label: "Nessuna fase", muted: true },
      ];
    }
    return [
      ...callOutcomes.map((o) => ({ key: o.id, label: o.name })),
      { key: NONE, label: "Nessun esito", muted: true },
    ];
  }, [view, pipelineStages, callOutcomes]);

  const field = view === "fasi" ? "pipeline_stage_id" : "call_outcome_id";

  // Righe: un operatore per riga (+ eventualmente "Senza operatore")
  const rows = useMemo(() => {
    const opRows = operators.map((o) => ({
      id: o.id,
      label: o.initials,
      name: o.name,
    }));
    if (showNoOperator) opRows.push({ id: NONE, label: "—", name: "Senza operatore" });

    const validCols = new Set(columns.map((c) => c.key));

    return opRows.map((op) => {
      const mine = filtered.filter((c) =>
        op.id === NONE ? !c.operator_id : c.operator_id === op.id
      );
      const counts = {};
      columns.forEach((col) => (counts[col.key] = 0));
      mine.forEach((c) => {
        const k = c[field] && validCols.has(c[field]) ? c[field] : NONE;
        counts[k] += 1;
      });
      return { ...op, total: mine.length, counts };
    });
  }, [operators, filtered, columns, field, showNoOperator]);

  const totals = useMemo(() => {
    const t = { total: 0, counts: {} };
    columns.forEach((col) => (t.counts[col.key] = 0));
    rows.forEach((r) => {
      t.total += r.total;
      columns.forEach((col) => (t.counts[col.key] += r.counts[col.key]));
    });
    return t;
  }, [rows, columns]);

  // KPI in alto
  const kpi = useMemo(() => {
    const assigned = filtered.filter((c) => c.operator_id).length;
    const untouched = filtered.filter((c) => c.operator_id && !c.call_outcome_id).length;
    const since7 = new Date();
    since7.setHours(0, 0, 0, 0);
    since7.setDate(since7.getDate() - 6);
    const recent = filtered.filter(
      (c) => c.operator_id && new Date(c.updated_at || c.created_at).getTime() >= since7.getTime()
    ).length;
    return { total: filtered.length, assigned, untouched, recent };
  }, [filtered]);

  // Elenco contatti della cella selezionata
  const selectedContacts = useMemo(() => {
    if (!selected) return [];
    const validCols = new Set(columns.map((c) => c.key));
    return filtered.filter((c) => {
      if (selected.operatorId !== "*") {
        const opOk =
          selected.operatorId === NONE ? !c.operator_id : c.operator_id === selected.operatorId;
        if (!opOk) return false;
      } else if (!showNoOperator && !c.operator_id) {
        return false;
      }
      if (selected.key === "*") return true;
      const k = c[field] && validCols.has(c[field]) ? c[field] : NONE;
      return k === selected.key;
    });
  }, [selected, filtered, field, columns, showNoOperator]);

  function selectCell(operatorId, opLabel, key, colLabel) {
    setSelected({ operatorId, key, title: `${opLabel} · ${colLabel}` });
  }

  // Quando cambiano i filtri o la vista, chiudiamo l'elenco per evitare confusione
  useEffect(() => {
    setSelected(null);
  }, [view, filterList, filterStatus, filterRecent, showNoOperator]);

  const stageName = (id) => pipelineStages.find((s) => s.id === id)?.name || "—";
  const outcomeName = (id) => callOutcomes.find((o) => o.id === id)?.name || "—";
  const operatorInitials = (id) => operators.find((o) => o.id === id)?.initials || "—";

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-700">Monitoraggio operatori</h1>
        <p className="text-sm text-slate-500 mt-1">
          Situazione dei contatti assegnati a ciascun operatore, per fase della pipeline o per esito
          chiamata. Clicca su un numero per vedere i contatti.
        </p>
      </div>

      {/* Filtri */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Vista</label>
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            {[
              { key: "fasi", label: "Per fase pipeline" },
              { key: "esiti", label: "Per esito chiamata" },
            ].map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`px-3 py-2 text-sm font-medium ${
                  view === v.key ? "bg-navy-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Lista</label>
          <select
            value={filterList}
            onChange={(e) => setFilterList(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Tutte le liste</option>
            {listNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Stato contatto</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="attivo">Solo attivi</option>
            <option value="">Tutti (anche persi)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Periodo</label>
          <select
            value={filterRecent}
            onChange={(e) => setFilterRecent(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {RECENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <input
            type="checkbox"
            checked={showNoOperator}
            onChange={(e) => setShowNoOperator(e.target.checked)}
          />
          Mostra contatti senza operatore
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
          <Loader2 className="animate-spin" size={18} /> Caricamento...
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Contatti (con i filtri)" value={kpi.total} icon={Users} />
            <KpiCard
              label="Assegnati a un operatore"
              value={kpi.assigned}
              sublabel={pct(kpi.assigned, kpi.total) && `${pct(kpi.assigned, kpi.total)} del totale`}
              icon={UserCheck}
            />
            <KpiCard
              label="Assegnati ma senza esito"
              value={kpi.untouched}
              sublabel="ancora da chiamare"
              tone={kpi.untouched > 0 ? "warning" : "default"}
              icon={CircleDashed}
            />
            <KpiCard
              label="Lavorati ultimi 7 giorni"
              value={kpi.recent}
              sublabel="contatti assegnati aggiornati"
              icon={Activity}
            />
          </div>

          {operators.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-500">
              Nessun operatore configurato. Aggiungili da Impostazioni → Operatori.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="text-left px-3 py-3 font-semibold sticky left-0 bg-slate-50">Operatore</th>
                    <th className="text-right px-3 py-3 font-semibold">Totale</th>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`text-right px-3 py-3 font-semibold whitespace-nowrap ${
                          col.muted ? "text-amber-700" : ""
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {col.color && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                          )}
                          {col.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 sticky left-0 bg-white">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-navy-50 text-navy-700 font-bold text-xs mr-2">
                          {r.label}
                        </span>
                        <span className="text-slate-600">{r.name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <CellButton
                          value={r.total}
                          bold
                          onClick={() => selectCell(r.id, r.name || r.label, "*", "Tutti")}
                        />
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2.5 text-right">
                          <CellButton
                            value={r.counts[col.key]}
                            sub={pct(r.counts[col.key], r.total)}
                            warn={col.muted}
                            active={selected?.operatorId === r.id && selected?.key === col.key}
                            onClick={() => selectCell(r.id, r.name || r.label, col.key, col.label)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-3 py-2.5 sticky left-0 bg-slate-50">Totale</td>
                    <td className="px-3 py-2.5 text-right">
                      <CellButton value={totals.total} bold onClick={() => selectCell("*", "Tutti", "*", "Tutti")} />
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2.5 text-right">
                        <CellButton
                          value={totals.counts[col.key]}
                          sub={pct(totals.counts[col.key], totals.total)}
                          warn={col.muted}
                          onClick={() => selectCell("*", "Tutti", col.key, col.label)}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {selected && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <p className="font-semibold text-navy-700">
                  {selected.title}{" "}
                  <span className="text-slate-400 font-normal">({selectedContacts.length} contatti)</span>
                </p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>
              {selectedContacts.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Nessun contatto.</p>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Contatto</th>
                        <th className="text-left px-3 py-2 font-semibold">Telefono</th>
                        <th className="text-left px-3 py-2 font-semibold">Op.</th>
                        <th className="text-left px-3 py-2 font-semibold">Fase</th>
                        <th className="text-left px-3 py-2 font-semibold">Esito chiamata</th>
                        <th className="text-left px-3 py-2 font-semibold">Lista</th>
                        <th className="text-left px-3 py-2 font-semibold">Ultimo aggiorn.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedContacts.slice(0, 500).map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => navigate(`/contatti?id=${c.id}`)}
                          className="border-t border-slate-100 hover:bg-navy-50/50 cursor-pointer"
                        >
                          <td className="px-3 py-2">
                            <p className="font-medium text-navy-700">
                              {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                            </p>
                            {c.company && <p className="text-xs text-slate-400">{c.company}</p>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{c.phone || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{operatorInitials(c.operator_id)}</td>
                          <td className="px-3 py-2 text-slate-600">{stageName(c.pipeline_stage_id)}</td>
                          <td className="px-3 py-2 text-slate-600">{outcomeName(c.call_outcome_id)}</td>
                          <td className="px-3 py-2 text-slate-600">{c.list_name || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(c.updated_at || c.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedContacts.length > 500 && (
                    <p className="p-3 text-xs text-slate-400">
                      Mostrati i primi 500. Usa la Ricerca avanzata per l'elenco completo ed esportarlo.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CellButton({ value, sub, bold, warn, active, onClick }) {
  if (!value) return <span className="text-slate-300">0</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-col items-end rounded-md px-2 py-0.5 hover:bg-navy-50 ${
        active ? "bg-navy-100 ring-1 ring-navy-300" : ""
      }`}
    >
      <span className={`${bold ? "font-bold text-navy-700" : warn ? "text-amber-700 font-semibold" : "text-navy-700"}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-slate-400 leading-none">{sub}</span>}
    </button>
  );
}


