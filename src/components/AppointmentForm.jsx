import { createElement, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import Modal from "./Modal";
import { Loader2, Trash2, Search, UserPlus, X, MapPin, Plus, Phone, Mail, Clock, AlertTriangle } from "lucide-react";

// Genera una chiave locale univoca per ogni riga prodotto dell'esito positivo,
// prima ancora che venga salvata come contratto (che avrà un id vero del database).
function makeLineKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `line-${Math.random().toString(36).slice(2)}`;
}

// Costruiscono i link cliccabili per telefono ed email del contatto selezionato,
// tenuti come funzioni separate (invece che scritti direttamente dentro il JSX)
// per evitare problemi di caratteri speciali quando questo file viene copiato e
// incollato da un editor all'altro.
function buildPhoneLink(phone) {
  const scheme = String.fromCharCode(116, 101, 108, 58); // "tel:"
  return scheme + phone;
}

function buildEmailLink(email) {
  const scheme = String.fromCharCode(109, 97, 105, 108, 116, 111, 58); // "mailto:"
  return scheme + email;
}

export default function AppointmentForm({ appointment, presetContact, initialDate, onClose, onSaved, onDeleted }) {
  const { operators, callOutcomes, productLines, pipelineStages } = useSettings();
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
  const [street, setStreet] = useState(() => splitAddress(appointment?.address).street);
  const [civico, setCivico] = useState(() => splitAddress(appointment?.address).civico);
  const [status, setStatus] = useState(appointment?.status || "programmato");
  const [outcomeNotes, setOutcomeNotes] = useState(appointment?.outcome_notes || "");
  const [operatorId, setOperatorId] = useState(appointment?.operator_id || "");
  const [callOutcomeId, setCallOutcomeId] = useState(appointment?.call_outcome_id || "");
  const [result, setResult] = useState(appointment?.result || "");
  // Esito positivo: una riga per ogni prodotto venduto in questo appuntamento (es. cliente
  // che acquista contemporaneamente due prodotti diversi), ciascuna con il proprio tipo
  // (Nuovo/Rinnovo), linea di prodotto e importo. Ogni riga corrisponde a un contratto
  // collegato a questo appuntamento tramite contracts.appointment_id.
  const [resultLines, setResultLines] = useState([]);
  const [linesReady, setLinesReady] = useState(!isEdit);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);

  // Altri appuntamenti già fissati nello stesso giorno, per poterli vedere subito
  // (senza dover uscire e andare su "Appuntamenti") mentre si sceglie data e ora,
  // così è facile accorgersi se uno slot è già occupato.
  const [dayAppointments, setDayAppointments] = useState([]);
  const [loadingDayAppointments, setLoadingDayAppointments] = useState(false);

  // Fasce orarie segnate come "indisponibili" (vedi Calendario) nello stesso giorno,
  // mostrate insieme agli altri appuntamenti così anche queste si vedono subito.
  const [dayUnavailability, setDayUnavailability] = useState([]);

  // Autocomplete indirizzo tramite Nominatim (OpenStreetMap) — gratuito, senza chiave API.
  // Cerca solo su via/piazza + città: il numero civico resta sempre un campo separato,
  // così non viene mai sovrascritto da un suggerimento che non lo contiene.
  useEffect(() => {
    if (mode !== "presenza" || street.trim().length < 4) {
      setAddressSuggestions([]);
      return;
    }
    setSearchingAddress(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(
            street.trim()
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
  }, [street, mode]);

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

  // Ricarica gli appuntamenti già presenti in agenda per il giorno selezionato, per
  // poter segnalare subito eventuali orari già occupati (vedi dayAppointments sopra).
  useEffect(() => {
    if (!date) {
      setDayAppointments([]);
      return;
    }
    let cancelled = false;
    setLoadingDayAppointments(true);
    (async () => {
      let query = supabase
        .from("appointments")
        .select("id, appointment_time, mode, status, contacts(first_name, last_name, company)")
        .eq("appointment_date", date)
        .order("appointment_time", { ascending: true });
      if (isEdit && appointment?.id) {
        query = query.neq("id", appointment.id);
      }
      const { data, error: err } = await query;
      if (cancelled) return;
      if (err) {
        console.error(err);
        setDayAppointments([]);
      } else {
        setDayAppointments(data || []);
      }
      setLoadingDayAppointments(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Ricarica anche le fasce orarie segnate come "indisponibili" per lo stesso giorno
  // (vedi dayUnavailability sopra), così compaiono insieme agli altri appuntamenti.
  useEffect(() => {
    if (!date) {
      setDayUnavailability([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("unavailability_blocks")
        .select("id, start_time, end_time, reason")
        .eq("block_date", date)
        .order("start_time", { ascending: true });
      if (cancelled) return;
      if (err) {
        console.error(err);
        setDayUnavailability([]);
      } else {
        setDayUnavailability(data || []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Per un appuntamento già salvato, recupera gli eventuali contratti già collegati
  // (uno per prodotto venduto), per precompilare le righe dell'esito positivo.
  useEffect(() => {
    if (!isEdit || !appointment?.id) {
      setLinesReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("contracts")
        .select("id, contract_type, product_line_id, amount, excess_new_amount, start_date")
        .eq("appointment_id", appointment.id);
      if (cancelled) return;
      if (!err && data && data.length > 0) {
        setResultLines(
          data.map((c) => ({
            key: c.id,
            contractId: c.id,
            contractType: c.contract_type || "nuovo",
            productLineId: c.product_line_id || "",
            amount: c.amount ?? "",
            excessAmount: c.excess_new_amount ?? "",
            startDate: c.start_date || date,
          }))
        );
      } else if (!err && appointment.result === "positivo" && appointment.result_amount) {
        // Appuntamento "positivo" salvato prima dell'introduzione dei contratti collegati:
        // precompila una riga con i vecchi dati, così salvando si crea il contratto mancante.
        setResultLines([
          {
            key: makeLineKey(),
            contractId: null,
            contractType: "nuovo",
            productLineId: appointment.result_product_line_id || "",
            amount: appointment.result_amount,
            excessAmount: "",
            startDate: date,
          },
        ]);
      }
      setLinesReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando si seleziona l'esito "positivo" e non ci sono ancora righe prodotto, ne apre una vuota.
  useEffect(() => {
    if (!linesReady) return;
    if (result === "positivo" && resultLines.length === 0) {
      setResultLines([
        { key: makeLineKey(), contractId: null, contractType: "nuovo", productLineId: "", amount: "", excessAmount: "", startDate: date },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, linesReady]);

  function addResultLine() {
    setResultLines((lines) => [
      ...lines,
      { key: makeLineKey(), contractId: null, contractType: "nuovo", productLineId: "", amount: "", excessAmount: "", startDate: date },
    ]);
  }

  function removeResultLine(key) {
    setResultLines((lines) => lines.filter((l) => l.key !== key));
  }

  function updateResultLine(key, field, value) {
    setResultLines((lines) => lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

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

  // Crea, aggiorna o rimuove i contratti collegati a questo appuntamento (uno per riga
  // prodotto), in modo che gli importi dell'esito "positivo" siano sempre gli stessi
  // numeri che poi compaiono in "Contratti e fatturato" e nelle Statistiche, suddivisi
  // per Nuovo/Rinnovo e per linea di prodotto, invece di restare un dato scollegato
  // scritto solo sull'appuntamento.
  async function syncLinkedContracts(appointmentId, validLines) {
    const { data: existing, error: fetchErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("appointment_id", appointmentId);
    if (fetchErr) throw fetchErr;
    const existingIds = new Set((existing || []).map((c) => c.id));

    if (validLines.length === 0) {
      if (existingIds.size > 0) {
        const { error: delErr } = await supabase.from("contracts").delete().eq("appointment_id", appointmentId);
        if (delErr) throw delErr;
      }
      return;
    }

    const keptIds = new Set();
    for (const line of validLines) {
      const linePayload = {
        contact_id: selectedContact.id,
        appointment_id: appointmentId,
        product_line_id: line.productLineId || null,
        contract_type: line.contractType,
        amount: Number(line.amount),
        excess_new_amount:
          line.contractType === "rinnovo" && line.excessAmount !== "" ? Number(line.excessAmount) : null,
        // La decorrenza del contratto (quindi il mese in cui l'importo conta nelle Statistiche
        // come fatturato) può essere diversa dalla data dell'appuntamento: se l'utente non la
        // cambia resta uguale alla data dell'appuntamento, come prima.
        start_date: line.startDate || date,
        operator_id: operatorId || null,
      };

      if (line.contractId && existingIds.has(line.contractId)) {
        const { error: err } = await supabase.from("contracts").update(linePayload).eq("id", line.contractId);
        if (err) throw err;
        keptIds.add(line.contractId);
      } else {
        const { data, error: err } = await supabase
          .from("contracts")
          .insert({ ...linePayload, duration_months: 12 })
          .select()
          .single();
        if (err) throw err;
        keptIds.add(data.id);
      }
    }

    // Rimuove eventuali contratti relativi a righe prodotto che l'utente ha cancellato dal form.
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from("contracts").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }

    // Come quando si crea un contratto a mano: la trattativa è vinta, quindi il
    // contatto passa automaticamente sulla fase "Chiuso vinto" della pipeline.
    // Aggiorna anche il valore stimato e la linea di prodotto del contatto con i
    // dati appena inseriti nell'esito positivo: la pagina Pipeline (sia il totale
    // per fase che il riepilogo "Pipeline per linea di prodotto") legge infatti
    // questi due campi del contatto, non i contratti collegati, quindi senza
    // questo aggiornamento restava con i vecchi importi/prodotti anche dopo aver
    // registrato l'esito.
    const wonStage = pipelineStages.find((s) => s.name === "Chiuso vinto");
    if (wonStage) {
      const totalAmount = validLines.reduce((sum, l) => sum + Number(l.amount), 0);
      let topLine = null;
      for (const line of validLines) {
        if (!topLine || Number(line.amount) > Number(topLine.amount)) topLine = line;
      }
      const { error: stageErr } = await supabase
        .from("contacts")
        .update({
          pipeline_stage_id: wonStage.id,
          estimated_value: totalAmount,
          estimated_product_line_id: topLine?.productLineId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedContact.id);
      if (stageErr) console.error(stageErr);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedContact) {
      setError("Seleziona o crea un contatto per l'appuntamento.");
      return;
    }
    if (mode === "presenza" && !street.trim()) {
      setError("Inserisci l'indirizzo per un appuntamento in presenza.");
      return;
    }
    const validLines =
      status === "svolto" && result === "positivo"
        ? resultLines.filter((l) => l.amount !== "" && Number(l.amount) > 0)
        : [];
    if (status === "svolto" && result === "positivo" && validLines.length === 0) {
      setError("Inserisci almeno un importo valido per l'esito positivo.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const totalAmount = validLines.reduce((sum, l) => sum + Number(l.amount), 0);

      const payload = {
        contact_id: selectedContact.id,
        appointment_date: date,
        appointment_time: time,
        mode,
        address: mode === "presenza" ? combineAddress(street, civico) : null,
        status,
        outcome_notes: outcomeNotes.trim() || null,
        operator_id: operatorId || null,
        call_outcome_id: status === "svolto" ? null : callOutcomeId || null,
        result: status === "svolto" ? result || null : null,
        result_amount: status === "svolto" && result === "positivo" && totalAmount > 0 ? totalAmount : null,
        result_product_line_id: null,
        updated_at: new Date().toISOString(),
      };

      let appointmentId = appointment?.id || null;
      if (isEdit) {
        const { error: err } = await supabase.from("appointments").update(payload).eq("id", appointment.id);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.from("appointments").insert(payload).select().single();
        if (err) throw err;
        appointmentId = data.id;
      }

      await syncLinkedContracts(appointmentId, validLines);

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
    <Modal
      title={isEdit ? "Modifica appuntamento" : "Nuovo appuntamento"}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between">
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
              form="appointment-form"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      }
    >
      <form id="appointment-form" onSubmit={handleSubmit} className="space-y-4">
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
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {selectedContact.phone ? (
                    createElement(
                      "a",
                      {
                        href: buildPhoneLink(selectedContact.phone),
                        className: "flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700",
                      },
                      createElement(Phone, { size: 11 }),
                      " " + selectedContact.phone
                    )
                  ) : (
                    <span className="text-xs text-slate-400">Nessun telefono in anagrafica</span>
                  )}
                  {selectedContact.email &&
                    createElement(
                      "a",
                      {
                        href: buildEmailLink(selectedContact.email),
                        className: "flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700",
                      },
                      createElement(Mail, { size: 11 }),
                      " " + selectedContact.email
                    )}
                </div>
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

        {date && (
          <div className="border border-slate-200 rounded-lg p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
              <Clock size={13} /> Altri appuntamenti già fissati in questo giorno
            </span>
            {loadingDayAppointments ? (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Verifica agenda...
              </p>
            ) : dayAppointments.length === 0 ? (
              <p className="text-xs text-slate-400">Nessun altro appuntamento in programma per questo giorno.</p>
            ) : (
              <ul className="space-y-1">
                {dayAppointments.map((a) => {
                  const aTime = a.appointment_time?.slice(0, 5) || "";
                  const isConflict = aTime === time;
                  const liClassName =
                    "flex items-center justify-between gap-2 text-xs rounded-md px-2 py-1 " +
                    (isConflict ? "bg-amber-50 text-amber-700 border border-amber-200" : "text-slate-600");
                  return (
                    <li key={a.id} className={liClassName}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        {isConflict && <AlertTriangle size={12} className="flex-shrink-0" />}
                        <span className="font-medium flex-shrink-0">{aTime}</span>
                        <span className="truncate">
                          {a.contacts?.first_name} {a.contacts?.last_name || ""}
                          {a.contacts?.company ? " · " + a.contacts.company : ""}
                        </span>
                      </span>
                      <span className="text-slate-400 flex-shrink-0">
                        {a.mode === "online" ? "Online" : "In presenza"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {date && dayUnavailability.length > 0 && (
          <div className="border border-rose-200 bg-rose-50/50 rounded-lg p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-rose-700 mb-2">
              <AlertTriangle size={13} /> Fasce orarie segnate come non disponibili in questo giorno
            </span>
            <ul className="space-y-1">
              {dayUnavailability.map((u) => {
                const uStart = u.start_time?.slice(0, 5) || "";
                const uEnd = u.end_time?.slice(0, 5) || "";
                const isConflict = !!time && time >= uStart && time < uEnd;
                const liClassName =
                  "flex items-center gap-2 text-xs rounded-md px-2 py-1 " +
                  (isConflict ? "bg-rose-100 text-rose-800 border border-rose-300 font-medium" : "text-rose-700");
                return (
                  <li key={u.id} className={liClassName}>
                    {isConflict && <AlertTriangle size={12} className="flex-shrink-0" />}
                    <span className="flex-shrink-0">
                      {uStart}–{uEnd}
                    </span>
                    {u.reason && <span className="truncate">· {u.reason}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
          <div className="grid grid-cols-3 gap-3">
            <label className="block col-span-2 relative">
              <span className="block text-xs font-medium text-slate-500 mb-1">Via / Piazza, città *</span>
              <input
                className="input"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                onFocus={() => setAddressFocused(true)}
                onBlur={() => setTimeout(() => setAddressFocused(false), 150)}
                autoComplete="off"
                placeholder="Es. Via Nazionale, Roma"
              />
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
                        setStreet(s.display_name);
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
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Numero civico</span>
              <input
                className="input"
                value={civico}
                onChange={(e) => setCivico(e.target.value)}
                autoComplete="off"
                placeholder="Es. 15/A"
              />
            </label>
            {street.trim() &&
              createElement(
                "div",
                { className: "col-span-3 -mt-1" },
                createElement(
                  "a",
                  {
                    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      combineAddress(street, civico)
                    )}`,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700 font-medium",
                  },
                  createElement(MapPin, { size: 13 }),
                  " Apri su mappa"
                )
              )}
          </div>
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

        {(status === "non_effettuato" || status === "da_rifissare") && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Esito chiamata</span>
            <select className="input" value={callOutcomeId} onChange={(e) => setCallOutcomeId(e.target.value)}>
              <option value="">—</option>
              {callOutcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {status === "svolto" && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Esito appuntamento</span>
              <select className="input" value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="">—</option>
                <option value="positivo">Positivo</option>
                <option value="negativo">Negativo</option>
                <option value="pending">Pending</option>
              </select>
            </label>

            {result === "positivo" && (
              <div className="space-y-3">
                {!linesReady ? (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Caricamento prodotti collegati...
                  </p>
                ) : (
                  <>
                    <span className="block text-xs font-medium text-slate-500">
                      Prodotti venduti (una riga per ciascun prodotto, se il cliente ne acquista più di uno)
                    </span>
                    <div className="space-y-2">
                      {resultLines.map((line, idx) => (
                        <div key={line.key} className="border border-slate-200 rounded-lg p-2.5 space-y-2 bg-slate-50/60">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                              Prodotto {idx + 1}
                            </span>
                            {resultLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeResultLine(line.key)}
                                className="text-slate-300 hover:text-rose-500"
                                title="Rimuovi riga"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-1.5 text-xs text-slate-600">
                              <input
                                type="radio"
                                checked={line.contractType === "nuovo"}
                                onChange={() => updateResultLine(line.key, "contractType", "nuovo")}
                              />{" "}
                              Nuovo
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600">
                              <input
                                type="radio"
                                checked={line.contractType === "rinnovo"}
                                onChange={() => updateResultLine(line.key, "contractType", "rinnovo")}
                              />{" "}
                              Rinnovo
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="block text-[11px] text-slate-400 mb-0.5">Importo (€) *</span>
                              <input
                                type="number"
                                step="0.01"
                                className="input"
                                value={line.amount}
                                onChange={(e) => updateResultLine(line.key, "amount", e.target.value)}
                              />
                            </label>
                            <label className="block">
                              <span className="block text-[11px] text-slate-400 mb-0.5">Linea di prodotto</span>
                              <select
                                className="input"
                                value={line.productLineId}
                                onChange={(e) => updateResultLine(line.key, "productLineId", e.target.value)}
                              >
                                <option value="">—</option>
                                {productLines.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block col-span-2">
                              <span className="block text-[11px] text-slate-400 mb-0.5">
                                Decorrenza fatturato (mese in cui l'importo conta nelle Statistiche)
                              </span>
                              <input
                                type="date"
                                className="input"
                                value={line.startDate || ""}
                                onChange={(e) => updateResultLine(line.key, "startDate", e.target.value)}
                              />
                              <span className="block text-[11px] text-slate-400 mt-0.5">
                                Di norma è la data dell'appuntamento. Cambiala solo se il contratto deve essere
                                conteggiato nel fatturato di un mese diverso (es. il mese successivo): l'appuntamento
                                resterà comunque conteggiato in questo mese.
                              </span>
                            </label>
                            {line.contractType === "rinnovo" && (
                              <label className="block col-span-2">
                                <span className="block text-[11px] text-slate-400 mb-0.5">
                                  di cui quota "Nuovo" (€) — solo se l'importo supera il precedente contratto
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input"
                                  placeholder="Lascia vuoto se è un rinnovo pieno"
                                  value={line.excessAmount}
                                  onChange={(e) => updateResultLine(line.key, "excessAmount", e.target.value)}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addResultLine}
                      className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium"
                    >
                      <Plus size={13} /> Aggiungi un altro prodotto
                    </button>
                    <p className="text-xs text-slate-400">
                      Il totale delle righe viene registrato automaticamente anche in "Contratti e fatturato" (una riga
                      per ogni prodotto).
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-slate-500
