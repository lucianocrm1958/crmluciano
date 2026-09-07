import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Loader2, Phone, Mail, Building2, Upload } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import ContactForm from "../components/ContactForm";
import ImportContacts from "../components/ImportContacts";
import { formatCurrency } from "../lib/format";

export default function Contatti() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { professionalCategories, leadSources, pipelineStages } = useSettings();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterStatus, setFilterStatus] = useState("attivo");

  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  async function loadContacts() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, company, phone, email, notes, status, estimated_value, professional_category_id, lead_source_id, pipeline_stage_id, professional_categories(name), lead_sources(name), pipeline_stages(name, color)"
      )
      .order("created_at", { ascending: false });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare i contatti.");
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id && contacts.length > 0) {
      const found = contacts.find((c) => c.id === id);
      if (found) {
        setEditingContact(found);
        setFormOpen(true);
        searchParams.delete("id");
        setSearchParams(searchParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterCategory && c.professional_category_id !== filterCategory) return false;
      if (filterSource && c.lead_source_id !== filterSource) return false;
      if (filterStage && c.pipeline_stage_id !== filterStage) return false;
      if (term) {
        const haystack = [c.first_name, c.last_name, c.company, c.email, c.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, filterCategory, filterSource, filterStage, filterStatus]);

  function openNew() {
    setEditingContact(null);
    setFormOpen(true);
  }

  function openEdit(contact) {
    setEditingContact(contact);
    setFormOpen(true);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Contatti</h1>
          <p className="text-sm text-slate-500">{filtered.length} contatti trovati</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> Nuovo contatto
        </button>
      </div>

      <div className="flex justify-end -mt-2">
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium"
        >
          <Upload size={13} /> Importa da Excel
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Cerca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input max-w-[200px]"
        />
        <select className="input max-w-[180px]" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {professionalCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input max-w-[180px]" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">Tutte le fonti</option>
          {leadSources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className="input max-w-[180px]" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
          <option value="">Tutte le fasi</option>
          {pipelineStages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className="input max-w-[150px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="attivo">Attivi</option>
          <option value="perso">Persi</option>
          <option value="">Tutti</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={18} /> Caricamento contatti...
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessun contatto trovato con questi filtri.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Nome</span>
            <span>Contatti</span>
            <span>Categoria</span>
            <span>Fonte</span>
            <span>Fase / Valore</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => openEdit(c)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-1 md:gap-2 px-4 py-3 hover:bg-navy-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {c.first_name} {c.last_name || ""}
                  </p>
                  {c.company && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Building2 size={11} /> {c.company}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  {c.phone && (
                    <p className="flex items-center gap-1">
                      <Phone size={11} /> {c.phone}
                    </p>
                  )}
                  {c.email && (
                    <p className="flex items-center gap-1">
                      <Mail size={11} /> {c.email}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-500">{c.professional_categories?.name || "—"}</div>
                <div className="text-xs text-slate-500">{c.lead_sources?.name || "—"}</div>
                <div className="text-xs">
                  {c.status === "perso" ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-medium">
                      Perso
                    </span>
                  ) : (
                    <span
                      className="inline-block px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: (c.pipeline_stages?.color || "#8C8C8C") + "1A",
                        color: c.pipeline_stages?.color || "#8C8C8C",
                      }}
                    >
                      {c.pipeline_stages?.name || "Nessuna fase"}
                    </span>
                  )}
                  {c.estimated_value ? (
                    <span className="block text-slate-400 mt-0.5">{formatCurrency(c.estimated_value)}</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {formOpen && (
        <ContactForm
          contact={editingContact}
          onClose={() => setFormOpen(false)}
          onSaved={loadContacts}
          onDeleted={loadContacts}
        />
      )}

      {importOpen && (
        <ImportContacts onClose={() => setImportOpen(false)} onImported={loadContacts} />
      )}
    </div>
  );
}
