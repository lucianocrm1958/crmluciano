import { X } from "lucide-react";

export default function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
      <div className="min-h-full flex items-start md:items-center justify-center p-0 md:p-4">
        <div className={`bg-white w-full ${wide ? "max-w-2xl" : "max-w-lg"} md:rounded-xl shadow-xl`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-navy-700">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Chiudi"
            >
              <X size={20} />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {/* Il pulsante Salva (e gli altri pulsanti di azione) è qui in fondo, come parte
              normale della pagina, invece che "agganciato" (sticky) allo schermo: su
              Android, quando si apre la tastiera per scrivere nelle note, il pulsante
              agganciato spariva e non tornava più visibile nemmeno chiudendo la tastiera
              (un problema noto di alcuni browser mobili con questo tipo di posizionamento).
              In questo modo il pulsante c'è sempre: basta chiudere la tastiera e scorrere
              fino in fondo al modulo per trovarlo, in modo affidabile su ogni telefono. */}
          {footer && <div className="border-t border-slate-200 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
