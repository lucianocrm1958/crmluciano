import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  Euro, TrendingUp, KanbanSquare, BellRing, CalendarClock, Loader2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import KpiCard from "../components/KpiCard";
import { formatCurrency, formatDate, MONTH_LABELS } from "../lib/format";

const CLOSED_STAGE_NAMES = ["Chiuso vinto", "Chiuso perso"];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [contracts, setContracts] = useState([]);
  const [productLines, setProductLines] = useState([]);
  const [pipelineContacts, setPipelineContacts] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [urgentFollowUps, setUrgentFollowUps] = useState([]);
  const [stalePastAppointments, setStalePastAppointments] = useState([]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const yearStart = `${new Date().getFullYear()}-01-01`;

        const [
          { data: contractsData, error: contractsErr },
          { data: productLinesData },
          { data: leadSourcesData },
          { data: contactsData, error: contactsErr },
          { data: followUpsData },
          { data: appointmentsData },
        ] = await Promise.all([
          supabase
            .from("contracts")
            .select("id, amount, excess_new_amount, contract_type, start_date, product_line_id, contact_id")
            .gte("start_date", yearStart),
          supabase.from("product_lines").select("id, name"),
          supabase.from("lead_sources").select("id, name"),
          supabase
            .from("contacts")
            .select("id, first_name, last_name, company, status, pipeline_stage_id, lead_source_id, estimated_value, pipeline_stages(name), lead_sources(name)")
            ,
          supabase
            .from("follow_ups")
            .select("id, due_date, note, status, contact_id, contacts(first_name, last_name, company)")
            .eq("status", "aperto")
            .lte("due_date", today)
            .order("due_date", { ascending: true }),
          supabase
            .from("appointments")
            .select("id, appointment_date, status, contact_id, contacts(first_name, last_name, company)")
            .eq("status", "programmato")
            .lt("appointment_date", today),
        ]);

        if (contractsErr) throw contractsErr;
        if (contactsErr) throw contactsErr;

        setContracts(contractsData || []);
        setProductLines(productLinesData || []);
        setLeadSources(leadSourcesData || []);
        setAllContacts(contactsData || []);
        setPipelineContacts(
          (contactsData || []).filter(
            (c) =>
              c.status === "attivo" &&
              !CLOSED_STAGE_NAMES.includes(c.pipeline_stages?.name)
          )
        );
        setUrgentFollowUps(followUpsData || []);
        setStalePastAppointments(appointmentsData || []);
      } catch (err) {
        console.error(err);
        setError(
          "Non sono riuscito a caricare i dati. Controlla la connessione a Supabase (URL e chiave nel file .env)."
        );
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  // ---- Calcoli derivati ----

  const revenueThisMonth = useMemo(() => {
    const now = new Date();
    const monthContracts = contracts.filter((c) => {
      const d = new Date(c.start_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return sumNuovoRinnovo(monthContracts);
  }, [contracts]);

  const revenueThisYear = useMemo(() => sumNuovoRinnovo(contracts), [contracts]);

  const pipelineValue = useMemo(
    () => pipelineContacts.reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0),
    [pipelineContacts]
  );

  const monthlyChartData = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { month: d.getMonth(), year: d.getFullYear(), label: MONTH_LABELS[d.getMonth()], nuovo: 0, rinnovo: 0 };
    });
    contracts.forEach((c) => {
      const d = new Date(c.start_date);
      const bucket = buckets.find((b) => b.month === d.getMonth() && b.year === d.getFullYear());
      if (!bucket) return;
      const { nuovo, rinnovo } = splitNuovoRinnovo(c);
      bucket.nuovo += nuovo;
      bucket.rinnovo += rinnovo;
    });
    return buckets;
  }, [contracts]);

  const productLineChartData = useMemo(() => {
    return productLines
      .map((pl) => {
        const lineContracts = contracts.filter((c) => c.product_line_id === pl.id);
        const { nuovo } = sumNuovoRinnovo(lineContracts);
        return { name: pl.name, nuovo };
      })
      .filter((p) => p.nuovo > 0)
      .sort((a, b) => b.nuovo - a.nuovo);
  }, [contracts, productLines]);

  const sourcePerformance = useMemo(() => {
    return leadSources.map((src) => {
      const contactsFromSource = allContacts.filter((c) => c.lead_source_id === src.id);
      const won = contactsFromSource.filter((c) => c.pipeline_stages?.name === "Chiuso vinto").length;
      return {
        name: src.name,
        totale: contactsFromSource.length,
        vinti: won,
        tasso: contactsFromSource.length > 0 ? Math.round((won / contactsFromSource.length) * 100) : 0,
      };
    });
  }, [allContacts, leadSources]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={20} /> Caricamento dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center bg-rose-50 border border-rose-200 rounded-xl p-6">
        <p className="text-rose-700 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-700">Dashboard</h1>
        <p className="text-sm text-slate-500">Panoramica della tua attività di vendita</p>
      </div>

      {/* KPI principali */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Fatturato del mese"
          value={formatCurrency(revenueThisMonth.totale)}
          sublabel={`Nuovo ${formatCurrency(revenueThisMonth.nuovo)} · Rinnovo ${formatCurrency(revenueThisMonth.rinnovo)}`}
          icon={Euro}
        />
        <KpiCard
          label="Fatturato dell'anno"
          value={formatCurrency(revenueThisYear.totale)}
          sublabel={`Nuovo ${formatCurrency(revenueThisYear.nuovo)} · Rinnovo ${formatCurrency(revenueThisYear.rinnovo)}`}
          icon={TrendingUp}
        />
        <KpiCard
          label="Pipeline attiva"
          value={formatCurrency(pipelineValue)}
          sublabel={`${pipelineContacts.length} trattative aperte`}
          icon={KanbanSquare}
        />
        <KpiCard
          label="Follow-up urgenti"
          value={urgentFollowUps.length}
          sublabel="Scaduti o in programma per oggi"
          icon={BellRing}
          tone={urgentFollowUps.length > 0 ? "warning" : "default"}
        />
      </div>

      {stalePastAppointments.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <CalendarClock size={18} className="text-rose-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-700">
              {stalePastAppointments.length} appuntamenti passati non ancora aggiornati
            </p>
            <p className="text-xs text-rose-500 mt-0.5">
              Vai in Appuntamenti per registrare l'esito
            </p>
          </div>
        </div>
      )}

      {/* Grafici */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-navy-700 mb-3">Fatturato mensile (ultimi 6 mesi)</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="nuovo" name="Nuovo" stackId="a" fill="#1F3864" radius={[0, 0, 0, 0]} />
              <Bar dataKey="rinnovo" name="Rinnovo" stackId="a" fill="#8C6D1F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-navy-700 mb-3">Fatturato Nuovo per linea di prodotto</p>
          {productLineChartData.length === 0 ? (
            <EmptyChartState text="Nessun contratto Nuovo registrato ancora" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(240, productLineChartData.length * 44)}>
              <BarChart data={productLineChartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="nuovo" name="Nuovo" fill="#1F3864" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Performance canali + liste urgenti */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-navy-700 mb-3">Performance canali di acquisizione</p>
          <div className="space-y-2">
            {sourcePerformance.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-600">{s.name}</span>
                <span className="text-slate-400 text-xs">{s.totale} contatti</span>
                <span className="font-medium text-navy-700 w-16 text-right">{s.tasso}% vinti</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-navy-700 mb-3">Follow-up da gestire oggi</p>
          {urgentFollowUps.length === 0 ? (
            <EmptyChartState text="Nessun follow-up urgente. Ottimo lavoro." />
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {urgentFollowUps.map((f) => (
                <div key={f.id} className="flex items-start justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-slate-700 font-medium">
                      {f.contacts?.first_name} {f.contacts?.last_name || ""}
                      {f.contacts?.company ? ` · ${f.contacts.company}` : ""}
                    </p>
                    <p className="text-slate-400 text-xs">{f.note}</p>
                  </div>
                  <span className="text-xs text-rose-500 whitespace-nowrap ml-2">{formatDate(f.due_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChartState({ text }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-slate-400 text-center px-4">
      {text}
    </div>
  );
}

function splitNuovoRinnovo(contract) {
  const amount = Number(contract.amount) || 0;
  const excess = Number(contract.excess_new_amount) || 0;
  if (contract.contract_type === "nuovo") {
    return { nuovo: amount, rinnovo: 0 };
  }
  return { nuovo: excess, rinnovo: amount - excess };
}

function sumNuovoRinnovo(contractsList) {
  return contractsList.reduce(
    (acc, c) => {
      const { nuovo, rinnovo } = splitNuovoRinnovo(c);
      acc.nuovo += nuovo;
      acc.rinnovo += rinnovo;
      acc.totale += nuovo + rinnovo;
      return acc;
    },
    { nuovo: 0, rinnovo: 0, totale: 0 }
  );
}

