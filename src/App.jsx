import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Contatti from "./pages/Contatti";
import Pipeline from "./pages/Pipeline";
import Appuntamenti from "./pages/Appuntamenti";
import FollowUp from "./pages/FollowUp";
import Contratti from "./pages/Contratti";
import Archivio from "./pages/Archivio";
import Impostazioni from "./pages/Impostazioni";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="contatti" element={<Contatti />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="appuntamenti" element={<Appuntamenti />} />
          <Route path="follow-up" element={<FollowUp />} />
          <Route path="contratti" element={<Contratti />} />
          <Route path="archivio" element={<Archivio />} />
          <Route path="impostazioni" element={<Impostazioni />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
