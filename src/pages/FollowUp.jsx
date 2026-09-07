import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Mail, CheckCircle2, Circle, Building2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import FollowUpForm from "../components/FollowUpForm";
import { formatDate } from "../lib/format";

export default function FollowUp() {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState(null);

  async function loadFollowUps() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("follow_ups")
      .select("id, due_date, note, status, contact_id, contacts(first_name, last_name, company, email)")
      .order("due_date", { ascending: true });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare i follow-up.");
    } else {
      setFollowUps(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFollowUps();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const groups = useMemo(() => {
    const open = followUps.filter((f) => f.status === "aperto");
    return {
      scaduti: open.filter((f) => f.due_date < today),
      oggi: open.filter((f) => f.due_date === today),
      prossimi: open.filter((f) => f.due_date > today),
      completati: followUps.filter((f) => f.status === "completato"),
    };
  }, [followUps, today]);

  async function toggleComplete(f) {
    const newStatus = f.status === "aperto" ? "completato" : "aperto";
    setFollowUps((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: newStatus } : x)));
    const { error: err } = await supabase.from("follow_ups").update({ status: newStatus }).eq("id", f.id);
    if (err) {
      console.error(err);
      loadFollowUps();
    }
  }

  function openEmailDraft(f, provider) {
    const contact = f.contacts;
    if (!contact?.email) {
      alert("Questo contatto non ha un indirizzo email registrato.");
      return;
    }
    const subject = `Follow-up: ${contact.first_name} ${contact.last_name || ""}`.trim();
    const body = `Ciao ${contact.first_name},\n\n${f.note}\n\nA presto,\n`;
    if (provider === "gmail") {
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        contact.email
      )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(url, "_blank");
    } else {
      window.location.href = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
    }
  }

  function openEdit(f) {
    setEditingFollowUp(f);
    setFormOpen(true);
  }

  function openNew() {
    setEditingFollowUp(null);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento follow-up...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Follow-up</h1>
          <p className="text-sm text-slate-500">
            {groups.scaduti.length + groups.oggi.length} da gestire ora · {groups.prossimi.length} in programma
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> Nuovo follow-up
        </button>
      </div>

      <FollowUpGroup
        title="Scaduti"
        items={groups.scaduti}
        tone="danger"
        onOpen={openEdit}
        onToggle={toggleComplete}
        onEmail={openEmailDraft}
      />
      <FollowUpGroup
        title="Oggi"
        items={groups.oggi}
        tone="warning"
        onOpen={openEdit}
        onToggle={toggleComplete}
        onEmail={openEmailDraft}
      />
      <FollowUpGroup
        title="Prossimi"
        items={groups.prossimi}
        tone="default"
        onOpen={openEdit}
        onToggle={toggleComplete}
        onEmail={openEmailDraft}
      />

      <div>
        <button
          onClick={() => setShowCompleted((s) => !s)}
          className="text-sm text-slate-400 hover:text-slate-600 font-medium"
        >
          {showCompleted ? "Nascondi" : "Mostra"} completati ({groups.completati.length})
        </button>
        {showCompleted && (
          <div className="mt-2">
            <FollowUpGroup
              title=""
              items={groups.completati}
              tone="muted"
              onOpen={openEdit}
              onToggle={toggleComplete}
              onEmail={openEmailDraft}
            />
          </div>
        )}
      </div>

      {followUps.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nessun follow-up registrato ancora.
        </div>
      )}

      {formOpen && (
        <FollowUpForm
          followUp={editingFollowUp}
          onClose={() => setFormOpen(false)}
          onSaved={loadFollowUps}
          onDeleted={loadFollowUps}
        />
      )}
    </div>
  );
}

const TONE_STYLES = {
  danger: "border-l-rose-400",
  warning: "border-l-amber-400",
  default: "border-l-navy-300",
  muted: "border-l-slate-200 opacity-60",
};

function FollowUpGroup({ title, items, tone, onOpen, onToggle, onEmail }) {
  if (items.length === 0 && title) return null;
  return (
    <div>
      {title && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {title} ({items.length})
        </p>
      )}
      <div className="space-y-2">
        {items.map((f) => (
          <div
            key={f.id}
            className={`bg-white border border-slate-200 border-l-4 ${TONE_STYLES[tone]} rounded-lg p-3 flex items-start gap-3`}
          >
            <button onClick={() => onToggle(f)} className="mt-0.5 text-slate-300 hover:text-emerald-500">
              {f.status === "completato" ? (
                <CheckCircle2 size={18} className="text-emerald-500" />
              ) : (
                <Circle size={18} />
              )}
            </button>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(f)}>
              <p className="text-sm font-medium text-slate-800">
                {f.contacts?.first_name} {f.contacts?.last_name || ""}
                {f.contacts?.company && (
                  <span className="text-xs text-slate-400 font-normal ml-1.5 inline-flex items-center gap-0.5">
                    <Building2 size={10} /> {f.contacts.company}
                  </span>
                )}
              </p>
              <p className="text-sm text-slate-600 truncate">{f.note}</p>
              <p className="text-xs text-slate-400 mt-0.5">{formatDate(f.due_date)}</p>
            </div>
            {f.contacts?.email && f.status === "aperto" && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => onEmail(f, "mailto")}
                  className="text-xs text-navy-600 hover:text-navy-700 flex items-center gap-1"
                  title="Apri con il client email predefinito (Outlook, ecc.)"
                >
                  <Mail size={13} /> Email
                </button>
                <button
                  onClick={() => onEmail(f, "gmail")}
                  className="text-xs text-slate-400 hover:text-slate-600"
                  title="Apri in Gmail"
                >
                  via Gmail
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
