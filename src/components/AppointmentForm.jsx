import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import Modal from "./Modal";
import { Loader2, Trash2, Search, UserPlus, X, MapPin } from "lucide-react";

export default function AppointmentForm({ appointment, presetContact, initialDate, onClose, onSaved, onDeleted }) {
  const { operators } = useSettings();
  const isEdit = !!appointment;

  const [selectedContact, setSelectedContact] = useState(
    appointment?.contacts
      ? { id: appointment.contact_id, ...appointment.contacts }
      : presetContact || null
  );
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickLastName, setQuickLastName] = useState("");
  const [quickCompany, setQuickCompany] = useState("");
  const [quickPhone, setQuickPhone] = useState("");

  const [date, setDate] = useState(
    appointment?.appointment_date || initialDate || new Date().toISOString().slice(0, 10)
  );
  const [time, setTime] = useState(appointment?.appointment_time?.slice(0, 5) || "09:00");
  const [mode, setMode] = useState(appointment?.mode || "presenza");
  const [address, setAddress] = useState(appointment?.address || "");
  const [status, setStatus] = useState(appointment?.status || "programmato");
  const [outcomeNotes, setOutcomeNotes] = useState(appointment?.outcome_notes || "");
  const [operatorId, setOperatorId] = useState(appointment?.operator_id || "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);

  // Autocomplete indirizzo tramite Nominatim (OpenStreetMap) — gratuito, senza chiave API.
  useEffect(() => {
    if (mode !== "presenza" || address.trim().length < 4) {
      setAddressSuggestions([]);
      return;
    }
    setSearchingAddress(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(
            address.trim()
          )}`
        );
        const results = await res.json();
        setAddressSuggestions(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error(err);
        setAddressSuggestions([]);
      } finally {
        setSearchingAddress(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [address, mode]);

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
        .select("id, first_name, last_name, company, phone, email")
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
        phone: quickPhone.trim() || null,
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
      setError("Seleziona o crea un contatto per l'appuntamento.");
      return;
    }
    if (mode === "presenza" && !address.trim()) {
      setError("Inserisci l'indirizzo per un appuntamento in presenza.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      contact_id: selectedContact.id,
      appointment_date: date,
      appointment_time: time,
      mode,
      address: mode === "presenza" ? address.trim() : null,
      status,
      outcome_notes: outcomeNotes.trim() || null,
      operator_id: operatorId || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase.from("appointments").update(payload).eq("id", appointment.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("appointments").insert(payload);
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
    if (!confirm("Eliminare questo appuntamento?")) return;
    setDeleting(true);
    const { error: err } = await supabase.from("appointments").delete().eq("id", appointment.id);
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
    <Modal title={isEdit ? "Modifica appuntamento" : "Nuovo appuntamento"} onClose={onClose} wide>
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
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : quickAddOpen ? (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  placeholder="Nome *"
                  value={quickFirstName}
                  onChange={(e) => setQuickFirstName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Cognome"
                  value={quickLastName}
                  onChange={(e) => setQuickLastName(e.target.value)}
                />
              </div>
              <input
                className="input"
                placeholder="Azienda"
                value={quickCompany}
                onChange={(e) => setQuickCompany(e.target.value)}
              />
              <input
                className="input"
                placeholder="Telefono"
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleQuickAddContact}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs rounded-lg bg-navy-600 text-white"
                >
                  Crea contatto
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-8"
                  placeholder="Cerca un contatto esistente..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                />
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
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium"
              >
                <UserPlus size={13} /> Crea un nuovo contatto al volo
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Data *</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Ora *</span>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Modalità</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" checked={mode === "presenza"} onChange={() => setMode("presenza")} /> In presenza
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" checked={mode === "online"} onChange={() => setMode("online")} /> Online
            </label>
          </div>
        </label>

        {mode === "presenza" && (
          <label className="block relative">
            <span className="block text-xs font-medium text-slate-500 mb-1">Indirizzo *</span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onFocus={() => setAddressFocused(true)}
                onBlur={() => setTimeout(() => setAddressFocused(false), 150)}
                autoComplete="off"
                placeholder="Via, numero civico, città"
              />
              {address.trim() && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Apri su mappa"
                  className="flex items-center gap-1 px-3 rounded-lg border border-slate-200 text-slate-500 hover:text-navy-600 hover:border-navy-300 text-xs whitespace-nowrap"
                >
                  <MapPin size={14} /> Mappa
                </a>
              )}
            </div>
            {searchingAddress && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <Loader2 size={12} className="animate-spin" /> Ricerca indirizzi...
              </p>
            )}
            {addressFocused && addressSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {addressSuggestions.map((s) => (
                  <button
                    type="button"
                    key={s.place_id}
                    onClick={() => {
                      setAddress(s.display_name);
                      setAddressSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-navy-50 text-xs text-slate-600"
                  >
                    {s.display_name}
                  </button>
                ))}
              </div>
            )}
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Stato</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="programmato">Programmato</option>
            <option value="svolto">Svolto</option>
            <option value="da_rifissare">Da rifissare</option>
            <option value="non_effettuato">Non effettuato</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Operatore</span>
          <select className="input" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">—</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.initials} {o.name ? `· ${o.name}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Note / esito</span>
          <textarea
            className="input min-h-[70px]"
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 disabled:opacity-50"
              >
                <Trash2 size={15} /> {deleting ? "Eliminazione..." : "Elimina appuntamento"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

