import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, CalendarCheck2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import { formatCurrency, MONTH_LABELS } from "../lib/format";
import KpiCard from "../components/KpiCard";

// Formatta uno Date come "YYYY-MM" per l'input mese e come chiave interna.
function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Un appuntamento "positivo" può avere più contratti collegati (uno per ogni prodotto
// venduto nella stessa visita). Se non ce n'è nessuno collegato (vecchi appuntamenti
// salvati prima di questa funzionalità), si ricade sull'importo scritto direttamente
// sull'appuntamento, considerato convenzionalmente "Nuovo" perché il tipo non era tracciato.
function getPositivoLines(a) {
  if (Array.isArray(a.contracts) && a.contracts.length > 0) return a.contracts;
  if (a.result_amount) {
    return [{ amount: a.result_amount, contract_type: "nuovo", excess_new_amount: null, product_lines: a.product_lines || null }];
  }
  return [];
}

// Stessa logica di split usata in "Contratti e fatturato": un contratto Rinnovo può
// comunque contenere una quota "Nuovo" quando l'importo supera il contratto precedente
// (campo "eccedenza"); un contratto Nuovo è invece per intero Nuovo.
function splitNuovoRinnovo(line) {
  const amount = Number(line.amount) || 0;
  if (line.contract_type === "nuovo") return { nuovo: amount, rinnovo: 0 };
  const excess = Number(line.excess_new_amount) || 0;
  return { nuovo: excess, rinnovo: amount - excess };
}

export default function Statistiche() {
  const { operators } = useSettings();

  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [year, month] = monthKey.split("-").map(Number); // month: 1-12

  const monthLabel = `${MONTH_LABELS[month - 1]} ${year}`;

  async function loadAppointments() {
    setLoading(true);
    setError(null);
    const rangeStart = `${monthKey}-01`;
    const nextMonthDate = new Date(year, month, 1); // month è già 1-based qui, quindi "month" = mese successivo (0-based + 1)
    const rangeEnd = toMonthKey(nextMonthDate) + "-01";

    const { data, error: err } = await supabase
      .from("appointments")
      .select(
        "id, appointment_date, status, operator_id, result, result_amount, result_product_line_id, operators(initials, name), product_lines(name), contracts(amount, contract_type, excess_new_amount, product_line_id, product_lines(name))"
      )
      .gte("appointment_date", rangeStart)
      .lt("appointment_date", rangeEnd);

    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare gli appuntamenti.");
    } else {
      setAppointments(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  function changeMonth(delta) {
    const d = new Date(year, month - 1 + delta, 1);
    setMonthKey(toMonthKey(d));
  }

  const perOperator = useMemo(() => {
    const rows = operators.map((o) => ({
      id: o.id,
      label: `${o.initials}${o.name ? ` · ${o.name}` : ""}`,
      totale: 0,
      svolti: 0,
      nonEffettuato: 0,
      daRifissare: 0,
      positivo: 0,
      positivoNuovo: 0,
      positivoRinnovo: 0,
      negativo: 0,
      pending: 0,
    }));
    // riga per gli appuntamenti senza operatore assegnato
    const senzaOperatore = {
      id: "__none__",
      label: "Senza operatore",
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
    const byId = new Map(rows.map((r) => [r.id, r]));

    appointments.forEach((a) => {
      const row = (a.operator_id && byId.get(a.operator_id)) || senzaOperatore;
      row.totale += 1;
      if (a.status === "svolto") {
        row.svolti += 1;
        if (a.result === "positivo") {
          row.positivo += 1;
          getPositivoLines(a).forEach((line) => {
            const { nuovo, rinnovo } = splitNuovoRinnovo(line);
            row.positivoNuovo += nuovo;
            row.positivoRinnovo += rinnovo;
          });
        } else if (a.result === "negativo") {
          row.negativo += 1;
        } else if (a.result === "pending") {
          row.pending += 1;
        }
      } else if (a.status === "non_effettuato") {
        row.nonEffettuato += 1;
      } else if (a.status === "da_rifissare") {
        row.daRifissare += 1;
      }
    });

    const allRows = [...rows];
    if (senzaOperatore.totale > 0) allRows.push(senzaOperatore);
    return allRows.map((r) => ({ ...r, positivoImporto: r.positivoNuovo + r.positivoRinnovo })).filter((r) => r.totale > 0);
  }, [appointments, operators]);

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
      }
    );
  }, [perOperator]);

  const productLineBreakdown = useMemo(() => {
    const byLine = new Map();
    appointments.forEach((a) => {
      if (a.status !== "svolto" || a.result !== "positivo") return;
      getPositivoLines(a).forEach((line) => {
        const label = line.product_lines?.name || "Non specificata";
        const entry = byLine.get(label) || { label, count: 0, importo: 0, nuovo: 0, rinnovo: 0 };
        entry.count += 1;
        const { nuovo, rinnovo } = splitNuovoRinnovo(line);
        entry.importo += nuovo + rinnovo;
        entry.nuovo += nuovo;
        entry.rinnovo += rinnovo;
        byLine.set(label, entry);
      });
    });
    return Array.from(byLine.values()).sort((a, b) => b.importo - a.importo);
  }, [appointments]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Statistiche</h1>
          <p className="text-sm text-slate-500">Appuntamenti svolti e relativi esiti, per operatore</p>
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
      ) : appointments.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessun appuntamento registrato in {monthLabel}.
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

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-navy-700">Dettaglio per operatore</p>
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
                <p className="text-sm font-semibold text-navy-700">Esiti positivi per linea di prodotto</p>
              </div>
              <div className="divide-y divide-slate-100">
                {productLineBreakdown.map((p) => (
                  <div key={p.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate-600">
                      {p.label} <span className="text-slate-400">· {p.count} prodotti venduti</span>
                    </span>
                    <div className="text-right">
                      <p className="font-medium text-navy-700">{formatCurrency(p.importo)}</p>
                      <p className="text-xs text-slate-400">
                        Nuovo {formatCurrency(p.nuovo)} · Rinnovo {formatCurrency(p.rinnovo)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
