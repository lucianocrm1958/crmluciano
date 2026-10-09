import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, Phone, ClipboardCheck, X, Clock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Avvisi "richiamare alle ore...": compaiono in basso a destra, su qualsiasi pagina del CRM,
// quando arriva l'orario di un follow-up aperto di oggi che ha un'ora impostata.
//
// A chi arrivano: all'operatore scelto su questo dispositivo nel filtro della pagina Follow-up
// (la stessa scelta, ricordata dal browser). Se il filtro è "Tutti gli operatori" arrivano tutti.
//
// L'avviso resta visibile finché l'operatore non registra l'esito, non lo posticipa di 10 minuti
// o non lo chiude. Se il CRM è aperto in un'altra scheda, prova anche a mostrare una notifica
// del browser e a emettere un breve suono.

const OPERATOR_FILTER_KEY = "followup_filtro_operatore";
const DISMISSED_KEY = "avvisi_richiamo_gestiti"; // { [followUpId]: timestamp fino a cui non mostrare }
const CHECK_EVERY_MS = 30 * 1000;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // memoria del browser non disponibile: gli avvisi funzionano comunque in questa sessione
  }
}

function readOperatorFilter() {
  try {
    return localStorage.getItem(OPERATOR_FILTER_KEY) || "";
  } catch {
    return "";
  }
}

// Data e ora locali (Italia), non UTC.
function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localNowTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // il browser blocca l'audio finché l'utente non ha interagito con la pagina: nessun problema
  }
}

export default function CallbackAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const announced = useRef(new Set()); // avvisi già "suonati" in questa sessione

  const check = useCallback(async () => {
    const operatorFilter = readOperatorFilter();
    let query = supabase
      .from("follow_ups")
      .select("id, due_date, due_time, note, operator_id, contact_id, contacts(first_name, last_name, company, phone, landline_phone), operators(initials)")
      .eq("status", "aperto")
      .eq("due_date", localToday())
      .not("due_time", "is", null)
      .lte("due_time", localNowTime())
      .order("due_time", { ascending: true });

    if (operatorFilter === "__none__") query = query.is("operator_id", null);
    else if (operatorFilter) query = query.eq("operator_id", operatorFilter);

    const { data, error } = await query;
    if (error) {
      // Se la colonna due_time non esiste ancora (migrazione SQL non eseguita) non mostriamo nulla.
      console.error(error);
      return;
    }

    const dismissed = readJson(DISMISSED_KEY, {});
    const now = Date.now();
    const visible = (data || []).filter((f) => !(dismissed[f.id] && dismissed[f.id] > now));
    setAlerts(visible);

    const fresh = visible.filter((f) => !announced.current.has(f.id));
    if (fresh.length > 0) {
      fresh.forEach((f) => announced.current.add(f.id));
      beep();
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        fresh.forEach((f) => {
          const name = `${f.contacts?.first_name || ""} ${f.contacts?.last_name || ""}`.trim();
          new Notification(`Richiamare ${name} (${f.due_time.slice(0, 5)})`, { body: f.note || "" });
        });
      }
    }
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    // Ricontrolla subito quando si torna sulla scheda o si cambia operatore nel filtro.
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    window.addEventListener("followup-alerts-refresh", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
      window.removeEventListener("followup-alerts-refresh", onFocus);
    };
  }, [check]);

  function hideFor(id, minutes) {
    const dismissed = readJson(DISMISSED_KEY, {});
    // pulizia: tiene solo le voci ancora utili
    const now = Date.now();
    Object.keys(dismissed).forEach((k) => {
      if (dismissed[k] < now) delete dismissed[k];
    });
    dismissed[id] = now + minutes * 60 * 1000;
    writeJson(DISMISSED_KEY, dismissed);
    if (minutes < 60) announced.current.delete(id); // al nuovo avviso suonerà di nuovo
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  function call(num) {
    window.location.href = "tel:" + num.replace(/\s+/g, "");
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm space-y-2">
      {alerts.map((f) => {
        const name = `${f.contacts?.first_name || ""} ${f.contacts?.last_name || ""}`.trim();
        const phones = [f.contacts?.phone, f.contacts?.landline_phone].filter(Boolean);
        return (
          <div key={f.id} className="bg-white border-2 border-amber-400 shadow-xl rounded-xl p-3">
            <div className="flex items-start gap-2">
              <BellRing size={18} className="text-amber-500 mt-0.5 flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  Richiamare {name} alle {f.due_time.slice(0, 5)}
                </p>
                {f.contacts?.company && <p className="text-xs text-slate-500">{f.contacts.company}</p>}
                {f.note && <p className="text-xs text-slate-600 mt-0.5">{f.note}</p>}
              </div>
              {f.operators?.initials && (
                <span className="w-6 h-6 rounded-full bg-navy-50 text-navy-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {f.operators.initials}
                </span>
              )}
              <button
                onClick={() => hideFor(f.id, 24 * 60)}
                className="text-slate-300 hover:text-slate-500"
                title="Chiudi avviso"
                aria-label="Chiudi avviso"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {phones.map((num) => (
                <button
                  key={num}
                  onClick={() => call(num)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 border border-navy-200 hover:bg-navy-50 px-2 py-1 rounded-lg"
                >
                  <Phone size={12} /> {num}
                </button>
              ))}
              <button
                onClick={() => {
                  hideFor(f.id, 24 * 60);
                  navigate(`/follow-up?esito=${f.id}`);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-white bg-navy-600 hover:bg-navy-700 px-2 py-1 rounded-lg"
              >
                <ClipboardCheck size={12} /> Esito
              </button>
              <button
                onClick={() => hideFor(f.id, 10)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
              >
                <Clock size={12} /> +10 min
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
