import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Carica tutte le tabelle di configurazione (usate in più moduli:
// Contatti, Pipeline, Appuntamenti, Contratti, Impostazioni...)
//
// Le impostazioni cambiano raramente, quindi vengono lette dal database UNA volta
// e condivise da tutte le schermate e finestre: aprire una scheda contatto,
// un appuntamento o un follow-up non deve rifare ogni volta 8 letture.
// Si rileggono da sole dopo qualche minuto e subito quando le modifichi
// in Impostazioni (reload).

const EMPTY = {
  professionalCategories: [],
  leadSources: [],
  pipelineStages: [],
  productLines: [],
  lostReasons: [],
  operators: [],
  callOutcomes: [],
  products: [],
};
const MAX_AGE_MS = 5 * 60 * 1000;

let cache = null; // ultimi dati letti
let cacheTime = 0;
let cacheError = null;
let inFlight = null; // lettura in corso, condivisa
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

async function fetchSettings() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [
        { data: cats, error: e1 },
        { data: sources, error: e2 },
        { data: stages, error: e3 },
        { data: products, error: e4 },
        { data: reasons, error: e5 },
        { data: operators, error: e6 },
        { data: callOutcomes, error: e7 },
        { data: productItems, error: e8 },
      ] = await Promise.all([
        supabase.from("professional_categories").select("id, name").order("name"),
        supabase.from("lead_sources").select("id, name").order("name"),
        supabase.from("pipeline_stages").select("id, name, order_index, color").order("order_index"),
        supabase.from("product_lines").select("id, name").order("name"),
        supabase.from("lost_reasons").select("id, name").order("name"),
        supabase.from("operators").select("id, initials, name, email").order("initials"),
        supabase.from("call_outcomes").select("id, name").order("name"),
        supabase.from("products").select("id, name, product_line_id").order("name"),
      ]);
      const err = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8;
      if (err) throw err;
      cache = {
        professionalCategories: cats || [],
        leadSources: sources || [],
        pipelineStages: stages || [],
        productLines: products || [],
        lostReasons: reasons || [],
        operators: operators || [],
        callOutcomes: callOutcomes || [],
        products: productItems || [],
      };
      cacheTime = Date.now();
      cacheError = null;
    } catch (err) {
      console.error(err);
      cacheError = err.message || "Errore nel caricamento delle impostazioni";
    } finally {
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}

export function useSettings() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    // Prima volta, oppure dati vecchi di qualche minuto: rilegge (in background
    // se ci sono già dati da mostrare, così la finestra si apre subito).
    if (!cache || Date.now() - cacheTime > MAX_AGE_MS) fetchSettings();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const reload = useCallback(() => fetchSettings(), []);

  return {
    ...(cache || EMPTY),
    loading: !cache && !cacheError,
    error: cache ? null : cacheError,
    reload,
  };
}
