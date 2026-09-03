import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variabili Supabase mancanti. Controlla il file .env (in locale) o le Environment Variables su Vercel (in produzione)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
