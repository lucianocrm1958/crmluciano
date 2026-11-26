import { supabase } from "./supabaseClient";

// Riconoscimento dei contatti già presenti nel CRM (es. chi ha partecipato a un
// webinar e ritorna nella lista di un convegno successivo).
// Un contatto è considerato "lo stesso" se ha:
//   - la stessa email, oppure
//   - lo stesso numero di telefono (cellulare o fisso, ignorando spazi, +39 ecc.), oppure
//   - lo stesso nome e cognome (corrispondenza più debole: possibili omonimi).

export function normName(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function normEmail(value) {
  const v = (value || "").trim().toLowerCase();
  return v.includes("@") ? v : "";
}

// Tiene solo le cifre, toglie il prefisso internazionale italiano e confronta le
// ultime 10 cifre: "+39 333 123 4567", "0039 3331234567" e "333/1234567" coincidono.
export function normPhone(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.startsWith("39") && d.length > 10) d = d.slice(2);
  if (d.length < 6) return "";
  return d.slice(-10);
}

// Chiavi di riconoscimento di un contatto, ciascuna con il motivo della corrispondenza.
function matchKeys(c) {
  const keys = [];
  const email = normEmail(c.email);
  if (email) keys.push({ key: "e:" + email, reason: "email", strong: true });
  for (const p of [c.phone, c.landline_phone]) {
    const phone = normPhone(p);
    if (phone) keys.push({ key: "p:" + phone, reason: "telefono", strong: true });
  }
  const first = normName(c.first_name);
  const last = normName(c.last_name);
  // Senza cognome il solo nome è troppo generico per un abbinamento.
  if (first && last) keys.push({ key: "n:" + first + "|" + last, reason: "nome e cognome", strong: false });
  return keys;
}

// Indice: chiave → contatti che la possiedono.
export function buildIndex(contacts) {
  const index = new Map();
  for (const c of contacts || []) {
    const seen = new Set();
    for (const { key } of matchKeys(c)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const arr = index.get(key);
      if (arr) arr.push(c);
      else index.set(key, [c]);
    }
  }
  return index;
}

// Restituisce gli ALTRI contatti che corrispondono a "contact", ognuno con i motivi
// della corrispondenza e se l'abbinamento è sicuro (email/telefono) o solo per nome.
export function findMatches(contact, index) {
  const found = new Map();
  for (const { key, reason, strong } of matchKeys(contact)) {
    for (const other of index.get(key) || []) {
      if (contact.id && other.id === contact.id) continue;
      const entry = found.get(other.id) || { contact: other, reasons: [], strong: false };
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
      entry.strong = entry.strong || strong;
      found.set(other.id, entry);
    }
  }
  return Array.from(found.values()).sort((a, b) =>
    String(b.contact.created_at || "").localeCompare(String(a.contact.created_at || ""))
  );
}

// Testo leggibile del motivo: "Stessa email, stesso telefono".
export function reasonLabel(reasons) {
  const text = (reasons || [])
    .map((r) => (r === "email" ? "stessa email" : r === "telefono" ? "stesso telefono" : "stesso nome e cognome"))
    .join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Elenco leggero di tutti i contatti, letto una volta e tenuto in memoria per qualche
// minuto: serve alla scheda contatto e all'importazione per trovare le corrispondenze
// senza dover rileggere ogni volta migliaia di righe.
const INDEX_FIELDS =
  "id, first_name, last_name, company, email, phone, landline_phone, list_name, created_at, status, operators(initials), pipeline_stages(name), call_outcomes(name)";
const CACHE_MS = 3 * 60 * 1000;
let cache = null; // { at, promise }

export function invalidateContactIndex() {
  cache = null;
}

export function loadContactIndex() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = (async () => {
    const PAGE = 1000;
    let all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("contacts")
        .select(INDEX_FIELDS)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    return buildIndex(all);
  })();
  cache = { at: Date.now(), promise };
  promise.catch(() => {
    cache = null;
  });
  return promise;
}
