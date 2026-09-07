import { useState } from "react";
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
];

export default function ImportContacts({ onClose, onImported }) {
  const { leadSources, professionalCategories, pipelineStages } = useSettings();

  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [leadSourceId, setLeadSourceId] = useState("");
  const [professionalCategoryId, setProfessionalCategoryId] = useState("");
  const [pipelineStageId, setPipelineStageId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

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
    if (!leadSourceId) {
      setError("Seleziona la fonte per questa lista di contatti.");
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
          lead_source_id: leadSourceId,
          professional_category_id: professionalCategoryId || null,
          pipeline_stage_id: pipelineStageId || null,
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
      setResult({ inserted, total: toInsert.length });
      setStep(3);
      onImported?.();
    } catch (err) {
      console.error(err);
      setError("Importazione non riuscita: " + (err.message || "errore sconosciuto"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Importa contatti da Excel" onClose={onClose} wide>
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Carica un file Excel (.xlsx) o CSV con l'elenco dei nominativi di una campagna. Nella schermata
            successiva potrai abbinare le colonne del file ai campi del CRM.
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

          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-navy-700 mb-2">Valori comuni per tutta la lista</p>
            <div className="space-y-2">
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

          <div className="bg-navy-50 text-navy-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle2 size={16} />
            {validRowCount} contatti verranno importati (righe con nome valido)
          </div>

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
              {importing ? "Importazione..." : `Importa ${validRowCount} contatti`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
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
    </Modal>
  );
}
