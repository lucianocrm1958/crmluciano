import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Pencil, ChevronDown, ChevronUp, Target, Users } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import CampaignForm from "../components/CampaignForm";
import { formatCurrency, formatDate } from "../lib/format";

// Campagne canvass: per ogni campagna mostra l'avanzamento verso gli obiettivi, calcolato
// in automatico dai contratti registrati nel CRM (stessa tabella di Contratti e fatturato).
//
// Regole di calcolo:
//  - contano i contratti con data di inizio compresa nel periodo della campagna;
//  - solo sui prodotti/linee della campagna (se non ne è indicato nessuno: tutti);
//  - fatturato = quota Nuovo (contratto Nuovo intero, oppure eccedenza Nuovo di un Rinnovo);
//  - pezzi = numero di contratti di tipo Nuovo sul prodotto/linea;
//  - con "solo clienti nuovi" si escludono i clienti che avevano già un contratto prima
//    dell'inizio della campagna.

function nuovoAmount(c) {
  const amount = Number(c.amount) || 0;
  if (c.contract_type === "nuovo") return amount;
  return Number(c.excess_new_amount) || 0;
}

function todayStr() {
  return new Date().toLocaleDateString("sv-SE");
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function campaignState(c) {
  const t = todayStr();
  if (t < c.start_date) return "futura";
  if (t > c.end_date) return "conclusa";
  return "in_corso";
}

function matchesItem(contract, item) {
  if (item.product_id) return contract.product_id === item.product_id;
  return contract.product_line_id === item.product_line_id;
}

async function fetchAllContracts(from, to) {
  const PAGE = 1000;
  let all = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id, amount, contract_type, excess_new_amount, start_date, contact_id, product_line_id, product_id, operator_id, products(name), product_lines(name), contacts(first_name, last_name, company)"
      )
      .gte("start_date", from)
      .lte("start_date", to)
      .order("start_date", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// Clienti che avevano già almeno un contratto prima della data indicata.
async function fetchExistingClients(contactIds, beforeDate) {
  const existing = new Set();
  const ids = [...new Set(contactIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("contracts")
      .select("contact_id")
      .in("contact_id", ids.slice(i, i + 200))
      .lt("start_date", beforeDate);
    if (error) throw error;
    (data || []).forEach((r) => existing.add(r.contact_id));
  }
  return existing;
}

export default function Campagne() {
  const { productLines, products, operators } = useSettings();
  const [campaigns, setCampaigns] = useState([]);
  const [results, setResults] = useState({}); // { [campaignId]: { contracts, revenue, pieces: {itemId: n} } }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showConcluded, setShowConcluded] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("campaigns")
        .select("id, name, start_date, end_date, revenue_target, only_new_clients, notes, campaign_items(id, product_line_id, product_id, pieces_target)")
        .order("start_date", { ascending: false });
      if (err) throw err;
      const list = data || [];
      setCampaigns(list);

      // Un'unica lettura dei contratti che copre il periodo di tutte le campagne.
      if (list.length === 0) {
        setResults({});
        return;
      }
      const minStart = list.reduce((m, c) => (c.start_date < m ? c.start_date : m), list[0].start_date);
      const maxEnd = list.reduce((m, c) => (c.end_date > m ? c.end_date : m), list[0].end_date);
      const allContracts = await fetchAllContracts(minStart, maxEnd);

      const res = {};
      for (const camp of list) {
        const items = camp.campaign_items || [];
        let inScope = allContracts.filter(
          (c) =>
            c.start_date >= camp.start_date &&
            c.start_date <= camp.end_date &&
            (items.length === 0 || items.some((it) => matchesItem(c, it)))
        );
        if (camp.only_new_clients) {
          const existing = await fetchExistingClients(
            inScope.map((c) => c.contact_id),
            camp.start_date
          );
          inScope = inScope.filter((c) => !existing.has(c.contact_id));
        }
        const counted = inScope.filter((c) => nuovoAmount(c) > 0);
        const revenue = counted.reduce((s, c) => s + nuovoAmount(c), 0);
        const pieces = {};
        items.forEach((it) => {
          pieces[it.id] = counted.filter((c) => c.contract_type === "nuovo" && matchesItem(c, it)).length;
        });
        res[camp.id] = { contracts: counted, revenue, pieces };
      }
      setResults(res);
    } catch (err) {
      console.error(err);
      setError(
        "Non riesco a caricare le campagne: verifica di aver eseguito la migrazione SQL su Supabase."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const g = { in_corso: [], futura: [], conclusa: [] };
    campaigns.forEach((c) => g[campaignState(c)].push(c));
    return g;
  }, [campaigns]);

  function itemLabel(it) {
    const line = productLines.find((l) => l.id === it.product_line_id)?.name || "Linea";
    if (!it.product_id) return `${line} (tutti i prodotti)`;
    const prod = products.find((p) => p.id === it.product_id)?.name || "Prodotto";
    return `${prod} · ${line}`;
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c) {
    setEditing(c);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento campagne...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Campagne</h1>
          <p className="text-sm text-slate-500">
            {groups.in_corso.length} in corso · {groups.futura.length} in programma
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> Nuova campagna
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {!error && campaigns.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessuna campagna ancora. Crea la prima con "Nuova campagna".
        </div>
      )}

      {[
        ["in_corso", "In corso"],
        ["futura", "In programma"],
      ].map(([key, title]) =>
        groups[key].length > 0 ? (
          <div key={key} className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
            {groups[key].map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                result={results[c.id]}
                itemLabel={itemLabel}
                operators={operators}
                onEdit={() => openEdit(c)}
              />
            ))}
          </div>
        ) : null
      )}

      {groups.conclusa.length > 0 && (
        <div>
          <button
            onClick={() => setShowConcluded((s) => !s)}
            className="text-sm text-slate-400 hover:text-slate-600 font-medium"
          >
            {showConcluded ? "Nascondi" : "Mostra"} campagne concluse ({groups.conclusa.length})
          </button>
          {showConcluded && (
            <div className="space-y-3 mt-3">
              {groups.conclusa.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  result={results[c.id]}
                  itemLabel={itemLabel}
                  operators={operators}
                  onEdit={() => openEdit(c)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <CampaignForm
          campaign={editing}
          onClose={() => setFormOpen(false)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}

function ProgressBar({ value, target, timePct }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const ahead = timePct == null || pct >= timePct;
  const color = pct >= 100 ? "bg-emerald-500" : ahead ? "bg-navy-500" : "bg-amber-500";
  return (
    <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      {timePct != null && timePct > 0 && timePct < 100 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-500"
          style={{ left: `${timePct}%` }}
          title="Tempo trascorso"
        />
      )}
    </div>
  );
}

function CampaignCard({ campaign, result, itemLabel, operators, onEdit }) {
  const [open, setOpen] = useState(false);
  const state = campaignState(campaign);
  const totalDays = daysBetween(campaign.start_date, campaign.end_date) + 1;
  const elapsed =
    state === "futura"
      ? 0
      : state === "conclusa"
      ? totalDays
      : daysBetween(campaign.start_date, todayStr()) + 1;
  const timePct = state === "in_corso" ? Math.round((elapsed / totalDays) * 100) : null;
  const daysLeft = state === "in_corso" ? totalDays - elapsed : null;
  const items = campaign.campaign_items || [];
  const revenue = result?.revenue || 0;
  const target = Number(campaign.revenue_target) || 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Target size={16} className="text-navy-500" /> {campaign.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}
            {state === "in_corso" && ` · mancano ${daysLeft} giorni (${timePct}% del periodo trascorso)`}
            {state === "futura" && " · non ancora iniziata"}
            {state === "conclusa" && " · conclusa"}
          </p>
          {campaign.only_new_clients && (
            <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
              <Users size={11} /> Solo clienti nuovi
            </p>
          )}
        </div>
        <button onClick={onEdit} className="text-slate-400 hover:text-navy-600" title="Modifica">
          <Pencil size={16} />
        </button>
      </div>

      {target > 0 && (
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-600">Fatturato Nuovo</span>
            <span className="font-semibold text-slate-800">
              {formatCurrency(revenue)} <span className="text-slate-400 font-normal">/ {formatCurrency(target)}</span>
              <span className="ml-1.5 text-xs text-slate-500">{Math.round((revenue / target) * 100)}%</span>
            </span>
          </div>
          <ProgressBar value={revenue} target={target} timePct={timePct} />
        </div>
      )}
      {target === 0 && (
        <p className="text-sm text-slate-600">
          Fatturato Nuovo realizzato: <span className="font-semibold">{formatCurrency(revenue)}</span>
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => {
            const done = result?.pieces?.[it.id] || 0;
            return (
              <div key={it.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 truncate pr-2">{itemLabel(it)}</span>
                  <span className="font-semibold text-slate-800 whitespace-nowrap">
                    {done} {it.pieces_target ? <span className="text-slate-400 font-normal">/ {it.pieces_target} pz</span> : "pz"}
                  </span>
                </div>
                {it.pieces_target ? <ProgressBar value={done} target={it.pieces_target} timePct={timePct} /> : null}
              </div>
            );
          })}
        </div>
      )}

      {timePct != null && (
        <p className="text-[11px] text-slate-400">
          La linea grigia sulla barra indica il tempo trascorso: se la barra colorata è oltre, siete in linea con l'obiettivo.
        </p>
      )}

      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium text-navy-600 hover:text-navy-700 flex items-center gap-1"
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Contratti conteggiati ({result?.contracts?.length || 0})
        </button>
        {open && (
          <div className="mt-2 overflow-x-auto">
            {(result?.contracts || []).length === 0 ? (
              <p className="text-xs text-slate-400">Nessun contratto ancora.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-2 font-medium">Data</th>
                    <th className="py-1.5 pr-2 font-medium">Cliente</th>
                    <th className="py-1.5 pr-2 font-medium">Prodotto</th>
                    <th className="py-1.5 pr-2 font-medium">Tipo</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Quota Nuovo</th>
                    <th className="py-1.5 font-medium">Op.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.contracts.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(c.start_date)}</td>
                      <td className="py-1.5 pr-2">
                        {c.contacts?.first_name} {c.contacts?.last_name || ""}
                        {c.contacts?.company ? <span className="text-slate-400"> · {c.contacts.company}</span> : null}
                      </td>
                      <td className="py-1.5 pr-2">{c.products?.name || c.product_lines?.name || "—"}</td>
                      <td className="py-1.5 pr-2">{c.contract_type === "nuovo" ? "Nuovo" : "Rinnovo (eccedenza)"}</td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatCurrency(nuovoAmount(c))}</td>
                      <td className="py-1.5">{operators.find((o) => o.id === c.operator_id)?.initials || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
