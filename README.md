# CRM Vendite — Il Sole 24 Ore Professionale

CRM personale per gestire contatti, pipeline, appuntamenti, follow-up, contratti e fatturato.

## Stack
- React + Vite
- Tailwind CSS
- Supabase (database)
- Recharts (grafici)

## Configurazione

Questo progetto ha bisogno di due variabili d'ambiente per collegarsi al database Supabase:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Le trovi su Supabase in **Project Settings → Data API**.

In locale: crea un file `.env` nella cartella principale (puoi copiare `.env.example` e rinominarlo) e inserisci i tuoi valori.

Su Vercel: si impostano tra le **Environment Variables** del progetto (vedi guida di deploy).

## Stato del progetto

- [x] Dashboard
- [ ] Contatti
- [ ] Pipeline
- [ ] Appuntamenti
- [ ] Follow-up
- [ ] Contratti e fatturato
- [ ] Archivio trattative perse
- [ ] Impostazioni
