import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Modal from "./Modal";
import ContactForm from "./ContactForm";
import { Loader2 } from "lucide-react";

// Apre la scheda completa di un contatto partendo solo dal suo id, da qualsiasi
// schermata (Appuntamenti, Follow-up, ecc.), senza dover uscire e andare in "Contatti".
// Dalla scheda si possono poi gestire appuntamenti, follow-up e contratti del cliente.
export default function ContactCardModal({ contactId, onClose, onChanged }) {
  const [contact, setContact] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.from("contacts").select("*").eq("id", contactId).single();
      if (cancelled) return;
      if (err) {
        console.error(err);
        setError("Non sono riuscito ad aprire la scheda del contatto.");
      } else {
        setContact(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!contact) {
    return (
      <Modal title="Scheda contatto" onClose={onClose}>
        {error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>
        ) : (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
            <Loader2 className="animate-spin" size={18} /> Caricamento...
          </div>
        )}
      </Modal>
    );
  }

  return (
    <ContactForm contact={contact} onClose={onClose} onSaved={() => onChanged?.()} onDeleted={() => onChanged?.()} />
  );
}
