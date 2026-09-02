export default function KpiCard({ label, value, sublabel, tone = "default", icon: Icon }) {
  const toneStyles = {
    default: "bg-white border-slate-200",
    warning: "bg-amber-50 border-amber-200",
    danger: "bg-rose-50 border-rose-200",
  };

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1 ${toneStyles[tone]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && <Icon size={16} className="text-navy-400" />}
      </div>
      <p className="text-2xl font-bold text-navy-700">{value}</p>
      {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}
    </div>
  );
}
