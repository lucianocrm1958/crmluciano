import { useEffect, useMemo, useState } from "react";
import { Loader2, Building2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSettings } from "../lib/useSettings";
import ContactForm from "../components/ContactForm";
import { formatCurrency } from "../lib/format";

const CLOSED_STAGE_NAMES = ["Chiuso vinto", "Chiuso perso"];

export default function Pipeline() {
  const { pipelineStages, loading: settingsLoading } = useSettings();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  async function loadContacts() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, company, status, estimated_value, pipeline_stage_id, professional_categories(name)"
      )
      .eq("status", "attivo")
      .order("created_at", { ascending: false });
    if (err) {
      console.error(err);
      setError("Non sono riuscito a caricare la pipeline.");
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadContacts();
  }, []);

  const columns = useMemo(
    () => pipelineStages.filter((s) => s.name !== "Chiuso perso"),
    [pipelineStages]
  );

  const noStageContacts = useMemo(
    () => contacts.filter((c) => !c.pipeline_stage_id),
    [contacts]
  );

  function contactsForStage(stageId) {
    return contacts.filter((c) => c.pipeline_stage_id === stageId);
  }

  function stageValue(stageId) {
    return contactsForStage(stageId).reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);
  }

  async function moveContact(contactId, newStageId) {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage_id: newStageId } : c))
    );
    const { error: err } = await supabase
      .from("contacts")
      .update({ pipeline_stage_id: newStageId, updated_at: new Date().toISOString() })
      .eq("id", contactId);
    if (err) {
      console.error(err);
      loadContacts();
    }
  }

  function handleDrop(stageId) {
    if (draggedId) {
      moveContact(draggedId, stageId);
    }
    setDraggedId(null);
    setDragOverStage(null);
  }

  function openEdit(contact) {
    setEditingContact(contact);
    setFormOpen(true);
  }

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento pipeline...
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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-navy-700">Pipeline</h1>
        <p className="text-sm text-slate-500">Trascina i contatti tra le fasi della trattativa</p>
      </div>

      {noStageContacts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-2.5">
          {noStageContacts.length} contatti senza fase assegnata — apri il contatto e assegna una fase pipeline per vederlo qui.
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((stage) => {
          const stageContacts = contactsForStage(stage.id);
          const isOver = dragOverStage === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => handleDrop(stage.id)}
              className={`flex-shrink-0 w-72 rounded-xl border transition-colors ${
                isOver ? "border-navy-400 bg-navy-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div
                className="px-3 py-2.5 rounded-t-xl border-b border-slate-200 flex items-center justify-between"
                style={{ borderTop: `3px solid ${stage.color || "#8C8C8C"}` }}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">{stage.name}</p>
                  <p className="text-xs text-slate-400">
                    {stageContacts.length} · {formatCurrency(stageValue(stage.id))}
                  </p>
                </div>
              </div>

              <div className="p-2 space-y-2 min-h-[100px] max-h-[65vh] overflow-y-auto">
                {stageContacts.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDraggedId(c.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onClick={() => openEdit(c)}
                    className={`bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:shadow-md hover:border-navy-300 transition-all ${
                      draggedId === c.id ? "opacity-40" : ""
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {c.first_name} {c.last_name || ""}
                    </p>
                    {c.company && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 size={10} /> {c.company}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {c.professional_categories?.name && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-navy-50 text-navy-600 rounded-full">
                          {c.professional_categories.name}
                        </span>
                      )}
                      {c.estimated_value ? (
                        <span className="text-xs font-medium text-slate-600">
                          {formatCurrency(c.estimated_value)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {stageContacts.length === 0 && (
                  <div className="text-xs text-slate-300 text-center py-6">Nessuna trattativa qui</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {formOpen && (
        <ContactForm
          contact={editingContact}
          onClose={() => setFormOpen(false)}
          onSaved={loadContacts}
          onDeleted={loadContacts}
        />
      )}
    </div>
  );
}
