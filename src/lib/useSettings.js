import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Carica tutte le tabelle di configurazione (usate in più moduli:
// Contatti, Pipeline, Appuntamenti, Contratti, Impostazioni...)
export function useSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    professionalCategories: [],
    leadSources: [],
    pipelineStages: [],
    productLines: [],
    lostReasons: [],
    operators: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: cats, error: e1 },
        { data: sources, error: e2 },
        { data: stages, error: e3 },
        { data: products, error: e4 },
        { data: reasons, error: e5 },
        { data: operators, error: e6 },
      ] = await Promise.all([
        supabase.from("professional_categories").select("id, name").order("name"),
        supabase.from("lead_sources").select("id, name").order("name"),
        supabase.from("pipeline_stages").select("id, name, order_index, color").order("order_index"),
        supabase.from("product_lines").select("id, name").order("name"),
        supabase.from("lost_reasons").select("id, name").order("name"),
        supabase.from("operators").select("id, initials, name").order("initials"),
      ]);
      const err = e1 || e2 || e3 || e4 || e5 || e6;
      if (err) throw err;
      setData({
        professionalCategories: cats || [],
        leadSources: sources || [],
        pipelineStages: stages || [],
        productLines: products || [],
        lostReasons: reasons || [],
        operators: operators || [],
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Errore nel caricamento delle impostazioni");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, reload: load };
}
