import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Modal from "./Modal";
import { Loader2, Trash2, Search, UserPlus, X } from "lucide-react";

export default function FollowUpForm({ followUp, presetContact, onClose, onSaved, onDeleted }) {
  const isEdit = !!followUp;

  const [selectedContact, setSelectedContact] = useState(
    followUp?.contacts ? { id: followUp.contact_id, ...followUp.contacts } : presetContact || null
  );
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickLastName, setQuickLastName] = useState("");
  const [quickCompany, setQuickCompany] = useState("");

  const [dueDate, setDueDate] = useState(followUp?.due_date || new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(followUp?.note || "");
  const [status, setStatus] = useState(followUp?.status || "aperto");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (contactSearch.trim().length < 2) {
      setContactResults([]);
      return;
    }
    setSearchingContacts(true);
    const t = setTimeout(async () => {
      const term = `%${contactSearch.trim()}%`;
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company, email, phone")
        .or(`first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`)
        .limit(8);
      setContactResults(data || []);
      setSearchingContacts(false);
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  async function handleQuickAddContact() {
    if (!quickFirstName.trim()) {
      setError("Inserisci almeno il nome del nuovo contatto.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contacts")
      .insert({
        first_name: quickFirstName.trim(),
        last_name: quickLastName.trim() || null,
        company: quickCompany.trim() || null,
        status: "attivo",
      })
      .select()
      .single();
    setSaving(false);
    if (err) {
      console.error(err);
      setError("Non sono riuscito a creare il contatto.");
      return;
    }
    setSelectedContact(data);
    setQuickAddOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedContact) {
      setError("Seleziona o crea un contatto per il follow-up.");
      return;
    }
    if (!note.trim()) {
      setError("Aggiungi una nota per ricordarti di cosa si tratta.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      contact_id: selectedContact.id,
      due_date: dueDate,
      note: note.trim(),
      status,
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase.from("follow_ups").update(payload).eq("id", followUp.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("follow_ups").insert(payload);
        if (err) throw err;
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Salvataggio non riuscito: " + (err.message || "errore sconosciuto"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Eliminare questo follow-up?")) return;
    setDeleting(true);
    const { error: err } = await supabase.from("follow_ups").delete().eq("id", followUp.id);
    if (err) {
      console.error(err);
      setError("Eliminazione non riuscita.");
      setDeleting(false);
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <Modal title={isEdit ? "Modifica follow-up" : "Nuovo follow-up"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        <div>
          <span className="block text-xs font-medium text-slate-500 mb-1">Contatto *</span>
          {selectedContact ? (
            <div className="flex items-center justify-between bg-navy-50 border border-navy-100 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-navy-700">
                  {selectedContact.first_name} {selectedContact.last_name || ""}
                </p>
                {selectedContact.company && <p className="text-xs text-slate-500">{selectedContact.company}</p>}
              </div>
              {!isEdit && (
                <button type="button" onClick={() => setSelectedContact(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              )}
            </div>
          ) : quickAddOpen ? (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Nome *" value={quickFirstName} onChange={(e) => setQuickFirstName(e.target.value)} />
                <input className="input" placeholder="Cognome" value={quickLastName} onChange={(e) => setQuickLastName(e.target.value)} />
              </div>
              <input className="input" placeholder="Azienda" value={quickCompany} onChange={(e) => setQuickCompany(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setQuickAddOpen(false)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600">
                  Annulla
                </button>
                <button type="button" onClick={handleQuickAddContact} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg bg-navy-600 text-white">
                  Crea contatto
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-8" placeholder="Cerca un contatto esistente..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
              </div>
              {searchingContacts && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Ricerca...
                </p>
              )}
              {contactResults.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {contactResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setSelectedContact(c);
                        setContactResults([]);
                        setContactSearch("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-navy-50 text-sm"
                    >
                      {c.first_name} {c.last_name || ""} {c.company ? `· ${c.company}` : ""}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setQuickAddOpen(true)} className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium">
                <UserPlus size={13} /> Crea un nuovo contatto al volo
              </button>
            </div>
          )}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Data promemoria *</span>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Nota *</span>
          <textarea
            className="input min-h-[70px]"
            placeholder="Es. Richiamare per proposta rinnovo banca dati"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {isEdit && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Stato</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="aperto">Aperto</option>
              <option value="completato">Completato</option>
            </select>
          </label>
        )}

        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <button type="button" onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 disabled:opacity-50">
                <Trash2 size={15} /> {deleting ? "Eliminazione..." : "Elimina"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              Annulla
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
