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
