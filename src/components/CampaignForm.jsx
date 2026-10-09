 import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import Modal from "./Modal";
import { Loader2, Trash2, Plus, X } from "lucide-react";

// Creazione e modifica di una campagna canvass.
// Ogni riga "prodotto" indica cosa rientra nella campagna:
//  - una linea di prodotto intera (tutti i suoi prodotti), oppure
//  - un prodotto specifico di quella linea,
// con un obiettivo facoltativo in pezzi.

function makeKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `row-${Math.random().toString(36).slice(2)}`;
}

export default function CampaignForm({ campaign, onClose, onSaved, onDeleted }) {
  const { productLines, products } = useSettings();
  const isEdit = !!campaign;

  const [name, setName] = useState(campaign?.name || "");
  const [startDate, setStartDate] = useState(campaign?.start_date || new Date().toLocaleDateString("sv-SE"));
  const [endDate, setEndDate] = useState(campaign?.end_date || "");
  const [revenueTarget, setRevenueTarget] = useState(campaign?.revenue_target ?? "");
  const [onlyNewClients, setOnlyNewClients] = useState(!!campaign?.only_new_clients);
  const [notes, setNotes] = useState(campaign?.notes || "");
  const [rows, setRows] = useState(() =>
    (campaign?.campaign_items || []).map((it) => ({
      key: makeKey(),
      productLineId: it.product_line_id || "",
      productId: it.product_id || "",
      piecesTarget: it.pieces_target ?? "",
    }))
  );

  // Tipo di obiettivo: "fatturato", "pezzi" oppure "misto" (fatturato + pezzi).
  const [goalType, setGoalType] = useState(() => {
    if (!campaign) return "fatturato";
    const hasRevenue = campaign.revenue_target != null && campaign.revenue_target !== "";
    const hasPieces = (campaign.campaign_items || []).some((it) => it.pieces_target != null);
    if (hasRevenue && hasPieces) return "misto";
    if (hasPieces) return "pezzi";
    return "fatturato";
  });
  const showRevenue = goalType !== "pezzi";
  const showPieces = goalType !== "fatturato";

  function chooseGoalType(type) {
    setGoalType(type);
    // Per gli obiettivi in pezzi serve almeno una riga prodotto: la prepariamo subito.
    if (type !== "fatturato" && rows.length === 0) {
      setRows([{ key: makeKey(), productLineId: "", productId: "", piecesTarget: "" }]);
    }
  }

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  function addRow() {
    setRows((r) => [...r, { key: makeKey(), productLineId: "", productId: "", piecesTarget: "" }]);
  }

  function updateRow(key, field, value) {
    setRows((r) =>
      r.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, [field]: value };
        if (field === "productLineId") next.productId = ""; // cambiando linea si azzera il prodotto
        return next;
      })
    );
  }

  function removeRow(key) {
    setRows((r) => r.filter((row) => row.key !== key));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Dai un nome alla campagna.");
    if (!startDate || !endDate) return setError("Indica la data di inizio e di fine.");
    if (endDate < startDate) return setError("La data di fine è precedente a quella di inizio.");
    const validRows = rows.filter((r) => r.productLineId);
    if (rows.some((r) => !r.productLineId)) return setError("In ogni riga prodotto scegli almeno la linea.");
    if (showRevenue && revenueTarget === "") {
      return setError("Inserisci l'obiettivo di fatturato Nuovo.");
    }
    if (showPieces && !validRows.some((r) => r.piecesTarget !== "")) {
      return setError("Inserisci almeno un prodotto con il numero di pezzi da raggiungere.");
    }

    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      revenue_target: !showRevenue || revenueTarget === "" ? null : Number(revenueTarget),
      only_new_clients: onlyNewClients,
      notes: notes.trim() || null,
    };

    try {
      let campaignId = campaign?.id;
      if (isEdit) {
        const { error: err } = await supabase.from("campaigns").update(payload).eq("id", campaignId);
        if (err) throw err;
        const { error: delErr } = await supabase.from("campaign_items").delete().eq("campaign_id", campaignId);
        if (delErr) throw delErr;
      } else {
        const { data, error: err } = await supabase.from("campaigns").insert(payload).select().single();
        if (err) throw err;
        campaignId = data.id;
      }

      if (validRows.length > 0) {
        const { error: itemsErr } = await supabase.from("campaign_items").insert(
          validRows.map((r) => ({
            campaign_id: campaignId,
            product_line_id: r.productLineId,
            product_id: r.productId || null,
            pieces_target: !showPieces || r.piecesTarget === "" ? null : Number(r.piecesTarget),
          }))
        );
        if (itemsErr) throw itemsErr;
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
    if (!confirm("Eliminare questa campagna? I contratti non vengono toccati.")) return;
    setDeleting(true);
    const { error: err } = await supabase.from("campaigns").delete().eq("id", campaign.id);
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
      title={isEdit ? "Modifica campagna" : "Nuova campagna"}
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
                <Trash2 size={15} /> {deleting ? "Eliminazione..." : "Elimina"}
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
              form="campaign-form"
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
      <form id="campaign-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Nome campagna *</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Canvass banche dati AI – Nov/Dic 2026"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Dal *</span>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Al *</span>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-500 mb-1.5">Tipo di obiettivo *</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["fatturato", "Fatturato"],
              ["pezzi", "Pezzi"],
              ["misto", "Fatturato + pezzi"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => chooseGoalType(value)}
                className={`text-sm px-3 py-2 rounded-lg border ${
                  goalType === value
                    ? "bg-navy-600 border-navy-600 text-white font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {showRevenue && (
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Obiettivo fatturato Nuovo (€) *</span>
          <input
            type="number"
            min="0"
            step="1"
            className="input"
            value={revenueTarget}
            onChange={(e) => setRevenueTarget(e.target.value)}
            placeholder="Es. 50000"
          />
        </label>
        )}

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={onlyNewClients}
            onChange={(e) => setOnlyNewClients(e.target.checked)}
          />
          <span>
            Conta solo i <strong>clienti nuovi</strong>
            <span className="block text-xs text-slate-400">
              Esclude chi aveva già un contratto prima dell'inizio della campagna.
            </span>
          </span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-500">
              {showPieces ? "Prodotti e pezzi da raggiungere *" : "Prodotti della campagna"}
            </span>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-700"
            >
              <Plus size={13} /> Aggiungi prodotto
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
              Nessun prodotto indicato: il fatturato conterà tutti i contratti del periodo. Aggiungi un prodotto
              per limitare la campagna a quello.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const lineProducts = products.filter((p) => p.product_line_id === row.productLineId);
                return (
                  <div key={row.key} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2">
                    <select
                      className="input col-span-12 md:col-span-4"
                      value={row.productLineId}
                      onChange={(e) => updateRow(row.key, "productLineId", e.target.value)}
                    >
                      <option value="">Linea di prodotto...</option>
                      {productLines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={`input col-span-12 ${showPieces ? "md:col-span-4" : "md:col-span-7"}`}
                      value={row.productId}
                      onChange={(e) => updateRow(row.key, "productId", e.target.value)}
                      disabled={!row.productLineId}
                    >
                      <option value="">Tutti i prodotti della linea</option>
                      {lineProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {showPieces && (
                      <input
                        type="number"
                        min="0"
                        className="input col-span-10 md:col-span-3"
                        value={row.piecesTarget}
                        onChange={(e) => updateRow(row.key, "piecesTarget", e.target.value)}
                        placeholder="N. pezzi"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className={`${showPieces ? "col-span-2" : "col-span-12 justify-end"} md:col-span-1 text-slate-400 hover:text-rose-500 flex md:justify-center`}
                      aria-label="Rimuovi"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            Pezzi = contratti di tipo Nuovo sul prodotto. Fatturato = quota Nuovo (compresa l'eccedenza dei rinnovi).
          </p>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Note</span>
          <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
