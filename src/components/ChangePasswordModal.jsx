import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Modal from "./Modal";
import { Loader2, CheckCircle2 } from "lucide-react";

// Permette a chi è collegato di cambiare la propria password, direttamente dal CRM.
export default function ChangePasswordModal({ onClose }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le due password non coincidono.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      console.error(err);
      setError("Non sono riuscito a cambiare la password: " + (err.message || "errore sconosciuto"));
      return;
    }
    setDone(true);
  }

  return (
    <Modal title="Cambia password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={18} /> Password cambiata. Dal prossimo accesso userai quella nuova.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700">
              Chiudi
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Nuova password (almeno 8 caratteri)</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Ripeti la nuova password</span>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
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
              Salva password
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
