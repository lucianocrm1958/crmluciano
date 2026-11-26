import { useEffect, useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { loadContactIndex, findMatches, reasonLabel } from "../lib/duplicates";
import { formatDate } from "../lib/format";
import ContactCardModal from "./ContactCardModal";

// Riquadro nella scheda contatto: segnala se la stessa persona è già presente nel CRM
// con altre schede (es. partecipante a un webinar precedente, a un altro convegno),
// indicando lista/evento, data di caricamento, operatore, fase ed esito.
// Da qui si può aprire la scheda dell'altro evento senza uscire.
export default function ContactOtherEvents({ contact }) {
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    loadContactIndex()
      .then((index) => {
        if (!cancelled) setMatches(findMatches(contact, index));
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [contact]);

  if (matches.length === 0) return null;

  const lists = Array.from(new Set(matches.map((m) => m.contact.list_name || "senza lista")));

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start justify-between gap-2 text-left"
      >
        <span className="flex items-start gap-2 text-sm text-violet-800">
          <History size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">
              Già presente in {matches.length === 1 ? "un altro evento/lista" : `altri ${matches.length} eventi/liste`}
            </span>
            <span className="block text-xs text-violet-600">{lists.join(" · ")}</span>
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-violet-500" /> : <ChevronDown size={16} className="text-violet-500" />}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {matches.map(({ contact: o, reasons, strong }) => (
            <div
              key={o.id}
              className="bg-white border border-violet-100 rounded-md px-2.5 py-2 text-xs text-slate-600 flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {o.list_name || "Senza lista"}
                  {o.created_at && <span className="font-normal text-slate-400"> · caricato il {formatDate(o.created_at)}</span>}
                </p>
                <p>
                  {[
                    o.operators?.initials && `Operatore ${o.operators.initials}`,
                    o.status === "perso" ? "Perso" : o.pipeline_stages?.name || "Nessuna fase",
                    o.call_outcomes?.name,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className={strong ? "text-violet-600" : "text-amber-600"}>
                  {reasonLabel(reasons)}
                  {!strong && " — possibile omonimo, verificare"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(o.id)}
                className="flex-shrink-0 text-navy-600 hover:text-navy-700 font-medium"
              >
                Apri scheda
              </button>
            </div>
          ))}
        </div>
      )}

      {openId && <ContactCardModal contactId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
