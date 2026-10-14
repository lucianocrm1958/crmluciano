import { useEffect } from "react";
import { logActivity } from "../lib/activityLog";

// Registra in automatico, senza nulla di visibile a schermo:
// - "accesso": ogni volta che il CRM viene aperto (o ricaricato);
// - "attivo": un segnale al minuto mentre si lavora davvero nel CRM, cioè quando
//   la finestra è in primo piano e c'è stata un'azione (clic, tastiera, scorrimento,
//   tocco) negli ultimi 5 minuti. I minuti "attivi" sono la stima del tempo di
//   lavoro effettivo; i buchi lunghi diventano le "pause" nella pagina di monitoraggio.
const HEARTBEAT_MS = 60 * 1000;
const IDLE_LIMIT_MS = 5 * 60 * 1000;

export default function ActivityTracker() {
  useEffect(() => {
    let lastInteraction = Date.now();
    const markActive = () => {
      lastInteraction = Date.now();
    };
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    logActivity("accesso");

    const timer = setInterval(() => {
      const visible = document.visibilityState === "visible";
      const recentlyUsed = Date.now() - lastInteraction < IDLE_LIMIT_MS;
      if (visible && recentlyUsed) logActivity("attivo");
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(timer);
      events.forEach((ev) => window.removeEventListener(ev, markActive));
    };
  }, []);

  return null;
}
