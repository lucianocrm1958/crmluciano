import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabaseClient";
import AppointmentForm from "./AppointmentForm";
import FollowUpForm from "./FollowUpForm";
import FollowUpOutcome from "./FollowUpOutcome";
import ContractForm from "./ContractForm";
import { formatCurrency, formatDate } from "../lib/format";
import {
  Loader2,
  CalendarPlus,
  CalendarClock,
  BellPlus,
  Bell,
  FileText,
  FilePlus,
  ClipboardCheck,
  Pencil,
  Trophy,
} from "lucide-react";

// "Attività del cliente": dentro la scheda del contatto mostra, in un unico punto,
// appuntamenti, follow-up aperti e contratti del cliente, e permette di gestirli
// tutti (fissare, esitare, modificare, registrare un contratto) senza uscire dalla
// scheda e senza dover passare dalle sezioni Appuntamenti, Follow-up o Contratti.
// Funziona ovunque si apra la scheda contatto: Contatti, Pipeline, Ricerca, Archivio,
// barra di ricerca in alto, e ora anche da Appuntamenti e Follow-up.

const STATUS_LABELS = {
  programmato: "Programmato",
  svolto: "Svolto",
  da_rifissare: "Da rifissare",
  non_effettuato: "Non effettuato",
};

const STATUS_COLORS = {
  programmato: "bg-navy-50 text-navy-600",
  svolto: "bg-emerald-50 text-emerald-600",
  da_rifissare: "bg-amber-50 text-amber-600",
  non_effettuato: "bg-rose-50 text-rose-600",
};

const RESULT_LABELS = {
  positivo: "Positivo",
  negativo: "Negativo",
  pending: "Pending",
};

function splitNuovoRinnovo(c) {
  const amount = Number(c.amount) || 0;
  const excess = Number(c.excess_new_amount) || 0;
  if (c.contract_type === "nuovo") return { nuovo: amount, rinnovo: 0 };
  return { nuovo: excess, rinnovo: amount - excess };
}

export default function ContactActivity({ contact, isWon, onChanged }) {
  const [appointments, setAppointments] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Quale finestra è aperta: oggetto da modificare, oppure "new" per un nuovo inserimento.
  const [openAppointment, setOpenAppointment] = useState(null);
  const [openFollowUp, setOpenFollowUp] = useState(null);
  const [outcomeFollowUp, setOutcomeFollowUp] = useState(null);
  const [openContract, setOpenContract] = useState(null);

  async function load() {
    setError(null);
    const [apptRes, fuRes, ctRes] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          "id, appointment_date, appointment_time, mode, address, status, outcome_notes, contact_id, operator_id, call_outcome_id, result, result_amount, result_product_line_id, contacts(first_name, last_name, company, phone, email, notes), operators(initials)",
        )
        .eq("contact_id", contact.id)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false }),
      supabase
        .from("follow_ups")
        .select(
          "id, due_date, due_time, note, status, contact_id, operator_id, contacts(first_name, last_name, company, email, phone, landline_phone, notes, pipeline_stage_id, call_outcome_id, call_outcomes(name)), operators(initials)",
        )
        .eq("contact_id", contact.id)
        .eq("status", "aperto")
        .order("due_date", { ascending: true }),
      supabase
        .from("contracts")
        .select(
          "id, amount, excess_new_amount, contract_type, start_date, duration_months, contact_id, product_line_id, product_id, operator_id, products(name), contacts(first_name, last_name, company), product_lines(name)",
        )
        .eq("contact_id", contact.id)
        .order("start_date", { ascending: false }),
    ]);
    const firstError = apptRes.error || fuRes.error || ctRes.error;
    if (firstError) {
      console.error(firstError);
      setError("Non sono riuscito a caricare tutte le attività del cliente.");
    }
    setAppointments(apptRes.data || []);
    setFollowUps(fuRes.data || []);
    setContracts(ctRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  function handleChanged() {
    load();
    onChanged?.();
  }

  const hasContracts = contracts.length > 0;

  return (
    <div className="border border-navy-100 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-navy-50 border-b border-navy-100">
        <p className="text-xs font-semibold text-navy-700">Attività del cliente</p>
        <p className="text-[11px] text-navy-500">
          Gestisci da qui appuntamenti, follow-up e contratti, senza cambiare sezione.
        </p>
      </div>

      {error && <div className="px-3 py-2 text-xs text-rose-600 bg-rose-50">{error}</div>}

      {loading ? (
        <div className="p-3 text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Caricamento...
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {isWon && !hasContracts && (
            <div className="p-3 bg-emerald-50 flex items-center justify-between gap-3">
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <Trophy size={14} className="flex-shrink-0" />
                Trattativa chiusa vinta: registra il contratto con la suddivisione Nuovo/Rinnovo, così conta nel
                fatturato.
              </p>
              <button
                type="button"
                onClick={() => setOpenContract("new")}
                className="shrink-0 flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg"
              >
                <FilePlus size={14} /> Registra contratto
              </button>
            </div>
          )}

          {/* APPUNTAMENTI */}
          <Section
            icon={<CalendarClock size={13} />}
            title={`Appuntamenti (${appointments.length})`}
            actionLabel="Fissa appuntamento"
            actionIcon={<CalendarPlus size={13} />}
            onAction={() => setOpenAppointment("new")}
          >
            {appointments.length === 0 ? (
              <Empty>Nessun appuntamento.</Empty>
            ) : (
              appointments.map((a) => {
                const needsOutcome = a.status === "programmato";
                const resultLabel = a.result ? RESULT_LABELS[a.result] || a.result : null;
                return (
                  <Row key={a.id}>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700">
                        {formatDate(a.appointment_date)} {a.appointment_time ? a.appointment_time.slice(0, 5) : ""}
                        {a.operators?.initials && (
                          <span className="ml-1.5 text-[10px] text-slate-400">{a.operators.initials}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || ""}`}>
                          {STATUS_LABELS[a.status] || a.status}
                        </span>
                        {resultLabel && <span className="ml-1.5">Esito: {resultLabel}</span>}
                        <span className="ml-1.5">{a.mode === "online" ? "Online" : "In presenza"}</span>
                      </p>
                    </div>
                    <ActionButton primary={needsOutcome} onClick={() => setOpenAppointment(a)}>
                      {needsOutcome ? (
                        <>
                          <ClipboardCheck size={13} /> Esita
                        </>
                      ) : (
                        <>
                          <Pencil size={12} /> Apri
                        </>
                      )}
                    </ActionButton>
                  </Row>
                );
              })
            )}
          </Section>

          {/* FOLLOW-UP */}
          <Section
            icon={<Bell size={13} />}
            title={`Follow-up aperti (${followUps.length})`}
            actionLabel="Nuovo follow-up"
            actionIcon={<BellPlus size={13} />}
            onAction={() => setOpenFollowUp("new")}
          >
            {followUps.length === 0 ? (
              <Empty>Nessun follow-up aperto.</Empty>
            ) : (
              followUps.map((f) => (
                <Row key={f.id}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700">
                      {formatDate(f.due_date)}
                      {f.due_time && <span className="ml-1 text-amber-600">ore {f.due_time.slice(0, 5)}</span>}
                      {f.operators?.initials && (
                        <span className="ml-1.5 text-[10px] text-slate-400">{f.operators.initials}</span>
                      )}
                    </p>
                    {f.note && <p className="text-[11px] text-slate-400 truncate">{f.note}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ActionButton primary onClick={() => setOutcomeFollowUp(f)}>
                      <ClipboardCheck size={13} /> Esito
                    </ActionButton>
                    <ActionButton onClick={() => setOpenFollowUp(f)}>
                      <Pencil size={12} />
                    </ActionButton>
                  </div>
                </Row>
              ))
            )}
          </Section>

          {/* CONTRATTI */}
          <Section
            icon={<FileText size={13} />}
            title={`Contratti (${contracts.length})`}
            actionLabel="Registra contratto"
            actionIcon={<FilePlus size={13} />}
            onAction={() => setOpenContract("new")}
          >
            {contracts.length === 0 ? (
              <Empty>Nessun contratto registrato.</Empty>
            ) : (
              contracts.map((c) => {
                const { nuovo, rinnovo } = splitNuovoRinnovo(c);
                return (
                  <Row key={c.id}>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700">
                        {formatDate(c.start_date)} · {formatCurrency(c.amount)}
                        <span
                          className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            c.contract_type === "nuovo" ? "bg-navy-50 text-navy-600" : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {c.contract_type === "nuovo" ? "Nuovo" : "Rinnovo"}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {[c.product_lines?.name, c.products?.name].filter(Boolean).join(" · ") || "Linea non indicata"}
                        {c.contract_type === "rinnovo" && nuovo > 0 && (
                          <span className="ml-1.5">
                            (Rinnovo {formatCurrency(rinnovo)} + Nuovo {formatCurrency(nuovo)})
                          </span>
                        )}
                      </p>
                    </div>
                    <ActionButton onClick={() => setOpenContract(c)}>
                      <Pencil size={12} /> Modifica
                    </ActionButton>
                  </Row>
                );
              })
            )}
          </Section>
        </div>
      )}

      {/* Le finestre si aprono "sopra" la scheda contatto, ma fuori dal suo modulo:
          così salvare un appuntamento, un follow-up o un contratto non salva né chiude
          per errore anche la scheda del contatto. */}
      {(openAppointment || openFollowUp || outcomeFollowUp || openContract) &&
        createPortal(
          <div onSubmit={(e) => e.stopPropagation()}>
            {openAppointment && (
              <AppointmentForm
                appointment={openAppointment === "new" ? null : openAppointment}
                presetContact={contact}
                hideContactLink
                onClose={() => setOpenAppointment(null)}
                onSaved={handleChanged}
                onDeleted={handleChanged}
              />
            )}

            {openFollowUp && (
              <FollowUpForm
                followUp={openFollowUp === "new" ? null : openFollowUp}
                presetContact={contact}
                onClose={() => setOpenFollowUp(null)}
                onSaved={handleChanged}
                onDeleted={handleChanged}
              />
            )}

            {outcomeFollowUp && (
              <FollowUpOutcome
                followUp={outcomeFollowUp}
                onClose={() => setOutcomeFollowUp(null)}
                onSaved={handleChanged}
              />
            )}

            {openContract && (
              <ContractForm
                contract={openContract === "new" ? null : openContract}
                presetContact={contact}
                onClose={() => setOpenContract(null)}
                onSaved={handleChanged}
                onDeleted={handleChanged}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Section({ icon, title, actionLabel, actionIcon, onAction, children }) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          {icon} {title}
        </p>
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
        >
          {actionIcon} {actionLabel}
        </button>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">{children}</div>
    </div>
  );
}

function Row({ children }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-slate-50/70 border border-slate-100 rounded-md px-2.5 py-1.5">
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-[11px] text-slate-400">{children}</p>;
}

function ActionButton({ primary = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg ${
        primary ? "bg-navy-600 hover:bg-navy-700 text-white" : "border border-slate-200 text-slate-600 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}
