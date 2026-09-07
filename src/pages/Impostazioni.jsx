import { useState } from "react";
import { useSettings } from "../lib/useSettings";
import SettingsList from "../components/SettingsList";
import OperatorsList from "../components/OperatorsList";
import { Loader2 } from "lucide-react";

const TABS = [
  { key: "pipelineStages", label: "Fasi pipeline", table: "pipeline_stages", withColor: true, withOrder: true },
  { key: "leadSources", label: "Fonti dei lead", table: "lead_sources" },
  { key: "professionalCategories", label: "Categorie professionali", table: "professional_categories" },
  { key: "productLines", label: "Linee di prodotto", table: "product_lines" },
  { key: "lostReasons", label: "Motivi trattativa persa", table: "lost_reasons" },
  { key: "operators", label: "Operatori", table: "operators", isOperators: true },
];

export default function Impostazioni() {
  const settings = useSettings();
  const [activeTab, setActiveTab] = useState(TABS[0].key);

  if (settings.loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> Caricamento impostazioni...
      </div>
    );
  }

  const activeTabConfig = TABS.find((t) => t.key === activeTab);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-navy-700">Impostazioni</h1>
        <p className="text-sm text-slate-500">
          Modifica fasi, fonti, categorie, prodotti e operatori senza bisogno di toccare il codice
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-navy-600 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-xl">
        {activeTabConfig.isOperators ? (
          <OperatorsList items={settings.operators} onChange={settings.reload} />
        ) : (
          <SettingsList
            key={activeTabConfig.key}
            table={activeTabConfig.table}
            items={settings[activeTabConfig.key]}
            onChange={settings.reload}
            withColor={!!activeTabConfig.withColor}
            withOrder={!!activeTabConfig.withOrder}
          />
        )}
      </div>
    </div>
  );
}
