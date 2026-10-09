import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
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
//    per fissare l'appuntamento con il contatto già selezionato.

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

export default function FollowUpOutcome({ followUp, onClose, onSaved }) {
  const { callOutcomes, operators, pipelineStages } = useSettings();
  const contact = followUp.contacts || {};

  const [outcomeId, setOutcomeId] = useState("");
  const [operatorId, setOperatorId] = useState(followUp.operator_id || "");
  const [note, setNote] = useState("");
  const [nextStep, setNextStep] = useState("chiudi");
  const [callbackDate, setCallbackDate] = useState(tomorrow());
  const [callbackTime, setCallbackTime] = useState("");
  const [callbackNote, setCallbackNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  function chooseOutcome(id) {
    setOutcomeId(id);
    const name = callOutcomes.find((o) => o.id === id)?.name;
    setNextStep(suggestNextStep(name));
  }

  async function handleSave() {
    if (!outcomeId) {
      setError("Scegli l'esito della chiamata.");
      return;
    }
    if (nextStep === "richiama" && !callbackDate) {
      setError("Indica il giorno in cui richiamare.");
      return;
    }
    setSaving(true);
    setError(null);

    const outcomeName = callOutcomes.find((o) => o.id === outcomeId)?.name || "";

    try {
      // 1. Esito sul contatto. Come nella scheda contatto: se il contatto non ha ancora una
      //    fase o è in "Nuovo contatto", passa a "Chiamata TMK".
      const contactUpdate = { call_outcome_id: outcomeId, updated_at: new Date().toISOString() };
      const tmkStage = pipelineStages.find((s) => /tmk/i.test(s.name));
      const newStage = pipelineStages.find((s) => /nuovo/i.test(s.name));
      const currentStage = contact.pipeline_stage_id || null;
      const isEarly = !currentStage || (newStage && currentStage === newStage.id);
      if (tmkStage && isEarly) contactUpdate.pipeline_stage_id = tmkStage.id;

      const { error: contactErr } = await supabase
        .from("contacts")
        .update(contactUpdate)
        .eq("id", followUp.contact_id);
      if (contactErr) throw contactErr;

      // 2. Riga nel diario note del contatto.
      let body = `Esito chiamata: ${outcomeName}`;
      if (note.trim()) body += ` — ${note.trim()}`;
      if (nextStep === "richiama") {
        const [y, m, d] = callbackDate.split("-");
        body += ` (da richiamare il ${d}/${m}/${y}${callbackTime ? ` alle ${callbackTime}` : ""})`;
      }
      const { error: noteErr } = await supabase.from("contact_notes").insert({
        contact_id: followUp.contact_id,
        body,
        operator_id: operatorId || null,
        source: "followup",
      });
      if (noteErr) throw noteErr;

      // 3. Il follow-up chiamato è fatto.
      const { error: fuErr } = await supabase
        .from("follow_ups")
        .update({ status: "completato" })
        .eq("id", followUp.id);
      if (fuErr) throw fuErr;

      // 4. Eventuale nuovo follow-up per richiamare.
      if (nextStep === "richiama") {
        const { error: newFuErr } = await supabase.from("follow_ups").insert({
          contact_id: followUp.contact_id,
          due_date: callbackDate,
          due_time: callbackTime || null,
          note: callbackNote.trim() || `Richiamare (${outcomeName})`,
          status: "aperto",
          operator_id: operatorId || null,
        });
        if (newFuErr) throw newFuErr;
      }

      setSaving(false);
      onSaved?.();
      window.dispatchEvent(new Event("followup-alerts-refresh"));

      // 5. Appuntamento: si apre il modulo con il contatto già selezionato.
      if (nextStep === "appuntamento") {
        setAppointmentOpen(true);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setSaving(false);
      setError("Salvataggio non riuscito: " + (err.message || "errore sconosciuto"));
    }
  }

  if (appointmentOpen) {
    return (
      <AppointmentForm
        presetContact={{ id: followUp.contact_id, ...contact }}
        onClose={onClose}
        onSaved={() => {
          onSaved?.();
          onClose();
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
            {nextStep === "appuntamento" ? "Salva e fissa appuntamento" : "Salva esito"}
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
