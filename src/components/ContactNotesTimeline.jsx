import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import { formatDate } from "../lib/format";
import {
  Loader2,
  MessageSquareText,
  CalendarClock,
  BellRing,
  Mail,
  StickyNote,
  Trash2,
  Plus,
  X,
} from "lucide-react";

// "Storico note" di un contatto: lo stesso riquadro compare in Contatti, Pipeline,
// Archivio, Appuntamenti e Follow-up, così chiunque apra il contatto da qualsiasi
// ambiente vede in un'unica sequenza (dalla più recente) tutto quello che è stato
// annotato: note del diario, appuntamenti con il loro esito, follow-up ed email inviate.
// Le note del diario (tabella contact_notes) si aggiungono da qui, con data e operatore,
// e non si sovrascrivono mai.

const SOURCE_LABELS = {
  contatti: "da Contatti",
  appuntamenti: "da Appuntamenti",
  followup: "da Follow-up",
};

const APPT_STATUS = {
  programmato: "Programmato",
  svolto: "Svolto",
  da_rifissare: "Da rifissare",
  non_effettuato: "Non effettuato",
};

const APPT_RESULT = { positivo: "Positivo", negativo: "Negativo", pending: "Pending" };

const KIND_STYLE = {
  nota: { icon: MessageSquareText, label: "Nota", color: "text-navy-600 bg-navy-50" },
  appuntamento: { icon: CalendarClock, label: "Appuntamento", color: "text-emerald-700 bg-emerald-50" },
  followup: { icon: BellRing, label: "Follow-up", color: "text-amber-700 bg-amber-50" },
  email: { icon: Mail, label: "Email", color: "text-sky-700 bg-sky-50" },
};

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function ContactNotesTimeline({ contactId, source = "contatti", defaultOperatorId = "" }) {
  const { operators } = useSettings();
  const [items, setItems] = useState([]);
  const [generalNote, setGeneralNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [adding, setAdding] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [newOperatorId, setNewOperatorId] = useState(defaultOperatorId || "");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    if (!contactId) return;
    setLoading(true);
    setError(null);
    const [contactRes, notesRes, apptRes, fuRes, emailRes] = await Promise.all([
      supabase.from("contacts").select("notes").eq("id", contactId).maybeSingle(),
      supabase
        .from("contact_notes")
        .select("id, body, source, created_at, operators(initials)")
        .eq("contact_id", contactId),
      supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, mode, status, result, outcome_notes, operators(initials)")
        .eq("contact_id", contactId),
      supabase
        .from("follow_ups")
        .select("id, due_date, note, status, operators(initials)")
        .eq("contact_id", contactId),
      supabase.from("contact_emails").select("id, subject, sent_date").eq("contact_id", contactId),
    ]);

    if (notesRes.error) {
      console.error(notesRes.error);
      setError(
        "Non riesco a leggere il diario note: verifica di aver eseguito la migrazione SQL su Supabase."
      );
    }
    [contactRes, apptRes, fuRes, emailRes].forEach((r) => r.error && console.error(r.error));

    const list = [];
    (notesRes.data || []).forEach((n) =>
      list.push({
        key: `n-${n.id}`,
        id: n.id,
        kind: "nota",
        sortKey: n.created_at,
        when: formatDateTime(n.created_at),
        operator: n.operators?.initials,
        meta: SOURCE_LABELS[n.source] || "",
        text: n.body,
        deletable: true,
      })
    );
    (apptRes.data || []).forEach((a) => {
      const time = a.appointment_time ? a.appointment_time.slice(0, 5) : "";
      const parts = [a.mode === "online" ? "Online" : "In presenza", APPT_STATUS[a.status] || a.status];
      if (a.result) parts.push(APPT_RESULT[a.result] || a.result);
      list.push({
        key: `a-${a.id}`,
        kind: "appuntamento",
        sortKey: `${a.appointment_date}T${a.appointment_time || "00:00"}`,
        when: `${formatDate(a.appointment_date)} ${time}`.trim(),
        operator: a.operators?.initials,
        meta: parts.join(" · "),
        text: a.outcome_notes,
      });
    });
    (fuRes.data || []).forEach((f) =>
      list.push({
        key: `f-${f.id}`,
        kind: "followup",
        sortKey: `${f.due_date}T00:00`,
        when: formatDate(f.due_date),
        operator: f.operators?.initials,
        meta: f.status === "completato" ? "Completato" : "Aperto",
        text: f.note,
      })
    );
    (emailRes.data || []).forEach((e) =>
      list.push({
        key: `e-${e.id}`,
        kind: "email",
        sortKey: `${e.sent_date}T00:00`,
        when: formatDate(e.sent_date),
        meta: "Inviata",
        text: e.subject || "(senza oggetto)",
      })
    );

    list.sort((x, y) => (x.sortKey < y.sortKey ? 1 : x.sortKey > y.sortKey ? -1 : 0));
    setItems(list);
    setGeneralNote(contactRes.data?.notes || "");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  useEffect(() => {
    if (defaultOperatorId) setNewOperatorId(defaultOperatorId);
  }, [defaultOperatorId]);

  async function handleAdd() {
    if (!newBody.trim()) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("contact_notes").insert({
      contact_id: contactId,
      body: newBody.trim(),
      operator_id: newOperatorId || null,
      source,
    });
    setSaving(false);
    if (err) {
      console.error(err);
      setError("Salvataggio della nota non riuscito: " + err.message);
      return;
    }
    setNewBody("");
    setAdding(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Eliminare questa nota dal diario?")) return;
    setDeletingId(id);
    const { error: err } = await supabase.from("contact_notes").delete().eq("id", id);
    setDeletingId(null);
    if (err) {
      console.error(err);
      setError("Eliminazione non riuscita.");
      return;
    }
    load();
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <StickyNote size={13} /> Storico note ({items.length})
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700 font-medium"
          >
            <Plus size={13} /> Aggiungi nota
          </button>
        )}
      </div>

      {error && <div className="px-3 py-2 text-xs text-rose-600 bg-rose-50">{error}</div>}

      {adding && (
        <div className="p-3 border-b border-slate-100 space-y-2 bg-white">
          <textarea
            className="input min-h-[70px]"
            placeholder="Scrivi la nota (es. esito telefonata, richiesta del cliente...)"
            value={newBody}
            autoFocus
            onChange={(e) => setNewBody(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <select
              className="input max-w-[160px]"
              value={newOperatorId}
              onChange={(e) => setNewOperatorId(e.target.value)}
            >
              <option value="">Operatore —</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.initials} {o.name ? `· ${o.name}` : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewBody("");
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1"
              >
                <X size={12} /> Annulla
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !newBody.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-navy-600 text-white disabled:opacity-50 flex items-center gap-1"
              >
                {saving && <Loader2 size={12} className="animate-spin" />} Salva nota
              </button>
            </div>
          </div>
        </div>
      )}

      {generalNote && (
        <div className="px-3 py-2 border-b border-slate-100 bg-amber-50/50">
          <p className="text-[11px] font-semibold text-slate-500 mb-0.5">Nota generale del contatto</p>
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{generalNote}</p>
        </div>
      )}

      {loading ? (
        <div className="p-3 text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Caricamento...
        </div>
      ) : items.length === 0 ? (
        <div className="p-3 text-xs text-slate-400">Nessuna nota o attività registrata per questo contatto.</div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {items.map((it) => {
            const style = KIND_STYLE[it.kind];
            const Icon = style.icon;
            const hasText = !!(it.text && it.text.trim());
            return (
              <div key={it.key} className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.color}`}>
                    <Icon size={10} /> {style.label}
                  </span>
                  <span className="text-xs font-medium text-slate-700">{it.when}</span>
                  {it.operator && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded px-1">
                      {it.operator}
                    </span>
                  )}
                  {it.meta && <span className="text-[11px] text-slate-400">· {it.meta}</span>}
                  {it.deletable && (
                    <button
                      type="button"
                      onClick={() => handleDelete(it.id)}
                      disabled={deletingId === it.id}
                      className="ml-auto text-slate-300 hover:text-rose-600"
                      title="Elimina nota"
                    >
                      {deletingId === it.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
                {hasText && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{it.text}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

