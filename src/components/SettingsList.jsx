import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Plus, Pencil, Trash2, Check, X, Loader2, ChevronUp, ChevronDown } from "lucide-react";

// Componente riutilizzabile per gestire le liste di configurazione
// (fonti, categorie, prodotti, motivi persi, fasi pipeline)
export default function SettingsList({ table, items, onChange, withColor = false, withOrder = false }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#1F3864");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#1F3864");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusyId("new");
    setError(null);
    const payload = { name: newName.trim() };
    if (withColor) payload.color = newColor;
    if (withOrder) payload.order_index = items.length + 1;
    const { error: err } = await supabase.from(table).insert(payload);
    setBusyId(null);
    if (err) {
      setError("Errore durante l'aggiunta: " + err.message);
      return;
    }
    setNewName("");
    setNewColor("#1F3864");
    setAdding(false);
    onChange();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color || "#1F3864");
  }

  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    setBusyId(id);
    setError(null);
    const payload = { name: editName.trim() };
    if (withColor) payload.color = editColor;
    const { error: err } = await supabase.from(table).update(payload).eq("id", id);
    setBusyId(null);
    if (err) {
      setError("Errore durante il salvataggio: " + err.message);
      return;
    }
    setEditingId(null);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questo elemento? Se è già in uso su qualche contatto, l'eliminazione verrà bloccata.")) return;
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.from(table).delete().eq("id", id);
    setBusyId(null);
    if (err) {
      setError("Questo elemento è in uso e non può essere eliminato. Rimuovilo prima dai contatti collegati.");
      return;
    }
    onChange();
  }

  async function moveItem(item, direction) {
    const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex((i) => i.id === item.id);
    const swapWith = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!swapWith) return;
    setBusyId(item.id);
    await supabase.from(table).update({ order_index: swapWith.order_index }).eq("id", item.id);
    await supabase.from(table).update({ order_index: item.order_index }).eq("id", swapWith.id);
    setBusyId(null);
    onChange();
  }

  const sortedItems = withOrder ? [...items].sort((a, b) => a.order_index - b.order_index) : items;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-700 text-xs px-4 py-2">{error}</div>
      )}
      <div className="divide-y divide-slate-100">
        {sortedItems.map((item, idx) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
            {editingId === item.id ? (
              <div className="flex items-center gap-2 flex-1">
                {withColor && (
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                  />
                )}
                <input
                  className="input flex-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
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
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {withColor && (
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color || "#8C8C8C" }} />
                  )}
                  <span className="text-sm text-slate-700 truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {withOrder && (
                    <>
                      <button
                        onClick={() => moveItem(item, "up")}
                        disabled={idx === 0 || busyId === item.id}
                        className="text-slate-300 hover:text-navy-500 disabled:opacity-30"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        onClick={() => moveItem(item, "down")}
                        disabled={idx === sortedItems.length - 1 || busyId === item.id}
                        className="text-slate-300 hover:text-navy-500 disabled:opacity-30"
                      >
                        <ChevronDown size={15} />
                      </button>
                    </>
                  )}
                  <button onClick={() => startEdit(item)} className="text-slate-300 hover:text-navy-500 p-1">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={busyId === item.id}
                    className="text-slate-300 hover:text-rose-500 p-1"
                  >
                    {busyId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100">
        {adding ? (
          <div className="flex items-center gap-2">
            {withColor && (
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
              />
            )}
            <input
              className="input flex-1"
              placeholder="Nome..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
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
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium"
          >
            <Plus size={14} /> Aggiungi
          </button>
        )}
      </div>
    </div>
  );
}
