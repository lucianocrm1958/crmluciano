import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Plus, Loader2, Trash2, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "../lib/format";

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

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("contact_emails")
      .select("id, subject, body, sent_date")
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
    if (!body.trim()) {
      setError("Incolla il testo dell'email prima di salvare.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("contact_emails").insert({
      contact_id: contactId,
      subject: subject.trim() || null,
      body: body.trim(),
      sent_date: sentDate,
    });
    setSaving(false);
    if (err) {
      console.error(err);
      setError("Salvataggio non riuscito.");
      return;
    }
    setSubject("");
    setBody("");
    setSentDate(new Date().toISOString().slice(0, 10));
    setAdding(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questa email dall'archivio?")) return;
    const { error: err } = await supabase.from("contact_emails").delete().eq("id", id);
    if (err) {
      console.error(err);
      return;
    }
    load();
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
                <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap bg-slate-50 rounded p-2">{e.body}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
