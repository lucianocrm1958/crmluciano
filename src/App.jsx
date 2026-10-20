import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./lib/useAuth";
import Login from "./components/Login";
import Layout from "./components/Layout";

// Le pagine vengono scaricate solo quando servono: all'accesso il browser
// scarica meno codice e il CRM si apre prima.
// Se il CRM è stato aggiornato mentre la scheda del browser era aperta, la vecchia
// versione della pagina non esiste più: in quel caso si ricarica da sola (una volta).
function lazyPage(loader) {
  return lazy(() =>
    loader()
      .then((mod) => {
        try {
          sessionStorage.removeItem("crm_reload_after_update");
        } catch {
          /* niente */
        }
        return mod;
      })
      .catch((err) => {
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem("crm_reload_after_update") === "1";
          sessionStorage.setItem("crm_reload_after_update", "1");
        } catch {
          /* niente */
        }
        if (!alreadyReloaded) {
          window.location.reload();
          return new Promise(() => {});
        }
        throw err;
      })
  );
}
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const Contatti = lazyPage(() => import("./pages/Contatti"));
const Pipeline = lazyPage(() => import("./pages/Pipeline"));
const Appuntamenti = lazyPage(() => import("./pages/Appuntamenti"));
const Statistiche = lazyPage(() => import("./pages/Statistiche"));
const FollowUp = lazyPage(() => import("./pages/FollowUp"));
const Contratti = lazyPage(() => import("./pages/Contratti"));
const Archivio = lazyPage(() => import("./pages/Archivio"));
const Impostazioni = lazyPage(() => import("./pages/Impostazioni"));
const Ricerca = lazyPage(() => import("./pages/Ricerca"));
const Monitoraggio = lazyPage(() => import("./pages/Monitoraggio"));
const Campagne = lazyPage(() => import("./pages/Campagne"));
const AttivitaTelefoniste = lazyPage(() => import("./pages/AttivitaTelefoniste"));

export default function App() {
  const { session, loading } = useAuth();

  // Finché non sappiamo ancora se c'è una sessione valida, non mostriamo
  // né il login né il CRM, per evitare un lampo del form di accesso a chi
  // in realtà è già loggato.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento...
      </div>
    );
  }

  // Nessun accesso effettuato: mostra solo il login, il resto del CRM non
  // è raggiungibile finché non si inseriscono email e password corrette.
  if (!session) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="contatti" element={<Contatti />} />
          <Route path="ricerca" element={<Ricerca />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="appuntamenti" element={<Appuntamenti />} />
          <Route path="statistiche" element={<Statistiche />} />
          <Route path="monitoraggio" element={<Monitoraggio />} />
          <Route path="follow-up" element={<FollowUp />} />
          <Route path="campagne" element={<Campagne />} />
          <Route path="attivita" element={<AttivitaTelefoniste />} />
          <Route path="contratti" element={<Contratti />} />
          <Route path="archivio" element={<Archivio />} />
          <Route path="impostazioni" element={<Impostazioni />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

