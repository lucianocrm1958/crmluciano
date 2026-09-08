import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Modal from "./Modal";
import { Loader2, Trash2 } from "lucide-react";

export default function UnavailabilityForm({ block, initialDate, onClose, onSaved, onDeleted }) {
  const isEdit = !!block;

  const [date, setDate] = useState(block?.block_date || initialDate || "");
  const [startTime, setStartTime] = useState(block?.start_time?.slice(0, 5) || "09:00");
  const [endTime, setEndTime] = useState(block?.end_time?.slice(0, 5) || "10:00");
  const [reason, setReason] = useState(block?.reason || "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date) {
      setError("Seleziona una data.");
      return;
    }
    if (!startTime || !endTime || startTime >= endTime) {
      setError("L'orario di fine deve essere successivo a quello di inizio.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      block_date: date,
      start_time: startTime,
      end_time: endTime,
      reason: reason.trim() || null,
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase.from("unavailability_blocks").update(payload).eq("id", block.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("unavailability_blocks").insert(payload);
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
    if (!confirm("Rimuovere questo blocco di indisponibilità?")) return;
    setDeleting(true);
    const { error: err } = await supabase.from("unavailability_blocks").delete().eq("id", block.id);
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
    <Modal title={isEdit ? "Modifica indisponibilità" : "Blocca fascia oraria"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        <p className="text-xs text-slate-500">
          Segna una fascia oraria come non disponibile per appuntamenti. Sarà visibile a chiunque usi il calendario, ma non impedisce tecnicamente di inserire un appuntamento in quell'orario — resta un avviso visivo.
        </p>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Data *</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Dalle *</span>
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Alle *</span>
            <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Motivo (facoltativo)</span>
          <input
            className="input"
            placeholder="Es. Indisposizione, ferie, impegno esterno..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
                <Trash2 size={15} /> {deleting ? "Eliminazione..." : "Rimuovi blocco"}
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
              className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5"
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

