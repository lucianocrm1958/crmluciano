 searchNotes: true,
  status: "tutti",
  categoryId: "",
  sourceId: "",
  stageId: "",import { useMemo, useState } from "react";
import { Search, Loader2, RotateCcw, FileSpreadsheet, SlidersHorizontal } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import ContactForm from "../components/ContactForm";

// Ricerca avanzata: combina filtri pronti (categoria, fonte, fase, operatore, lista,
// città, linea/prodotto, appuntamenti) con la ricerca di una parola nelle anagrafiche
// e in tutte le note (nota del contatto, note degli appuntamenti, Storico note,
// follow-up, email). Tutti i filtri compilati devono valere insieme.

const CONTACT_FIELDS =
  "id, first_name, last_name, company, phone, landline_phone, email, address, city, notes, status, estimated_value, estimated_product_line_id, professional_category_id, lead_source_id, pipeline_stage_id, list_name, operator_id, call_outcome_id, professional_categories(name), lead_sources(name), pipeline_stages(name, color), operators(initials), call_outcomes(name)";

const PAGE = 1000;
const ID_CHUNK = 200;
const MAX_SHOWN = 300;

const EMPTY_FILTERS = {
  text: "",

  operatorId: "",
  listName: "",
  city: "",
  productLineId: "",
  productId: "",
  apptFrom: "",
  apptTo: "",
  apptResult: "",
};

// Supabase limita ogni lettura a 1000 righe: questa funzione legge pagina per pagina.
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

// Toglie i caratteri che confondono la sintassi dei filtri di Supabase.
function cleanText(t) {
  return t.replace(/[,()%*\\]/g, " ").trim();
}

// Estratto di testo attorno alla parola trovata, per mostrare "dove" è stata trovata.
function snippet(text, term) {
  if (!text) return "";
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text.slice(0, 90);
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + term.length + 50);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ") + (end < text.length ? "…" : "");
}

function intersect(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return new Set([...a].filter((x) => b.has(x)));
}

function formatShortDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function Ricerca() {
  const settings = useSettings();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState(null);
  const [matches, setMatches] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingContact, setEditingContact] = useState(null);

  const productsOfLine = useMemo(
    () => settings.products.filter((p) => !filters.productLineId || p.product_line_id === filters.productLineId),
    [settings.products, filters.productLineId]
  );

  function update(key, value) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "productLineId") next.productId = "";
      return next;
    });
  }

  const hasAnyFilter = useMemo(
    () =>
      Object.keys(EMPTY_FILTERS).some(
        (k) => k !== "searchNotes" && k !== "status" && filters[k] !== EMPTY_FILTERS[k]
      ) || filters.status !== "tutti",
    [filters]
  );

  async function runSearch(e) {
    e?.preventDefault();
    if (!hasAnyFilter) {
      setError("Imposta almeno un filtro o scrivi una parola da cercare.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const f = filters;
      const term = cleanText(f.text);
      const like = `%${term}%`;
      const found = {}; // contact_id -> elenco di "dove trovato"
      const addMatch = (id, label) => {
        if (!id) return;
        (found[id] = found[id] || []).push(label);
      };

      let idSet = null; // null = nessun vincolo per id

      // 1) Parola cercata: anagrafica + (facoltativo) tutte le note
      if (term) {
        const textIds = new Set();
        const contactHits = await fetchAll(() =>
          supabase
            .from("contacts")
            .select("id, first_name, last_name, company, email, city, notes")
            .or(
              ["first_name", "last_name", "company", "email", "city", "notes"].map((c) => `${c}.ilike.${like}`).join(",")
            )
        );
        contactHits.forEach((c) => {
          textIds.add(c.id);
          const inNote = c.notes && c.notes.toLowerCase().includes(term.toLowerCase());
          addMatch(c.id, inNote ? `Nota contatto: ${snippet(c.notes, term)}` : "Anagrafica");
        });

        if (f.searchNotes) {
          const [appts, diary, fus, emails] = await Promise.all([
            fetchAll(() =>
              supabase.from("appointments").select("contact_id, appointment_date, outcome_notes").ilike("outcome_notes", like)
            ),
            fetchAll(() => supabase.from("contact_notes").select("contact_id, created_at, body").ilike("body", like)),
            fetchAll(() => supabase.from("follow_ups").select("contact_id, due_date, note").ilike("note", like)),
            fetchAll(() =>
              supabase
                .from("contact_emails")
                .select("contact_id, sent_date, subject, body")
                .or(`subject.ilike.${like},body.ilike.${like}`)
            ),
          ]);
          appts.forEach((a) => {
            textIds.add(a.contact_id);
            addMatch(a.contact_id, `Appuntamento ${formatShortDate(a.appointment_date)}: ${snippet(a.outcome_notes, term)}`);
          });
          diary.forEach((n) => {
            textIds.add(n.contact_id);
            addMatch(n.contact_id, `Storico note ${formatShortDate(n.created_at)}: ${snippet(n.body, term)}`);
          });
          fus.forEach((n) => {
            textIds.add(n.contact_id);
            addMatch(n.contact_id, `Follow-up ${formatShortDate(n.due_date)}: ${snippet(n.note, term)}`);
          });
          emails.forEach((m) => {
            textIds.add(m.contact_id);
            const inSubject = m.subject && m.subject.toLowerCase().includes(term.toLowerCase());
            addMatch(
              m.contact_id,
              `Email ${formatShortDate(m.sent_date)}: ${snippet(inSubject ? m.subject : m.body, term)}`
            );
          });
        }
        idSet = intersect(idSet, textIds);
      }

      // 2) Linea di prodotto / prodotto specifico: contratti, esiti appuntamenti e trattative in corso
      if (f.productLineId || f.productId) {
        const prodIds = new Set();
        const contracts = await fetchAll(() => {
          let q = supabase.from("contracts").select("contact_id");
          if (f.productId) q = q.eq("product_id", f.productId);
          else q = q.eq("product_line_id", f.productLineId);
          return q;
        });
        contracts.forEach((c) => prodIds.add(c.contact_id));
        if (!f.productId) {
          const [estimated, apptLines] = await Promise.all([
            fetchAll(() => supabase.from("contacts").select("id").eq("estimated_product_line_id", f.productLineId)),
            fetchAll(() =>
              supabase.from("appointments").select("contact_id").eq("result_product_line_id", f.productLineId)
            ),
          ]);
          estimated.forEach((c) => prodIds.add(c.id));
          apptLines.forEach((a) => prodIds.add(a.contact_id));
        }
        idSet = intersect(idSet, prodIds);
      }

      // 3) Appuntamenti in un periodo e/o con un certo esito
      if (f.apptFrom || f.apptTo || f.apptResult) {
        const apptIds = new Set();
        const appts = await fetchAll(() => {
          let q = supabase.from("appointments").select("contact_id");
          if (f.apptFrom) q = q.gte("appointment_date", f.apptFrom);
          if (f.apptTo) q = q.lte("appointment_date", f.apptTo);
          if (f.apptResult) q = q.eq("result", f.apptResult);
          return q;
        });
        appts.forEach((a) => apptIds.add(a.contact_id));
        idSet = intersect(idSet, apptIds);
      }

      // 4) Lettura dei contatti con i filtri diretti dell'anagrafica
      const applyDirect = (q) => {
        if (f.status !== "tutti") q = q.eq("status", f.status);
        if (f.categoryId) q = q.eq("professional_category_id", f.categoryId);
        if (f.sourceId) q = q.eq("lead_source_id", f.sourceId);
        if (f.stageId) q = q.eq("pipeline_stage_id", f.stageId);
        if (f.operatorId) q = q.eq("operator_id", f.operatorId);
        if (cleanText(f.listName)) q = q.ilike("list_name", `%${cleanText(f.listName)}%`);
        if (cleanText(f.city)) q = q.ilike("city", `%${cleanText(f.city)}%`);
        return q;
      };

      let contacts = [];
      if (idSet !== null) {
        const ids = [...idSet].filter(Boolean);
        for (let i = 0; i < ids.length; i += ID_CHUNK) {
          const chunk = ids.slice(i, i + ID_CHUNK);
          const { data, error: err } = await applyDirect(
            supabase.from("contacts").select(CONTACT_FIELDS).in("id", chunk)
          );
          if (err) throw err;
          contacts = contacts.concat(data || []);
        }
      } else {
        contacts = await fetchAll(() => applyDirect(supabase.from("contacts").select(CONTACT_FIELDS)));
      }

      contacts.sort((a, b) =>
        `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`, "it")
      );
      setMatches(found);
      setResults(contacts);
    } catch (err) {
      console.error(err);
      setError("Ricerca non riuscita: " + (err.message || "errore sconosciuto"));
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setFilters(EMPTY_FILTERS);
    setResults(null);
    setMatches({});
    setError(null);
  }

  function exportExcel() {
    if (!results || results.length === 0) return;
    if (!window.XLSX) {
      setError("Libreria Excel non disponibile: ricarica la pagina e riprova.");
      return;
    }
    const rows = results.map((c) => ({
      Nome: c.first_name || "",
      Cognome: c.last_name || "",
      Azienda: c.company || "",
      Categoria: c.professional_categories?.name || "",
      Telefono: c.phone || "",
      "Telefono fisso": c.landline_phone || "",
      Email: c.email || "",
      Indirizzo: c.address || "",
      Città: c.city || "",
      Fonte: c.lead_sources?.name || "",
      "Fase pipeline": c.pipeline_stages?.name || "",
      Operatore: c.operators?.initials || "",
      Lista: c.list_name || "",
      Stato: c.status || "",
      "Valore stimato": c.estimated_value ?? "",
      "Dove trovato": (matches[c.id] || []).join(" | "),
    }));
    const ws = window.XLSX.utils.json_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Risultati");
    const today = new Date().toISOString().slice(0, 10);
    window.XLSX.writeFile(wb, `ricerca-crm-${today}.xlsx`);
  }

  const shown = results ? results.slice(0, MAX_SHOWN) : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-navy-700">Ricerca avanzata</h1>
        <p className="text-sm text-slate-500">
          Combina i filtri e, se vuoi, una parola da cercare anche dentro tutte le note. Valgono tutti insieme.
        </p>
      </div>

      <form onSubmit={runSearch} className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div>
          <span className="block text-xs font-medium text-slate-500 mb-1">Parola o frase da cercare</span>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder={'Es. "AI", "banca dati", "rinnovo", un cognome o un\'azienda'}
              value={filters.text}
              onChange={(e) => update("text", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
            <input
              type="checkbox"
              checked={filters.searchNotes}
              onChange={(e) => update("searchNotes", e.target.checked)}
            />
            Cerca anche nelle note di appuntamenti, Storico note, follow-up ed email
          </label>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 border-t border-slate-100 pt-3">
          <SlidersHorizontal size={13} /> Filtri
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SelectField label="Categoria professionale" value={filters.categoryId} onChange={(v) => update("categoryId", v)} options={settings.professionalCategories} />
          <SelectField label="Fonte del lead" value={filters.sourceId} onChange={(v) => update("sourceId", v)} options={settings.leadSources} />
          <SelectField label="Fase pipeline" value={filters.stageId} onChange={(v) => update("stageId", v)} options={settings.pipelineStages} />
          <SelectField
            label="Operatore del contatto"
            value={filters.operatorId}
            onChange={(v) => update("operatorId", v)}
            options={settings.operators.map((o) => ({ id: o.id, name: `${o.initials}${o.name ? ` · ${o.name}` : ""}` }))}
          />
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Nome lista (contiene)</span>
            <input className="input" value={filters.listName} onChange={(e) => update("listName", e.target.value)} placeholder="Es. Webinar ottobre" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Città (contiene)</span>
            <input className="input" value={filters.city} onChange={(e) => update("city", e.target.value)} placeholder="Es. Roma" />
          </label>
          <SelectField label="Linea di prodotto" value={filters.productLineId} onChange={(v) => update("productLineId", v)} options={settings.productLines} />
          <SelectField
            label="Prodotto specifico (venduto)"
            value={filters.productId}
            onChange={(v) => update("productId", v)}
            options={productsOfLine}
          />
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Stato trattativa</span>
            <select className="input" value={filters.status} onChange={(e) => update("status", e.target.value)}>
              <option value="tutti">Tutti</option>
              <option value="attivo">Attivi</option>
              <option value="perso">Persi</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Con appuntamento dal</span>
            <input type="date" className="input" value={filters.apptFrom} onChange={(e) => update("apptFrom", e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">al</span>
            <input type="date" className="input" value={filters.apptTo} onChange={(e) => update("apptTo", e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Esito appuntamento</span>
            <select className="input" value={filters.apptResult} onChange={(e) => update("apptResult", e.target.value)}>
              <option value="">Qualsiasi</option>
              <option value="positivo">Positivo</option>
              <option value="negativo">Negativo</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Cerca
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RotateCcw size={14} /> Azzera
          </button>
        </div>
      </form>

      {results && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-navy-700">
              {results.length} {results.length === 1 ? "contatto trovato" : "contatti trovati"}
              {results.length > MAX_SHOWN && (
                <span className="text-xs font-normal text-slate-400 ml-2">
                  (ne mostro {MAX_SHOWN}; l'Excel li contiene tutti)
                </span>
              )}
            </p>
            {results.length > 0 && (
              <button
                type="button"
                onClick={exportExcel}
                className="px-3 py-1.5 text-xs rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1.5 font-medium"
              >
                <FileSpreadsheet size={14} /> Esporta in Excel
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-400 text-center">Nessun contatto corrisponde ai criteri.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {shown.map((c) => {
                const where = matches[c.id] || [];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEditingContact(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-navy-50/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {c.first_name} {c.last_name || ""}
                          {c.company && <span className="text-xs text-slate-400 font-normal ml-1.5">{c.company}</span>}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {[c.professional_categories?.name, c.city, c.phone, c.email].filter(Boolean).join(" · ")}
                        </p>
                        {where.slice(0, 2).map((w, i) => (
                          <p key={i} className="text-xs text-slate-600 bg-amber-50/70 rounded px-1.5 py-0.5 mt-1 truncate">
                            {w}
                          </p>
                        ))}
                        {where.length > 2 && (
                          <p className="text-[11px] text-slate-400 mt-0.5">+ altre {where.length - 2} corrispondenze</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        {c.pipeline_stages?.name && (
                          <span
                            className="inline-block text-[11px] px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: c.pipeline_stages.color || "#64748B" }}
                          >
                            {c.pipeline_stages.name}
                          </span>
                        )}
                        <p className="text-[11px] text-slate-400">
                          {[c.operators?.initials, c.status === "perso" ? "Perso" : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editingContact && (
        <ContactForm
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onSaved={() => runSearch()}
          onDeleted={() => runSearch()}
        />
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tutti</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
