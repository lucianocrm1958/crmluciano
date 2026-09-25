import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Tiene traccia dello stato di accesso (utente loggato o no) in tutta l'app,
// così le pagine restano visibili solo a chi ha effettuato il login con
// email e password create su Supabase (vedi Login.jsx).
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
