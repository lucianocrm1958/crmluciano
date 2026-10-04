import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";

// Gestione dei prodotti specifici (es. il nome della banca dati venduta),
// raggruppati per linea di prodotto.
export default function ProductsList({ products, productLines, onChange }) {
  const [addingLineId, setAddingLineId] = useState(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function handleAdd(lineId) {
    if (!newName.trim()) return;
    setBusyId("new");
    setError(null);
    const { error: err } = await supabase
      .from("products")
      .insert({ name: newName.trim(), product_line_id: lineId });
    setBusyId(null);
    if (err) {
      setError("Errore durante l'aggiunta: " + err.message);
      return;
    }
    setNewName("");
    setAddingLineId(null);
    onChange();
  }

  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.from("products").update({ name: editName.trim() }).eq("id", id);
    setBusyId(null);
    if (err) {
      setError("Errore durante il salvataggio: " + err.message);
      return;
    }
    setEditingId(null);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questo prodotto? I contratti già registrati resteranno, ma senza prodotto specifico.")) return;
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.from("products").delete().eq("id", id);
    setBusyId(null);
    if (err) {
      setError("Errore durante l'eliminazione: " + err.message);
      return;
    }
    onChange();
  }

  if (productLines.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Prima aggiungi almeno una linea di prodotto nella scheda "Linee di prodotto".
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Per ogni linea di prodotto inserisci i prodotti specifici che vendi (es. il nome di ogni banca dati con AI).
        Compariranno come menu nei Contratti e negli esiti positivi degli Appuntamenti.
      </p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {productLines.map((line) => {
        const items = products.filter((p) => p.product_line_id === line.id);
        return (
          <div key={line.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-sm font-semibold text-navy-700">
                {line.name} <span className="text-xs font-normal text-slate-400">· {items.length}</span>
              </p>
              {addingLineId !== line.id && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingLineId(line.id);
                    setNewName("");
                  }}
                  className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700 font-medium"
                >
                  <Plus size={13} /> Aggiungi
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {items.length === 0 && addingLineId !== line.id && (
                <p className="px-4 py-2.5 text-xs text-slate-400">Nessun prodotto specifico</p>
              )}

              {items.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  {editingId === p.id ? (
                    <>
                      <input
                        className="input flex-1"
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(p.id)}
                      />
                      <button type="button" onClick={() => handleSaveEdit(p.id)} className="text-emerald-600 p-1">
                        {busyId === p.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-slate-400 p-1">
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-slate-700">{p.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditName(p.name);
                          }}
                          className="text-slate-400 hover:text-navy-600 p-1"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={busyId === p.id}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {addingLineId === line.id && (
                <div className="flex items-center gap-2 px-4 py-2">
                  <input
                    className="input flex-1"
                    placeholder="Nome del prodotto"
                    value={newName}
                    autoFocus
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd(line.id)}
                  />
                  <button type="button" onClick={() => handleAdd(line.id)} className="text-emerald-600 p-1">
                    {busyId === "new" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button type="button" onClick={() => setAddingLineId(null)} className="text-slate-400 p-1">
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

