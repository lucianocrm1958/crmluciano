import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Plus, Loader2, Trash2, Mail, ChevronDown, ChevronUp, Paperclip, FileText } from "lucide-react";
import { formatDate } from "../lib/format";

// Nome del bucket di Supabase Storage dedicato agli allegati PDF delle email
// (va creato una sola volta lato Supabase insieme alla relativa policy di accesso).
const PDF_BUCKET = "email-attachments";

export default function ContactEmailLog({ contactId }) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sentDate, setSentDate] = useState(new Date().toISOString().slice(0, 10));
  const [pdfFile, setPdfFile] = useState(null);

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("contact_emails")
      .select("id, subject, body, sent_date, pdf_path")
      .eq("contact_id", contactId)
      .order("sent_date", { ascending: false });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare le email.");
    } else {
      setEmails(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function handleAdd() {
    if (!body.trim() && !pdfFile) {
      setError("Incolla il testo dell'email oppure allega il PDF prima di salvare.");
      return;
    }
    setSaving(true);
    setError(null);

    // Se è stato scelto un PDF, lo carica prima su Supabase Storage: il percorso
    // ottenuto viene poi salvato sulla riga di contact_emails (colonna pdf_path),
    // così il file resta collegato a questa email anche dopo il salvataggio.
    let pdfPath = null;
    if (pdfFile) {
      const fileExt = pdfFile.name.split(".").pop();
      const filePath = `${contactId}/${Date.now()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage.from(PDF_BUCKET).upload(filePath, pdfFile);
      if (uploadErr) {
        console.error(uploadErr);
        setSaving(false);
        setError("Caricamento del PDF non riuscito.");
        return;
      }
      pdfPath = filePath;
    }

    const { error: err } = await supabase.from("contact_emails").insert({
      contact_id: contactId,
      subject: subject.trim() || null,
      body: body.trim() || null,
      sent_date: sentDate,
      pdf_path: pdfPath,
    });
    setSaving(false);
    if (err) {
      console.error(err);
      setError("Salvataggio non riuscito.");
      return;
    }
    setSubject("");
    setBody("");
    setPdfFile(null);
    setSentDate(new Date().toISOString().slice(0, 10));
    setAdding(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questa email dall'archivio?")) return;
    const emailToDelete = emails.find((e) => e.id === id);
    const { error: err } = await supabase.from("contact_emails").delete().eq("id", id);
    if (err) {
      console.error(err);
      return;
    }
    // Rimuove anche l'eventuale PDF allegato, per non lasciare file orfani nello spazio di archiviazione.
    if (emailToDelete?.pdf_path) {
      await supabase.storage.from(PDF_BUCKET).remove([emailToDelete.pdf_path]);
    }
    load();
  }

  // Genera un link temporaneo (valido 60 secondi) per aprire/scaricare il PDF allegato,
  // dato che il bucket è privato e richiede un link firmato per ogni accesso.
  async function handleOpenPdf(path) {
    const { data, error: err } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(path, 60);
    if (err) {
      console.error(err);
      setError("Non sono riuscito ad aprire il PDF.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <Mail size={13} /> Email inviate ({emails.length})
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700 font-medium"
          >
            <Plus size={13} /> Aggiungi
          </button>
        )}
      </div>

      {error && <div className="px-3 py-2 text-xs text-rose-600 bg-rose-50">{error}</div>}

      {adding && (
        <div className="p-3 space-y-2 border-b border-slate-100">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="Oggetto (facoltativo)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <input type="date" className="input" value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
          </div>
          <textarea
            className="input min-h-[90px]"
            placeholder="Incolla qui il testo dell'email inviata..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Oppure allega direttamente il PDF dell'email (facoltativo se hai già incollato il testo sopra)
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-600"
            />
            {pdfFile && (
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <Paperclip size={11} /> {pdfFile.name}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="px-3 py-1.5 text-xs rounded-lg bg-navy-600 text-white flex items-center gap-1"
            >
              {saving && <Loader2 size={12} className="animate-spin" />} Salva
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-3 text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Caricamento...
        </div>
      ) : emails.length === 0 && !adding ? (
        <div className="p-3 text-xs text-slate-400">Nessuna email archiviata per questo contatto.</div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
          {emails.map((e) => (
            <div key={e.id} className="p-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  className="flex-1 text-left flex items-center gap-1.5 min-w-0"
                >
                  {expandedId === e.id ? (
                    <ChevronUp size={13} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-slate-700 truncate">
                    {e.subject || "(senza oggetto)"}
                  </span>
                  {e.pdf_path && <Paperclip size={11} className="text-slate-400 flex-shrink-0" />}
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{formatDate(e.sent_date)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(e.id)}
                  className="text-slate-300 hover:text-rose-500 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {expandedId === e.id && (
                <div className="mt-2 space-y-2">
                  {e.body && (
                    <p className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">{e.body}</p>
                  )}
                  {e.pdf_path && (
                    <button
                      type="button"
                      onClick={() => handleOpenPdf(e.pdf_path)}
                      className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-700 font-medium"
                    >
                      <FileText size={13} /> Apri il PDF allegato
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
