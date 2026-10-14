import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Registro attività degli operatori (tabella activity_log su Supabase).
// Ogni utente può solo aggiungere righe a proprio nome; solo gli amministratori
// (tabella crm_admins) possono leggerle, dalla pagina "Attività telefoniste".
// Se qualcosa va storto (es. tabella non ancora creata) l'errore viene ignorato:
// il monitoraggio non deve mai bloccare il lavoro nel CRM.
export async function logActivity(event, { source = null, contactId = null } = {}) {
  try {
    const { error } = await supabase.from("activity_log").insert({
      event,
      source,
      contact_id: contactId ? String(contactId) : null,
    });
    if (error) console.warn("Registro attività:", error.message);
  } catch (err) {
    console.warn("Registro attività:", err);
  }
}

// Restituisce l'email dell'utente collegato e se è amministratore.
export function useCurrentUser() {
  const [state, setState] = useState({ email: null, isAdmin: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email ? data.user.email.toLowerCase() : null;
      let isAdmin = false;
      if (email) {
        const { data: rows } = await supabase.from("crm_admins").select("email").eq("email", email);
        isAdmin = Array.isArray(rows) && rows.length > 0;
      }
      if (!cancelled) setState({ email, isAdmin, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
