import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function TopBar({ onMenuClick }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      const term = `%${query.trim()}%`;
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company, email, phone")
        .or(
          `first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term},email.ilike.${term},phone.ilike.${term}`
        )
        .limit(8);
      if (!error) setResults(data || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function goToContact(id) {
    setOpen(false);
    setQuery("");
    navigate(`/contatti?id=${id}`);
  }

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3 px-4 md:px-6 py-3">
        <button
          className="md:hidden text-navy-700"
          onClick={onMenuClick}
          aria-label="Apri menu"
        >
          <Menu size={22} />
        </button>

        <div className="relative flex-1 max-w-lg" ref={boxRef}>
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Cerca per nome, azienda, email o telefono..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100 transition"
          />

          {open && query.trim().length >= 2 && (
            <div className="absolute mt-1.5 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {loading && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Ricerca in corso...
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-500">
                  Nessun contatto trovato
                </div>
              )}
              {!loading &&
                results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => goToContact(c.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-navy-50 border-b border-slate-100 last:border-0"
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {c.first_name} {c.last_name || ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[c.company, c.email, c.phone].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
