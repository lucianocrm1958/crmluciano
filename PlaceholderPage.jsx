import { Construction } from "lucide-react";

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-navy-700">{title}</h1>
      <div className="mt-6 bg-white border border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center text-center gap-3">
        <Construction size={28} className="text-navy-300" />
        <p className="text-slate-500 text-sm max-w-sm">
          {description || "Questo modulo è il prossimo passo: lo costruiamo insieme a breve."}
        </p>
      </div>
    </div>
  );
}
