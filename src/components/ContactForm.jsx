import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Modal from "./Modal";
import ContactEmailLog from "./ContactEmailLog";
import { useSettings } from "../lib/useSettings";
import { Loader2, Trash2 } from "lucide-react";

const emptyForm = {
  first_name: "",
  last_name: "",
  company: "",
  phone: "",
  email: "",
  professional_category_id: "",
  lead_source_id: "",
  pipeline_stage_id: "",
  notes: "",
  estimated_value: "",
  estimated_product_line_id: "",
};

export default function ContactForm({ contact, onClose, onSaved, onDeleted }) {
  const { professionalCategories, leadSources, pipelineStages, productLines, lostReasons, loading: settingsLoading } =
    useSettings();

  const isEdit = !!contact;
  const [form, setForm] = useState(() =>
    contact
      ? {
          first_name: contact.first_name || "",
          last_name: contact.last_name || "",
          company: contact.company || "",
          phone: contact.phone || "",
          email: contact.email || "",
          professional_category_id: contact.professional_category_id || "",
          lead_source_id: contact.lead_source_id || "",
          pipeline_stage_id: contact.pipeline_stage_id || "",
          notes: contact.notes || "",
          estimated_value: contact.estimated_value ?? "",
          estimated_product_line_id: contact.estimated_product_line_id || "",
        }
      : emptyForm
  );
  const [status, setStatus] = useState(contact?.status || "attivo");
  const [lostReasonId, setLostReasonId] = useState(contact?.lost_reason_id || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      setError("Il nome è obbligatorio.");
      return;
    }
    if (status === "perso" && !lostReasonId) {
      setError("Seleziona un motivo per la trattativa persa.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      company: form.company.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      professional_category_id: form.professional_category_id || null,
      lead_source_id: form.lead_source_id || null,
      pipeline_stage_id: form.pipeline_stage_id || null,
      notes: form.notes.trim() || null,
      estimated_value: form.estimated_value === "" ? null : Number(form.estimated_value),
      estimated_product_line_id: form.estimated_product_line_id || null,
      status,
      lost_reason_id: status === "perso" ? lostReasonId : null,
      lost_date: status === "perso" ? (contact?.lost_date || new Date().toISOString().slice(0, 10)) : null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (isEdit) {
        const { error: err } = await supabase.from("contacts").update(payload).eq("id", contact.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("contacts").insert(payload);
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
    if (!confirm("Eliminare definitivamente questo contatto? L'operazione non è reversibile.")) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from("contacts").delete().eq("id", contact.id);
      if (err) throw err;
      onDeleted?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Eliminazione non riuscita: " + (err.message || "errore sconosciuto"));
      setDeleting(false);
    }
  }

  if (settingsLoading) {
    return (
      <Modal title={isEdit ? "Modifica contatto" : "Nuovo contatto"} onClose={onClose}>
        <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={18} /> Caricamento...
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? "Modifica contatto" : "Nuovo contatto"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome *">
            <input
              className="input"
              value={form.first_name}
              onChange={(e) => update("first_name", e.target.value)}
              required
            />
          </Field>
          <Field label="Cognome">
            <input
              className="input"
              value={form.last_name}
              onChange={(e) => update("last_name", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Azienda (lascia vuoto per privati)">
          <input className="input" value={form.company} onChange={(e) => update("company", e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefono">
            <input className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria professionale">
            <select
              className="input"
              value={form.professional_category_id}
              onChange={(e) => update("professional_category_id", e.target.value)}
            >
              <option value="">—</option>
              {professionalCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fonte">
            <select
              className="input"
              value={form.lead_source_id}
              onChange={(e) => update("lead_source_id", e.target.value)}
            >
              <option value="">—</option>
              {leadSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Fase pipeline">
          <select
            className="input"
            value={form.pipeline_stage_id}
            onChange={(e) => update("pipeline_stage_id", e.target.value)}
          >
            <option value="">—</option>
            {pipelineStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valore stimato trattativa (€)">
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.estimated_value}
              onChange={(e) => update("estimated_value", e.target.value)}
            />
          </Field>
          <Field label="Linea di prodotto (stimata)">
            <select
              className="input"
              value={form.estimated_product_line_id}
              onChange={(e) => update("estimated_product_line_id", e.target.value)}
            >
              <option value="">—</option>
              {productLines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Note">
          <textarea
            className="input min-h-[70px]"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </Field>

        {isEdit && <ContactEmailLog contactId={contact.id} />}

        <div className="border-t border-slate-100 pt-4">
          <Field label="Stato trattativa">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="radio"
                  checked={status === "attivo"}
                  onChange={() => setStatus("attivo")}
                />
                Attivo
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="radio"
                  checked={status === "perso"}
                  onChange={() => setStatus("perso")}
                />
                Perso
              </label>
            </div>
          </Field>

          {status === "perso" && (
            <div className="mt-3">
              <Field label="Motivo trattativa persa *">
                <select className="input" value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)}>
                  <option value="">Seleziona un motivo</option>
                  {lostReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 disabled:opacity-50"
              >
                <Trash2 size={15} /> {deleting ? "Eliminazione..." : "Elimina contatto"}
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
