import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Building2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ContractForm from "../components/ContractForm";
import { formatCurrency, formatDate } from "../lib/format";

export default function Contratti() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);

  async function loadContracts() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contracts")
      .select(
        "id, amount, excess_new_amount, contract_type, start_date, duration_months, contact_id, product_line_id, contacts(first_name, last_name, company), product_lines(name)"
      )
      .order("start_date", { ascending: false });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare i contratti.");
    } else {
      setContracts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadContracts();
  }, []);

  function splitNuovoRinnovo(c) {
    const amount = Number(c.amount) || 0;
    const excess = Number(c.excess_new_amount) || 0;
    if (c.contract_type === "nuovo") return { nuovo: amount, rinnovo: 0 };
    return { nuovo: excess, rinnovo: amount };
  }

  const monthlyBreakdown = useMemo(() => {
    const map = new Map();
    contracts.forEach((c) => {
      const d = new Date(c.start_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const { nuovo, rinnovo } = splitNuovoRinnovo(c);
      const entry = map.get(key) || { nuovo: 0, rinnovo: 0 };
      entry.nuovo += nuovo;
      entry.rinnovo += rinnovo;
      map.set(key, entry);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 12)
      .map(([key, val]) => ({
        key,
        label: new Date(`${key}-01`).toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
        ...val,
        totale: val.nuovo + val.rinnovo,
      }));
  }, [contracts]);

  const yearTotal = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return contracts
      .filter((c) => new Date(c.start_date).getFullYear() === currentYear)
      .reduce(
        (acc, c) => {
          const { nuovo, rinnovo } = splitNuovoRinnovo(c);
          acc.nuovo += nuovo;
          acc.rinnovo += rinnovo;
          return acc;
        },
        { nuovo: 0, rinnovo: 0 }
      );
  }, [contracts]);

  function openNew() {
    setEditingContract(null);
    setFormOpen(true);
  }

  function openEdit(c) {
    setEditingContract(c);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento contratti...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Contratti e fatturato</h1>
          <p className="text-sm text-slate-500">
            Anno in corso: {formatCurrency(yearTotal.nuovo + yearTotal.rinnovo)} · Nuovo {formatCurrency(yearTotal.nuovo)} · Rinnovo{" "}
            {formatCurrency(yearTotal.rinnovo)}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> Nuovo contratto
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <p className="text-sm font-semibold text-navy-700">Fatturato mese per mese</p>
        </div>
        {monthlyBreakdown.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">Nessun contratto registrato ancora.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="hidden md:grid grid-cols-4 gap-2 px-4 py-2 text-xs font-semibold text-slate-500 uppercase">
              <span>Mese</span>
              <span>Nuovo</span>
              <span>Rinnovo</span>
              <span>Totale</span>
            </div>
            {monthlyBreakdown.map((m) => (
              <div key={m.key} className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-2.5 text-sm">
                <span className="text-slate-700 capitalize col-span-2 md:col-span-1">{m.label}</span>
                <span className="text-navy-600">{formatCurrency(m.nuovo)}</span>
                <span className="text-gold-500">{formatCurrency(m.rinnovo)}</span>
                <span className="font-semibold text-slate-800">{formatCurrency(m.totale)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <p className="text-sm font-semibold text-navy-700">Tutti i contratti</p>
        </div>
        {contracts.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">Nessun contratto registrato ancora.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <button
                key={c.id}
                onClick={() => openEdit(c)}
                className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-navy-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {c.contacts?.first_name} {c.contacts?.last_name || ""}
                    {c.contacts?.company && (
                      <span className="text-xs text-slate-400 font-normal ml-1.5 inline-flex items-center gap-0.5">
                        <Building2 size={10} /> {c.contacts.company}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {c.product_lines?.name} · {formatDate(c.start_date)} · {c.duration_months} mesi
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(c.amount)}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.contract_type === "nuovo" ? "bg-navy-50 text-navy-600" : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {c.contract_type === "nuovo" ? "Nuovo" : "Rinnovo"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <ContractForm
          contract={editingContract}
          onClose={() => setFormOpen(false)}
          onSaved={loadContracts}
          onDeleted={loadContracts}
        />
      )}
    </div>
  );
}
