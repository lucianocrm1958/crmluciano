import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import { logActivity } from "../lib/activityLog";
import Modal from "./Modal";
import AppointmentForm from "./AppointmentForm";
import { Loader2 } from "lucide-react";

// Registra l'esito di una chiamata fatta da un follow-up, senza uscire dalla pagina Follow-up.
// Al salvataggio:
//  - l'esito viene scritto sul contatto (lo stesso campo "Esito chiamata" della scheda contatto,
//    quindi lo vedono anche Contatti, Ricerca e Monitoraggio operatori);
//  - nel diario note del contatto viene aggiunta una riga datata con esito, nota e operatore;
//  - il follow-up viene segnato come completato;
//  - a scelta: si crea un nuovo follow-up per richiamare, oppure si apre subito il modulo
//    per fissare l'appuntamento con contatto e operatore già selezionati; in questo caso
//    l'esito viene registrato solo al salvataggio dell'appuntamento e il contatto passa
//    alla fase "Appuntamento fissato".

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Suggerisce il passo successivo in base al nome dell'esito scelto
// (l'operatrice può comunque cambiarlo).
function suggestNextStep(outcomeName) {
  const name = (outcomeName || "").toLowerCase();
  if (/appuntament|fissat/.test(name)) return "appuntamento";
  if (/richiam|ricontatt|non risponde|occupat|irreperibil/.test(name)) return "richiama";
  return "chiudi";
}

export default function FollowUpOutcome({ followUp, initialNextStep, onClose, onSaved }) {
  const { callOutcomes, operators, pipelineStages } = useSettings();
  const contact = followUp.contacts || {};

  // Pulsante "Appuntamento" del follow-up: esito "appuntamento fissato" già scelto
  // (se esiste in Impostazioni → Esiti chiamata) e modulo appuntamento aperto subito.
  const quickAppointment = initialNextStep === "appuntamento";
  const presetOutcomeId = quickAppointment
    ? callOutcomes.find((o) => suggestNextStep(o.name) === "appuntamento")?.id || ""
    : "";

  const [outcomeId, setOutcomeId] = useState(presetOutcomeId);
  const [operatorId, setOperatorId] = useState(followUp.operator_id || "");
  const [note, setNote] = useState("");
  const [nextStep, setNextStep] = useState(quickAppointment ? "appuntamento" : "chiudi");
  const [callbackDate, setCallbackDate] = useState(tomorrow());
  const [callbackTime, setCallbackTime] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [appointmentOpen, setAppointmentOpen] = useState(quickAppointment && !!presetOutcomeId);
  const appointmentSavedRef = useRef(false);

  // Monitoraggio: registra l'apertura dell'esito follow-up (chi, quando, quale contatto).
  useEffect(() => {
    logActivity("scheda", { source: "follow-up", contactId: followUp.contact_id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUp.id]);

  function chooseOutcome(id) {
    setOutcomeId(id);
    const name = callOutcomes.find((o) => o.id === id)?.name;
    setNextStep(suggestNextStep(name));
  }

  function validate() {
    if (!outcomeId) {
      setError("Scegli l'esito della chiamata.");
      return false;
    }
    if (nextStep === "richiama" && !callbackDate) {
      setError("Indica il giorno in cui richiamare.");
      return false;
    }
    return true;
  }

  // Scrive esito, nota nel diario e chiusura del follow-up (più l'eventuale richiamo).
  // Se è stato appena fissato un appuntamento, il contatto passa anche alla fase
  // "Appuntamento fissato" (solo se era ancora in una fase iniziale).
  async function writeOutcome({ appointmentFixed = false } = {}) {
    const outcomeName = callOutcomes.find((o) => o.id === outcomeId)?.name || "";

    // 1. Esito sul contatto. Come nella scheda contatto: se il contatto non ha ancora una
    //    fase o è in "Nuovo contatto", passa a "Chiamata TMK".
    const contactUpdate = { call_outcome_id: outcomeId, updated_at: new Date().toISOString() };
    const tmkStage = pipelineStages.find((s) => /tmk/i.test(s.name));
    const newStage = pipelineStages.find((s) => /nuovo/i.test(s.name));
    const apptStage = pipelineStages.find((s) => /appuntament/i.test(s.name));
    const currentStage = contact.pipeline_stage_id || null;
    const isEarly = !currentStage || (newStage && currentStage === newStage.id);
    const isBeforeAppointment = isEarly || (tmkStage && currentStage === tmkStage.id);
    if (appointmentFixed && apptStage && isBeforeAppointment) {
      contactUpdate.pipeline_stage_id = apptStage.id;
    } else if (tmkStage && isEarly) {
      contactUpdate.pipeline_stage_id = tmkStage.id;
    }

    // 2. Riga nel diario note del contatto.
    let body = `Esito chiamata: ${outcomeName}`;
    if (note.trim()) body += ` — ${note.trim()}`;
    if (nextStep === "richiama") {
      const [y, m, d] = callbackDate.split("-");
      body += ` (da richiamare il ${d}/${m}/${y}${callbackTime ? ` alle ${callbackTime}` : ""})`;
    }
    if (appointmentFixed) body += " (appuntamento fissato dal follow-up)";

    // Le scritture sono indipendenti tra loro: vengono inviate tutte insieme.
    const writes = [
      supabase.from("contacts").update(contactUpdate).eq("id", followUp.contact_id),
      supabase.from("contact_notes").insert({
        contact_id: followUp.contact_id,
        body,
        operator_id: operatorId || null,
        source: "followup",
      }),
      // 3. Il follow-up chiamato è fatto.
      supabase.from("follow_ups").update({ status: "completato" }).eq("id", followUp.id),
    ];
    // 4. Eventuale nuovo follow-up per richiamare.
    if (nextStep === "richiama") {
      writes.push(
        supabase.from("follow_ups").insert({
          contact_id: followUp.contact_id,
          due_date: callbackDate,
          due_time: callbackTime || null,
          note: callbackNote.trim() || `Richiamare (${outcomeName})`,
          status: "aperto",
          operator_id: operatorId || null,
        })
      );
    }
    const results = await Promise.all(writes);
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
    window.dispatchEvent(new Event("followup-alerts-refresh"));
  }

  async function handleSave() {
    if (!validate()) return;
    setError(null);

    // Appuntamento: si apre SUBITO il modulo con contatto e operatore già compilati.
    // Esito e chiusura del follow-up vengono salvati solo quando l'appuntamento è salvato;
    // se l'operatrice annulla, torna qui senza che nulla sia stato registrato.
    if (nextStep === "appuntamento") {
      appointmentSavedRef.current = false;
      setAppointmentOpen(true);
      return;
    }

    setSaving(true);
    try {
      await writeOutcome();
      setSaving(false);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      setSaving(false);
      setError("Salvataggio non riuscito: " + (err.message || "errore sconosciuto"));
    }
  }

  async function handleAppointmentSaved() {
    appointmentSavedRef.current = true;
    try {
      await writeOutcome({ appointmentFixed: true });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      // L'appuntamento è salvato; manca solo l'esito: si torna alla finestra dell'esito.
      setAppointmentOpen(false);
      setError(
        "Appuntamento salvato, ma l'esito non è stato registrato: " +
          (err.message || "errore sconosciuto") +
          ". Riprova scegliendo \"Chiudi il follow-up\"."
      );
      setNextStep("chiudi");
    }
  }

  if (appointmentOpen) {
    return (
      <AppointmentForm
        presetContact={{ id: followUp.contact_id, ...contact }}
        presetOperatorId={operatorId || undefined}
        onAppointmentSaved={handleAppointmentSaved}
        onClose={() => {
          // Dopo il salvataggio la chiusura la gestisce handleAppointmentSaved;
          // con "Annulla" si torna all'esito, con i dati già scelti.
          if (!appointmentSavedRef.current) setAppointmentOpen(false);
        }}
      />
    );
  }

  const fullName = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

  return (
    <Modal
      title={`Esito chiamata · ${fullName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {nextStep === "appuntamento" ? "Continua: fissa appuntamento" : "Salva esito"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {followUp.note && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            Follow-up: {followUp.note}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Esito *</label>
          <select className="input" value={outcomeId} onChange={(e) => chooseOutcome(e.target.value)}>
            <option value="">Seleziona l'esito...</option>
            {callOutcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            L'elenco degli esiti si modifica in Impostazioni → Esiti chiamata.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Operatore</label>
          <select className="input" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">—</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.initials} {o.name ? `· ${o.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Nota (facoltativa)</label>
          <textarea
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. ha chiesto di essere ricontattato dopo le 17"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">E adesso?</label>
          <div className="space-y-1.5 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="nextStep"
                checked={nextStep === "chiudi"}
                onChange={() => setNextStep("chiudi")}
              />
              Chiudi il follow-up
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="nextStep"
                checked={nextStep === "richiama"}
                onChange={() => setNextStep("richiama")}
              />
              Chiudi e programma una nuova chiamata
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="nextStep"
                checked={nextStep === "appuntamento"}
                onChange={() => setNextStep("appuntamento")}
              />
              Chiudi e fissa un appuntamento
            </label>
          </div>
        </div>

        {nextStep === "richiama" && (
          <div className="grid grid-cols-2 gap-3 bg-amber-50 rounded-lg p-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Richiamare il</label>
              <input
                type="date"
                className="input"
                value={callbackDate}
                onChange={(e) => setCallbackDate(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setCallbackDate(new Date().toLocaleDateString("sv-SE"))}
                className="text-[11px] text-navy-600 hover:underline mt-1"
              >
                Oggi
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Alle ore (avviso)</label>
              <input
                type="time"
                className="input"
                value={callbackTime}
                onChange={(e) => setCallbackTime(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Promemoria</label>
              <input
                type="text"
                className="input"
                value={callbackNote}
                onChange={(e) => setCallbackNote(e.target.value)}
                placeholder="Richiamare il cliente"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

