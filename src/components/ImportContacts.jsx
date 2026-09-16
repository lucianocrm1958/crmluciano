import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import Modal from "./Modal";
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";

const TARGET_FIELDS = [
  { key: "first_name", label: "Nome", required: true },
  { key: "last_name", label: "Cognome", required: false },
  { key: "company", label: "Azienda", required: false },
  { key: "phone", label: "Telefono", required: false },
  { key: "email", label: "Email", required: false },
  { key: "address", label: "Indirizzo", required: false },
  { key: "city", label: "Località", required: false },
  { key: "notes", label: "Note", required: false },
];

// Campi che, in modalità "Aggiorna", possono essere sovrascritti sui contatti già
// esistenti. Nome e Cognome servono solo per riconoscere il contatto, non vengono
// mai modificati, per evitare di alterare l'anagrafica per un refuso nel file.
const UPDATABLE_FIELDS = ["company", "phone", "email", "address", "city", "notes"];

// Normalizza un nome per il confronto: minuscolo, spazi eccedenti rimossi, accenti
// ignorati, così "Città" e "citta" o "Mario " e "mario" vengono riconosciuti uguali.
function normalizeName(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function ImportContacts({ onClose, onImported }) {
  const { leadSources, professionalCategories, pipelineStages, operators } = useSettings();

  const [mode, setMode] = useState("insert"); // "insert" | "update"
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [listName, setListName] = useState("");
  const [targetListName, setTargetListName] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [leadSourceId, setLeadSourceId] = useState("");
  const [professionalCategoryId, setProfessionalCategoryId] = useState("");
  const [pipelineStageId, setPipelineStageId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [existingContacts, setExistingContacts] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // In modalità "Aggiorna" serve sapere quali contatti esistono già (nome, cognome,
  // lista) per poterli riconoscere riga per riga nel file ricaricato.
  useEffect(() => {
    if (mode !== "update" || existingContacts.length > 0) return;
    let cancelled = false;
    setLoadingExisting(true);
    supabase
      .from("contacts")
      .select("id, first_name, last_name, list_name")
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("Non sono riuscito a caricare i contatti già presenti nel CRM.");
        } else {
          setExistingContacts(data || []);
        }
        setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, existingContacts.length]);

  const existingListNames = Array.from(
    new Set(existingContacts.map((c) => c.list_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = window.XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const json = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (json.length < 2) {
          setError("Il file sembra vuoto o senza righe di dati sotto l'intestazione.");
          setParsing(false);
          return;
        }

        const rawHeaders = json[0].map((h) => String(h).trim());
        const dataRows = json.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ""));

        setHeaders(rawHeaders);
        setRows(dataRows);

        const autoMapping = {};
        TARGET_FIELDS.forEach((field) => {
          const idx = rawHeaders.findIndex((h) => guessMatch(h, field.key));
          if (idx !== -1) autoMapping[field.key] = idx;
        });
        setMapping(autoMapping);

        setStep(2);
      } catch (err) {
        console.error(err);
        setError("Non sono riuscito a leggere il file. Controlla che sia un file Excel (.xlsx) o CSV valido.");
      } finally {
        setParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function guessMatch(header, key) {
    const h = header.toLowerCase();
    const dict = {
      first_name: ["nome", "first", "name"],
      last_name: ["cognome", "last"],
      company: ["azienda", "società", "company", "studio"],
      phone: ["telefono", "cell", "phone", "tel"],
      email: ["email", "mail", "e-mail"],
      address: ["indirizzo", "address", "via", "residenza"],
      city: ["città", "citta", "località", "localita", "comune", "city", "town"],
      notes: ["note", "notes", "annotazioni", "commento", "commenti"],
    };
    return (dict[key] || []).some((k) => h.includes(k));
  }

  const validRowCount = rows.filter((r) => {
    const idx = mapping.first_name;
    return idx !== undefined && String(r[idx] || "").trim() !== "";
  }).length;

  async function handleImport() {
    if (mapping.first_name === undefined) {
      setError("Devi abbinare almeno la colonna 'Nome'.");
      return;
    }
    if (mode === "insert") {
      await handleInsert();
    } else {
      await handleUpdate();
    }
  }

  async function handleInsert() {
    if (!leadSourceId) {
      setError("Seleziona la fonte per questa lista di contatti.");
      return;
    }
    if (!listName.trim()) {
      setError("Inserisci il nome della lista.");
      return;
    }
    setImporting(true);
    setError(null);

    const toInsert = rows
      .map((r) => {
        const get = (key) => (mapping[key] !== undefined ? String(r[mapping[key]] || "").trim() : "");
        const firstName = get("first_name");
        if (!firstName) return null;
        return {
          first_name: firstName,
          last_name: get("last_name") || null,
          company: get("company") || null,
          phone: get("phone") || null,
          email: get("email") || null,
          address: get("address") || null,
          city: get("city") || null,
          notes: get("notes") || null,
          lead_source_id: leadSourceId,
          professional_category_id: professionalCategoryId || null,
          pipeline_stage_id: pipelineStageId || null,
          list_name: listName.trim(),
          operator_id: operatorId || null,
          status: "attivo",
        };
      })
      .filter(Boolean);

    try {
      const chunkSize = 200;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error: err } = await supabase.from("contacts").insert(chunk);
        if (err) throw err;
        inserted += chunk.length;
      }
      setResult({ mode: "insert", inserted, total: toInsert.length });
      setStep(3);
      onImported?.();
    } catch (err) {
      console.error(err);
      setError("Importazione non riuscita: " + (err.message || "errore sconosciuto"));
    } finally {
      setImporting(false);
    }
  }

  // Ri-carica lo stesso file (ora con le colonne aggiunte, es. Indirizzo/Località) e
  // riconosce ogni riga tra i contatti già presenti in quella lista confrontando
  // Nome e Cognome, poi aggiorna solo i campi abbinati (senza mai creare doppioni).
  async function handleUpdate() {
    if (!targetListName) {
      setError("Seleziona a quale lista già caricata appartengono questi contatti.");
      return;
    }
    setImporting(true);
    setError(null);

    const candidatePool = existingContacts.filter((c) => c.list_name === targetListName);

    const rowsToProcess = rows
      .map((r) => {
        const get = (key) => (mapping[key] !== undefined ? String(r[mapping[key]] || "").trim() : "");
        const firstName = get("first_name");
        if (!firstName) return null;
        const lastName = get("last_name");
        const updates = {};
        UPDATABLE_FIELDS.forEach((field) => {
          const value = get(field);
          if (value) updates[field] = value;
        });
        return { firstName, lastName, updates };
      })
      .filter(Boolean);

    let updated = 0;
    let unmatched = 0;
    let ambiguous = 0;
    let skippedNoChanges = 0;

    try {
      const toApply = [];
      for (const row of rowsToProcess) {
        if (Object.keys(row.updates).length === 0) {
          skippedNoChanges += 1;
          continue;
        }
        const matches = candidatePool.filter(
          (c) =>
            normalizeName(c.first_name) === normalizeName(row.firstName) &&
            normalizeName(c.last_name) === normalizeName(row.lastName)
        );
        if (matches.length === 0) {
          unmatched += 1;
        } else if (matches.length > 1) {
          ambiguous += 1;
        } else {
          toApply.push({ id: matches[0].id, updates: row.updates });
        }
      }

      const concurrency = 10;
      for (let i = 0; i < toApply.length; i += concurrency) {
        const chunk = toApply.slice(i, i + concurrency);
        const results = await Promise.all(
          chunk.map(({ id, updates }) => supabase.from("contacts").update(updates).eq("id", id))
        );
        results.forEach(({ error: err }) => {
          if (err) console.error(err);
          else updated += 1;
        });
      }

      setResult({
        mode: "update",
        updated,
        unmatched,
        ambiguous,
        skippedNoChanges,
        total: rowsToProcess.length,
      });
      setStep(3);
      onImported?.();
    } catch (err) {
      console.error(err);
      setError("Aggiornamento non riuscito: " + (err.message || "errore sconosciuto"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Importa contatti da Excel" onClose={onClose} wide>
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-navy-700 mb-2">Cosa vuoi fare?</p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg p-3 cursor-pointer has-[:checked]:border-navy-300 has-[:checked]:bg-navy-50">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={mode === "insert"}
                  onChange={() => setMode("insert")}
                />
                <span>
                  <span className="font-medium text-slate-700 block">Carica nuovi contatti</span>
                  Aggiunge come nuovi contatti tutte le righe del file.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg p-3 cursor-pointer has-[:checked]:border-navy-300 has-[:checked]:bg-navy-50">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={mode === "update"}
                  onChange={() => setMode("update")}
                />
                <span>
                  <span className="font-medium text-slate-700 block">Aggiorna contatti già caricati</span>
                  Ricarica lo stesso file (magari con nuove colonne aggiunte, es. Indirizzo/Località) e aggiorna i
                  contatti già esistenti in una lista, riconoscendoli per Nome e Cognome — senza creare doppioni.
                </span>
              </label>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Carica un file Excel (.xlsx) o CSV. Nella schermata successiva potrai abbinare le colonne del file ai
            campi del CRM.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-navy-300 hover:bg-navy-50 transition-colors">
            <Upload size={28} className="text-slate-400" />
            <span className="text-sm text-slate-600 font-medium">Clicca per scegliere un file</span>
            <span className="text-xs text-slate-400">.xlsx, .xls o .csv</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
          {parsing && (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Lettura del file in corso...
            </p>
          )}
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
            <FileSpreadsheet size={16} className="text-navy-500" />
            <span className="font-medium">{fileName}</span>
            <span className="text-slate-400">· {rows.length} righe trovate</span>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <p className="text-sm font-semibold text-navy-700 mb-2">Abbina le colonne</p>
            <div className="space-y-2">
              {TARGET_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-28 flex-shrink-0">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </span>
                  <select
                    className="input"
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [field.key]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">— non importare —</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h || `Colonna ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {mode === "insert" ? (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-navy-700 mb-2">Valori comuni per tutta la lista</p>
              <div className="space-y-2">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Nome lista *</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="Es. Webinar 10/09, Fiera Milano..."
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Operatore (facoltativo)</span>
                  <select className="input" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                    <option value="">—</option>
                    {operators.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.initials} {o.name ? `· ${o.name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Fonte *</span>
                  <select className="input" value={leadSourceId} onChange={(e) => setLeadSourceId(e.target.value)}>
                    <option value="">Seleziona la fonte della campagna</option>
                    {leadSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Categoria professionale (facoltativo)</span>
                  <select
                    className="input"
                    value={professionalCategoryId}
                    onChange={(e) => setProfessionalCategoryId(e.target.value)}
                  >
                    <option value="">—</option>
                    {professionalCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Fase pipeline iniziale (facoltativo)</span>
                  <select className="input" value={pipelineStageId} onChange={(e) => setPipelineStageId(e.target.value)}>
                    <option value="">—</option>
                    {pipelineStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-navy-700 mb-2">Lista da aggiornare</p>
              {loadingExisting ? (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Caricamento contatti già presenti...
                </p>
              ) : existingListNames.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Non trovo nessuna lista già caricata (con un "Nome lista" salvato) da poter aggiornare.
                </p>
              ) : (
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Nome lista già caricata *</span>
                  <select
                    className="input"
                    value={targetListName}
                    onChange={(e) => setTargetListName(e.target.value)}
                  >
                    <option value="">Seleziona la lista...</option>
                    {existingListNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-xs text-slate-400 mt-2">
                Ogni riga del file viene abbinata a un contatto già presente in questa lista confrontando Nome e
                Cognome (senza distinguere maiuscole/accenti). Vengono aggiornati solo i campi abbinati sopra
                (es. Indirizzo, Località) e solo se compilati nel file; le righe senza corrispondenza non vengono
                toccate né duplicate.
              </p>
            </div>
          )}

          {mode === "insert" ? (
            <div className="bg-navy-50 text-navy-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 size={16} />
              {validRowCount} contatti verranno importati (righe con nome valido)
            </div>
          ) : (
            <div className="bg-navy-50 text-navy-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 size={16} />
              {validRowCount} righe verranno elaborate per l'aggiornamento
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Indietro
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validRowCount === 0}
              className="px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {importing && <Loader2 size={14} className="animate-spin" />}
              {importing
                ? mode === "insert"
                  ? "Importazione..."
                  : "Aggiornamento..."
                : mode === "insert"
                ? `Importa ${validRowCount} contatti`
                : `Aggiorna ${validRowCount} righe`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && result.mode === "insert" && (
        <div className="text-center py-6 space-y-3">
          <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
          <p className="text-lg font-semibold text-navy-700">Importazione completata</p>
          <p className="text-sm text-slate-500">
            {result.inserted} contatti su {result.total} sono stati aggiunti correttamente.
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700"
          >
            Chiudi
          </button>
        </div>
      )}

      {step === 3 && result && result.mode === "update" && (
        <div className="text-center py-6 space-y-3">
          <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
          <p className="text-lg font-semibold text-navy-700">Aggiornamento completato</p>
          <p className="text-sm text-slate-500">{result.updated} contatti aggiornati correttamente.</p>
          {(result.unmatched > 0 || result.ambiguous > 0) && (
            <div className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-left max-w-sm mx-auto flex gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                {result.unmatched > 0 && (
                  <>
                    {result.unmatched} righe senza un contatto corrispondente in questa lista (nome/cognome non
                    trovati).
                    <br />
                  </>
                )}
                {result.ambiguous > 0 && (
                  <>{result.ambiguous} righe scartate perché più contatti hanno lo stesso nome e cognome.</>
                )}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 text-sm rounded-lg bg-navy-600 text-white hover:bg-navy-700"
          >
            Chiudi
          </button>
        </div>
      )}
    </Modal>
  );
}
