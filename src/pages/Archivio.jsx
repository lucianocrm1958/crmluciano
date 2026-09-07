import { useEffect, useMemo, useState } from "react";
import { Loader2, Building2, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ContactForm from "../components/ContactForm";
import { formatCurrency, formatDate } from "../lib/format";

export default function Archivio() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reasonFilter, setReasonFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  async function loadLostContacts() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, company, phone, email, notes, status, estimated_value, estimated_product_line_id, professional_category_id, lead_source_id, pipeline_stage_id, lost_reason_id, lost_date, professional_categories(name), lost_reasons(id, name)"
      )
      .eq("status", "perso")
      .order("lost_date", { ascending: false });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare l'archivio.");
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLostContacts();
  }, []);

  const reasonBreakdown = useMemo(() => {
    const map = new Map();
    contacts.forEach((c) => {
      const name = c.lost_reasons?.name || "Non specificato";
      map.set(name, (map.get(name) || 0) + 1);
    });
    const total = contacts.length || 1;
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [contacts]);

  const totalLostValue = useMemo(
    () => contacts.reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0),
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    if (!reasonFilter) return contacts;
    return contacts.filter((c) => (c.lost_reasons?.name || "Non specificato") === reasonFilter);
  }, [contacts, reasonFilter]);

  function openContact(c) {
    setEditingContact(c);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento archivio...
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
      <div>
        <h1 className="text-xl font-bold text-navy-700">Archivio trattative perse</h1>
        <p className="text-sm text-slate-500">
          {contacts.length} trattative perse · {formatCurrency(totalLostValue)} di valore stimato
        </p>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessuna trattativa persa registrata — ottimo lavoro finora.
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-navy-700 mb-3">Motivi di trattativa persa</p>
            <div className="space-y-2.5">
              {reasonBreakdown.map((r) => (
                <button
                  key={r.name}
                  onClick={() => setReasonFilter(reasonFilter === r.name ? "" : r.name)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span
                      className={`font-medium ${
                        reasonFilter === r.name ? "text-navy-700" : "text-slate-600"
                      } group-hover:text-navy-700`}
                    >
                      {r.name}
                    </span>
                    <span className="text-slate-400">
                      {r.count} · {r.pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        reasonFilter === r.name ? "bg-navy-600" : "bg-navy-300"
                      }`}
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            {reasonFilter && (
              <button
                onClick={() => setReasonFilter("")}
                className="text-xs text-navy-600 hover:text-navy-700 font-medium mt-3"
              >
                Mostra tutti i motivi
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-semibold text-navy-700">
                {reasonFilter ? `Trattative perse · ${reasonFilter}` : "Tutte le trattative perse"}
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openContact(c)}
                  className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-navy-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {c.first_name} {c.last_name || ""}
                      {c.company && (
                        <span className="text-xs text-slate-400 font-normal ml-1.5 inline-flex items-center gap-0.5">
                          <Building2 size={10} /> {c.company}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {c.professional_categories?.name || "—"} · Persa il {formatDate(c.lost_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-600">
                        {c.lost_reasons?.name || "Non specificato"}
                      </span>
                      {c.estimated_value ? (
                        <p className="text-xs text-slate-400 mt-1">{formatCurrency(c.estimated_value)}</p>
                      ) : null}
                    </div>
                    <RotateCcw size={14} className="text-slate-300" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <ContactForm
          contact={editingContact}
          onClose={() => setFormOpen(false)}
          onSaved={loadLostContacts}
          onDeleted={loadLostContacts}
        />
      )}
    </div>
  );
}
