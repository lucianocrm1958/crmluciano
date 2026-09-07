import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";

export default function OperatorsList({ items, onChange }) {
  const [adding, setAdding] = useState(false);
  const [newInitials, setNewInitials] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editInitials, setEditInitials] = useState("");
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  function cleanInitials(value) {
    return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  }

  async function handleAdd() {
    const initials = cleanInitials(newInitials);
    if (initials.length !== 2) {
      setError("Le iniziali devono essere esattamente 2 lettere.");
      return;
    }
    setBusyId("new");
    setError(null);
    const { error: err } = await supabase.from("operators").insert({ initials, name: newName.trim() || null });
    setBusyId(null);
    if (err) {
      setError("Errore durante l'aggiunta: " + err.message);
      return;
    }
    setNewInitials("");
    setNewName("");
    setAdding(false);
    onChange();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditInitials(item.initials);
    setEditName(item.name || "");
  }

  async function handleSaveEdit(id) {
    const initials = cleanInitials(editInitials);
    if (initials.length !== 2) {
      setError("Le iniziali devono essere esattamente 2 lettere.");
      return;
    }
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase
      .from("operators")
      .update({ initials, name: editName.trim() || null })
      .eq("id", id);
    setBusyId(null);
    if (err) {
      setError("Errore durante il salvataggio: " + err.message);
      return;
    }
    setEditingId(null);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questo operatore? Gli appuntamenti/follow-up già assegnati resteranno, ma senza etichetta.")) return;
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.from("operators").delete().eq("id", id);
    setBusyId(null);
    if (err) {
      setError("Non sono riuscito a eliminare l'operatore.");
      return;
    }
    onChange();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {error && <div className="bg-rose-50 border-b border-rose-200 text-rose-700 text-xs px-4 py-2">{error}</div>}
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
            {editingId === item.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  className="input w-16 text-center font-semibold uppercase"
                  value={editInitials}
                  maxLength={2}
                  onChange={(e) => setEditInitials(cleanInitials(e.target.value))}
                  autoFocus
                />
                <input
                  className="input flex-1"
                  placeholder="Nome (facoltativo)"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <button onClick={() => handleSaveEdit(item.id)} disabled={busyId === item.id} className="text-emerald-600 hover:text-emerald-700">
                  {busyId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="w-8 h-8 rounded-full bg-navy-50 text-navy-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {item.initials}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{item.name || "—"}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(item)} className="text-slate-300 hover:text-navy-500 p-1">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} disabled={busyId === item.id} className="text-slate-300 hover:text-rose-500 p-1">
                    {busyId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">Nessun operatore ancora.</div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100">
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              className="input w-16 text-center font-semibold uppercase"
              placeholder="XX"
              value={newInitials}
              maxLength={2}
              onChange={(e) => setNewInitials(cleanInitials(e.target.value))}
              autoFocus
            />
            <input
              className="input flex-1"
              placeholder="Nome (facoltativo)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button onClick={handleAdd} disabled={busyId === "new"} className="text-emerald-600 hover:text-emerald-700">
              {busyId === "new" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
            <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium">
            <Plus size={14} /> Aggiungi operatore
          </button>
        )}
      </div>
    </div>
  );
}
