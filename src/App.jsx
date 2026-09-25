import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./lib/useAuth";
import Login from "./components/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Contatti from "./pages/Contatti";
import Pipeline from "./pages/Pipeline";
import Appuntamenti from "./pages/Appuntamenti";
import Statistiche from "./pages/Statistiche";
import FollowUp from "./pages/FollowUp";
import Contratti from "./pages/Contratti";
import Archivio from "./pages/Archivio";
import Impostazioni from "./pages/Impostazioni";

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
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="appuntamenti" element={<Appuntamenti />} />
          <Route path="statistiche" element={<Statistiche />} />
          <Route path="follow-up" element={<FollowUp />} />
          <Route path="contratti" element={<Contratti />} />
          <Route path="archivio" element={<Archivio />} />
          <Route path="impostazioni" element={<Impostazioni />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
