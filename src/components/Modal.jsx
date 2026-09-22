import { X } from "lucide-react";

export default function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-0 md:p-4 bg-black/40">
      <div
        className={`bg-white w-full ${wide ? "max-w-2xl" : "max-w-lg"} md:rounded-xl shadow-xl max-h-[100dvh] md:max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-navy-700">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Chiudi"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">{children}</div>
        {/* I pulsanti di azione (Salva, Annulla, ecc.) restano sempre visibili in fondo,
            fuori dall'area con scorrimento: su mobile, specialmente con la tastiera aperta,
            altrimenti finivano fuori dallo schermo e non si vedevano più.
            Si usa "100dvh" (altezza dinamica della finestra) invece di "100vh" perché su
            molti telefoni (soprattutto iPhone) "100vh" non si riduce quando si apre la
            tastiera: la finestra pensava di avere ancora tutto lo schermo disponibile e il
            pulsante finiva nascosto proprio dietro la tastiera. */}
        {footer && <div className="px-5 py-3 border-t border-slate-200 shrink-0 bg-white">{footer}</div>}
      </div>
    </div>
  );
}
