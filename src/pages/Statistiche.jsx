import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, CalendarCheck2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import { formatCurrency, MONTH_LABELS } from "../lib/format";
import KpiCard from "../components/KpiCard";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// Colori delle fette della torta (in linea con il blu navy e l'oro della Dashboard);
// l'ultimo, grigio, è riservato alla voce "Altri prodotti".
const PIE_COLORS = ["#1F3864", "#8C6D1F", "#2E7D6B", "#B4533C", "#5B7FB5", "#7A5C99", "#C49A3A"];
const PIE_OTHER_COLOR = "#94A3B8";
const PIE_MAX_SLICES = 7;

const PIE_MODES = [
  { key: "importo", label: "Totale" },
  { key: "nuovo", label: "Nuovo" },
  { key: "rinnovo", label: "Rinnovo" },
];

// Formatta uno Date come "YYYY-MM" per l'input mese e come chiave interna.
function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Stessa logica di split usata in "Contratti e fatturato": un contratto Rinnovo può
// comunque contenere una quota "Nuovo" quando l'importo supera il contratto precedente
// (campo "eccedenza"); un contratto Nuovo è invece per intero Nuovo.
function splitNuovoRinnovo(c) {
  const amount = Number(c.amount) || 0;
  if (c.contract_type === "nuovo") return { nuovo: amount, rinnovo: 0 };
  const excess = Number(c.excess_new_amount) || 0;
  return { nuovo: excess, rinnovo: amount - excess };
}

export default function Statistiche() {
  const { operators } = useSettings();

  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pieMode, setPieMode] = useState("importo");

  const [year, month] = monthKey.split("-").map(Number); // month: 1-12

  const monthLabel = `${MONTH_LABELS[month - 1]} ${year}`;

  // I conteggi (totale/svolti/non svolti/esiti) vengono dagli Appuntamenti; gli importi
  // Nuovo/Rinnovo vengono invece direttamente dalla tabella Contratti — la stessa fonte
  // usata da "Contratti e fatturato" e dalla Dashboard — filtrata per data di inizio nel
  // mese. Così un contratto registrato direttamente in "Contratti e fatturato" (senza
  // passare da un appuntamento) viene comunque conteggiato qui, ed è sempre lo stesso
  // numero ovunque compaia nel CRM.
  async function loadData() {
    setLoading(true);
    setError(null);
    const rangeStart = `${monthKey}-01`;
    const nextMonthDate = new Date(year, month, 1); // month è già 1-based qui, quindi "month" = mese successivo (0-based + 1)
    const rangeEnd = toMonthKey(nextMonthDate) + "-01";

    const [appointmentsRes, contractsRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, appointment_date, status, operator_id, result")
        .gte("appointment_date", rangeStart)
        .lt("appointment_date", rangeEnd),
      supabase
        .from("contracts")
        .select("id, amount, contract_type, excess_new_amount, operator_id, product_line_id, product_lines(name), product_id, products(name)")
        .gte("start_date", rangeStart)
        .lt("start_date", rangeEnd),
    ]);

    if (appointmentsRes.error || contractsRes.error) {
      console.error(appointmentsRes.error || contractsRes.error);
      setError("Non sono riuscito a caricare i dati.");
    } else {
      setAppointments(appointmentsRes.data || []);
      setContracts(contractsRes.data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  function changeMonth(delta) {
    const d = new Date(year, month - 1 + delta, 1);
    setMonthKey(toMonthKey(d));
  }

  const perOperator = useMemo(() => {
    const rows = new Map();
    function emptyRow(id, label) {
      return {
        id,
        label,
        totale: 0,
        svolti: 0,
        nonEffettuato: 0,
        daRifissare: 0,
        positivo: 0,
        positivoNuovo: 0,
        positivoRinnovo: 0,
        negativo: 0,
        pending: 0,
      };
    }
    operators.forEach((o) => {
      rows.set(o.id, emptyRow(o.id, `${o.initials}${o.name ? ` · ${o.name}` : ""}`));
    });
    const noneRow = emptyRow("__none__", "Senza operatore");
    function rowFor(operatorId) {
      if (operatorId && rows.has(operatorId)) return rows.get(operatorId);
      return noneRow;
    }

    appointments.forEach((a) => {
      const row = rowFor(a.operator_id);
      row.totale += 1;
      if (a.status === "svolto") {
        row.svolti += 1;
        if (a.result === "positivo") row.positivo += 1;
        else if (a.result === "negativo") row.negativo += 1;
        else if (a.result === "pending") row.pending += 1;
      } else if (a.status === "non_effettuato") {
        row.nonEffettuato += 1;
      } else if (a.status === "da_rifissare") {
        row.daRifissare += 1;
      }
    });

    contracts.forEach((c) => {
      const row = rowFor(c.operator_id);
      const { nuovo, rinnovo } = splitNuovoRinnovo(c);
      row.positivoNuovo += nuovo;
      row.positivoRinnovo += rinnovo;
    });

    const allRows = [...rows.values()];
    if (noneRow.totale > 0 || noneRow.positivoNuovo > 0 || noneRow.positivoRinnovo > 0) allRows.push(noneRow);
    return allRows
      .map((r) => ({
        ...r,
        positivoImporto: r.positivoNuovo + r.positivoRinnovo,
        // Appuntamenti fissati ma non effettivamente tenuti (non effettuato o da rifissare):
        // non hanno un esito di vendita collegato.
        nonCollegato: r.nonEffettuato + r.daRifissare,
      }))
      .filter((r) => r.totale > 0 || r.positivoImporto > 0);
  }, [appointments, contracts, operators]);

  const totals = useMemo(() => {
    return perOperator.reduce(
      (acc, r) => {
        acc.totale += r.totale;
        acc.svolti += r.svolti;
        acc.nonEffettuato += r.nonEffettuato;
        acc.daRifissare += r.daRifissare;
        acc.positivo += r.positivo;
        acc.positivoNuovo += r.positivoNuovo;
        acc.positivoRinnovo += r.positivoRinnovo;
        acc.positivoImporto += r.positivoImporto;
        acc.negativo += r.negativo;
        acc.pending += r.pending;
        acc.nonCollegato += r.nonCollegato;
        return acc;
      },
      {
        totale: 0,
        svolti: 0,
        nonEffettuato: 0,
        daRifissare: 0,
        positivo: 0,
        positivoNuovo: 0,
        positivoRinnovo: 0,
        positivoImporto: 0,
        negativo: 0,
        pending: 0,
        nonCollegato: 0,
      }
    );
  }, [perOperator]);

  // Percentuali calcolate sugli appuntamenti del mese con data fino a oggi compreso:
  // esclusi solo quelli fissati nei giorni successivi. Gli appuntamenti già passati ma
  // ancora senza stato/esito finiscono in "Da aggiornare", così la barra somma al 100%.
  const esitiPercent = useMemo(() => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    const c = { base: 0, positivo: 0, negativo: 0, pending: 0, nonCollegato: 0, daAggiornare: 0 };
    appointments.forEach((a) => {
      if (!a.appointment_date || a.appointment_date > todayKey) return;
      c.base += 1;
      if (a.status === "svolto" && a.result === "positivo") c.positivo += 1;
      else if (a.status === "svolto" && a.result === "negativo") c.negativo += 1;
      else if (a.status === "svolto" && a.result === "pending") c.pending += 1;
      else if (a.status === "non_effettuato" || a.status === "da_rifissare") c.nonCollegato += 1;
      else c.daAggiornare += 1;
    });
    const pct = (n) => (c.base > 0 ? Math.round((n / c.base) * 100) : 0);
    return {
      ...c,
      futuri: appointments.length - c.base,
      positivoPct: pct(c.positivo),
      negativoPct: pct(c.negativo),
      pendingPct: pct(c.pending),
      nonCollegatoPct: pct(c.nonCollegato),
      daAggiornarePct: pct(c.daAggiornare),
    };
  }, [appointments]);

  const productLineBreakdown = useMemo(() => {
    const byLine = new Map();
    contracts.forEach((c) => {
      const label = c.product_lines?.name || "Non specificata";
      const entry = byLine.get(label) || { label, count: 0, importo: 0, nuovo: 0, rinnovo: 0, byProduct: new Map() };
      entry.count += 1;
      const { nuovo, rinnovo } = splitNuovoRinnovo(c);
      entry.importo += nuovo + rinnovo;
      entry.nuovo += nuovo;
      entry.rinnovo += rinnovo;
      // Dettaglio per prodotto specifico all'interno della linea
      const prLabel = c.products?.name || "Prodotto non specificato";
      const pr = entry.byProduct.get(prLabel) || { label: prLabel, count: 0, importo: 0, nuovo: 0, rinnovo: 0 };
      pr.count += 1;
      pr.importo += nuovo + rinnovo;
      pr.nuovo += nuovo;
      pr.rinnovo += rinnovo;
      entry.byProduct.set(prLabel, pr);
      byLine.set(label, entry);
    });
    return Array.from(byLine.values())
      .map((e) => ({ ...e, products: Array.from(e.byProduct.values()).sort((a, b) => b.importo - a.importo) }))
      .sort((a, b) => b.importo - a.importo);
  }, [contracts]);

  // Quota di vendita di ogni singolo prodotto sul totale del mese (per la torta).
  // I contratti senza prodotto specifico sono raggruppati per linea.
  const productPie = useMemo(() => {
    const byProduct = new Map();
    contracts.forEach((c) => {
      const lineName = c.product_lines?.name || "Linea non specificata";
      const label = c.products?.name || `${lineName} (prodotto non specificato)`;
      const entry = byProduct.get(label) || { label, line: lineName, count: 0, importo: 0, nuovo: 0, rinnovo: 0 };
      const { nuovo, rinnovo } = splitNuovoRinnovo(c);
      entry.count += 1;
      entry.importo += nuovo + rinnovo;
      entry.nuovo += nuovo;
      entry.rinnovo += rinnovo;
      byProduct.set(label, entry);
    });
    const rows = Array.from(byProduct.values())
      .map((r) => ({ ...r, value: r[pieMode] }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    let slices = rows;
    if (rows.length > PIE_MAX_SLICES + 1) {
      const rest = rows.slice(PIE_MAX_SLICES);
      slices = [
        ...rows.slice(0, PIE_MAX_SLICES),
        {
          label: `Altri prodotti (${rest.length})`,
          line: "",
          count: rest.reduce((n, r) => n + r.count, 0),
          value: rest.reduce((n, r) => n + r.value, 0),
          isOther: true,
        },
      ];
    }
    return {
      total,
      slices: slices.map((r, i) => ({
        ...r,
        pct: total > 0 ? (r.value / total) * 100 : 0,
        color: r.isOther ? PIE_OTHER_COLOR : PIE_COLORS[i % PIE_COLORS.length],
      })),
    };
  }, [contracts, pieMode]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Statistiche</h1>
          <p className="text-sm text-slate-500">Appuntamenti svolti e fatturato, per operatore</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          <button onClick={() => changeMonth(-1)} className="text-slate-400 hover:text-navy-600 p-1">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-navy-700 w-28 text-center">{monthLabel}</span>
          <button onClick={() => changeMonth(1)} className="text-slate-400 hover:text-navy-600 p-1">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={18} /> Caricamento statistiche...
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : appointments.length === 0 && contracts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessun appuntamento o contratto registrato in {monthLabel}.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Appuntamenti totali" value={totals.totale} icon={CalendarCheck2} />
            <KpiCard
              label="Svolti"
              value={totals.svolti}
              sublabel={totals.totale > 0 ? `${Math.round((totals.svolti / totals.totale) * 100)}% del totale` : ""}
            />
            <KpiCard
              label="Esiti positivi"
              value={totals.positivo}
              sublabel={`${formatCurrency(totals.positivoImporto)} · Nuovo ${formatCurrency(
                totals.positivoNuovo
              )} · Rinnovo ${formatCurrency(totals.positivoRinnovo)}`}
              tone="default"
            />
            <KpiCard
              label="Non svolti"
              value={totals.nonEffettuato + totals.daRifissare}
              sublabel={`Non effettuato ${totals.nonEffettuato} · Da rifissare ${totals.daRifissare}`}
              tone={totals.nonEffettuato + totals.daRifissare > 0 ? "warning" : "default"}
            />
          </div>

          {esitiPercent.base > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-navy-700">Distribuzione esiti sugli appuntamenti</p>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">
                Percentuali calcolate sui {esitiPercent.base} appuntamenti del mese fino a oggi compreso
                {esitiPercent.futuri > 0 ? ` (esclusi i ${esitiPercent.futuri} fissati nei giorni successivi)` : ""}.
              </p>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 gap-0.5 mb-3">
                {esitiPercent.positivo > 0 && (
                  <div className="bg-emerald-500" style={{ width: `${esitiPercent.positivoPct}%` }} />
                )}
                {esitiPercent.negativo > 0 && (
                  <div className="bg-rose-500" style={{ width: `${esitiPercent.negativoPct}%` }} />
                )}
                {esitiPercent.pending > 0 && (
                  <div className="bg-slate-400" style={{ width: `${esitiPercent.pendingPct}%` }} />
                )}
                {esitiPercent.nonCollegato > 0 && (
                  <div className="bg-amber-500" style={{ width: `${esitiPercent.nonCollegatoPct}%` }} />
                )}
                {esitiPercent.daAggiornare > 0 && (
                  <div className="bg-sky-300" style={{ width: `${esitiPercent.daAggiornarePct}%` }} />
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-600">
                    Positivo <span className="font-semibold text-slate-800">{esitiPercent.positivoPct}%</span>{" "}
                    <span className="text-slate-400">({esitiPercent.positivo})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-slate-600">
                    Negativo <span className="font-semibold text-slate-800">{esitiPercent.negativoPct}%</span>{" "}
                    <span className="text-slate-400">({esitiPercent.negativo})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-slate-600">
                    Pending <span className="font-semibold text-slate-800">{esitiPercent.pendingPct}%</span>{" "}
                    <span className="text-slate-400">({esitiPercent.pending})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-slate-600">
                    Non svolti <span className="font-semibold text-slate-800">{esitiPercent.nonCollegatoPct}%</span>{" "}
                    <span className="text-slate-400">({esitiPercent.nonCollegato})</span>
                  </span>
                </div>
                {esitiPercent.daAggiornare > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-300 shrink-0" />
                    <span className="text-slate-600">
                      Da aggiornare <span className="font-semibold text-slate-800">{esitiPercent.daAggiornarePct}%</span>{" "}
                      <span className="text-slate-400">({esitiPercent.daAggiornare})</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-navy-700">Dettaglio per operatore</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Gli importi Nuovo/Rinnovo includono anche i contratti registrati direttamente in "Contratti e
                fatturato" (non solo quelli inseriti dall'appuntamento), purché abbiano un operatore assegnato.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Operatore</th>
                    <th className="text-right px-3 py-2.5">Totale</th>
                    <th className="text-right px-3 py-2.5">Svolti</th>
                    <th className="text-right px-3 py-2.5">Non eff.</th>
                    <th className="text-right px-3 py-2.5">Da rifissare</th>
                    <th className="text-right px-3 py-2.5">Positivo</th>
                    <th className="text-right px-3 py-2.5">Nuovo (€)</th>
                    <th className="text-right px-3 py-2.5">Rinnovo (€)</th>
                    <th className="text-right px-3 py-2.5">Totale (€)</th>
                    <th className="text-right px-3 py-2.5">Negativo</th>
                    <th className="text-right px-3 py-2.5">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perOperator.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 text-slate-700 font-medium whitespace-nowrap">{r.label}</td>
                      <td className="text-right px-3 py-2.5 text-slate-600">{r.totale}</td>
                      <td className="text-right px-3 py-2.5 text-emerald-600 font-medium">{r.svolti}</td>
                      <td className="text-right px-3 py-2.5 text-rose-500">{r.nonEffettuato}</td>
                      <td className="text-right px-3 py-2.5 text-amber-600">{r.daRifissare}</td>
                      <td className="text-right px-3 py-2.5 text-emerald-600">{r.positivo}</td>
                      <td className="text-right px-3 py-2.5 text-navy-600 whitespace-nowrap">
                        {formatCurrency(r.positivoNuovo)}
                      </td>
                      <td className="text-right px-3 py-2.5 text-gold-500 whitespace-nowrap">
                        {formatCurrency(r.positivoRinnovo)}
                      </td>
                      <td className="text-right px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">
                        {formatCurrency(r.positivoImporto)}
                      </td>
                      <td className="text-right px-3 py-2.5 text-rose-500">{r.negativo}</td>
                      <td className="text-right px-3 py-2.5 text-slate-400">{r.pending}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-navy-700">
                    <td className="px-4 py-2.5">Totale</td>
                    <td className="text-right px-3 py-2.5">{totals.totale}</td>
                    <td className="text-right px-3 py-2.5">{totals.svolti}</td>
                    <td className="text-right px-3 py-2.5">{totals.nonEffettuato}</td>
                    <td className="text-right px-3 py-2.5">{totals.daRifissare}</td>
                    <td className="text-right px-3 py-2.5">{totals.positivo}</td>
                    <td className="text-right px-3 py-2.5 whitespace-nowrap">{formatCurrency(totals.positivoNuovo)}</td>
                    <td className="text-right px-3 py-2.5 whitespace-nowrap">{formatCurrency(totals.positivoRinnovo)}</td>
                    <td className="text-right px-3 py-2.5 whitespace-nowrap">{formatCurrency(totals.positivoImporto)}</td>
                    <td className="text-right px-3 py-2.5">{totals.negativo}</td>
                    <td className="text-right px-3 py-2.5">{totals.pending}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {productLineBreakdown.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-xl">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-navy-700">Fatturato per linea di prodotto</p>
              </div>
              <div className="divide-y divide-slate-100">
                {productLineBreakdown.map((p) => (
                  <div key={p.label}>
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-600">
                      {p.label} <span className="text-slate-400">· {p.count} contratti</span>
                    </span>
                    <div className="text-right">
                      <p className="font-medium text-navy-700">{formatCurrency(p.importo)}</p>
                      <p className="text-xs text-slate-400">
                        Nuovo {formatCurrency(p.nuovo)} · Rinnovo {formatCurrency(p.rinnovo)}
                      </p>
                    </div>
                  </div>
                  {!(p.products.length === 1 && p.products[0].label === "Prodotto non specificato") &&
                    p.products.map((pr) => (
                      <div
                        key={pr.label}
                        className="flex items-center justify-between pl-8 pr-4 py-1.5 text-xs bg-slate-50/60"
                      >
                        <span className="text-slate-500">
                          {pr.label} <span className="text-slate-400">· {pr.count}</span>
                        </span>
                        <span className="text-right text-slate-500">
                          {formatCurrency(pr.importo)}{" "}
                          <span className="text-slate-400">
                            (N {formatCurrency(pr.nuovo)} · R {formatCurrency(pr.rinnovo)})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {contracts.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-3xl">
              <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-navy-700">Vendite per prodotto</p>
                  <p className="text-xs text-slate-400">% sul fatturato del mese</p>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {PIE_MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPieMode(m.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        pieMode === m.key ? "bg-white text-navy-700 shadow-sm" : "text-slate-500 hover:text-navy-600"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {productPie.total === 0 ? (
                <p className="px-4 py-8 text-sm text-slate-400 text-center">
                  Nessun importo {pieMode === "importo" ? "" : pieMode === "nuovo" ? "Nuovo " : "Rinnovo "}nel mese selezionato
                </p>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center gap-4 p-4">
                  <div className="w-full md:w-60 h-60 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={productPie.slices}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius="90%"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {productPie.slices.map((s) => (
                            <Cell key={s.label} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, item) => [
                            `${formatCurrency(value)} · ${item.payload.pct.toFixed(1)}%`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex-1 min-w-0 divide-y divide-slate-100">
                    {productPie.slices.map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                          <div className="min-w-0">
                            <p className="text-slate-700 truncate">{s.label}</p>
                            {s.line && !s.label.includes("non specificato") && (
                              <p className="text-[11px] text-slate-400 truncate">
                                {s.line} · {s.count} contratti
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-navy-700">{s.pct.toFixed(1)}%</p>
                          <p className="text-[11px] text-slate-400">{formatCurrency(s.value)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                      <span>Totale</span>
                      <span className="font-medium">{formatCurrency(productPie.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}



