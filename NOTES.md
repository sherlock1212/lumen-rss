# Note di lavoro (per chi riprende il progetto)

Questo file serve a ripartire in una nuova conversazione con Claude senza rispiegare tutto: contiene come lavoriamo, cosa è stato deciso e cosa resta da fare. Per istruzioni di installazione e deploy vedi `README.md`.

**Come usarlo:** all'inizio di una nuova chat incolla o allega questo file (e, se la chat riesce ad aprirlo, il link del repo). Aggiornalo quando cambiano decisioni o attività in sospeso.

## Il progetto in breve

Lumen RSS: dashboard RSS personale in stile Netvibes/uStart, privata (login Google + lista di indirizzi abilitati). Stack: Vite 8, React 19, TypeScript, TanStack Start/Router, shadcn/ui, Tailwind 4, Cloudflare Workers, Firebase Authentication (Google) e Firestore. Repo: <https://github.com/sherlock1212/lumen-rss>.

Vocabolario usato nelle conversazioni:

- **tab**: una scheda della dashboard;
- **tile**: un riquadro dentro un tab (componente `FeedCard`, oppure `BookmarksCard` per i Preferiti);
- **entry**: una singola voce di un feed.

## Come lavoriamo (regole di collaborazione)

- L'utente lavora su **Windows con PowerShell**, Node 24.x. Non è un esperto di git: dare sempre i comandi esatti, nell'ordine, con cosa deve comparire e cosa fare se non è così.
- Claude **non fa push** e non ha accesso in scrittura al repo. Prepara **patch** (`git apply`) generate da un clone pulito della versione su GitHub e verificate con `git apply --check`; l'utente le applica, prova, fa commit, **push** e deploy (`npm run deploy`). Le patch vanno salvate **fuori** dalla cartella del progetto (es. in Download) e applicate con il percorso completo, per non finire per sbaglio nel commit con `git add -A`.
- Prima di consegnare: `tsc`, `eslint`, `npm test`, build con le variabili Firebase di prova, e per le modifiche all'aspetto un confronto visivo prima/dopo (i temi non toccati devono restare identici). Per le modifiche delicate si fa anche un test "a mutazione": si introduce un guasto di proposito e si controlla che i test lo scoprano.
- Spiegare in italiano semplice: cosa cambia per l'utente, cosa non è stato possibile verificare, e proporre un solo passo successivo.
- **Non mettere mai l'email dell'utente nel repo** (né in codice, né in `.env.example`, né negli appunti). Vive solo nella copia locale ignorata `firestore.rules` e nella console Firebase.
- Le regole Firestore non si pubblicano con il deploy: vanno incollate a mano nella console, **prima** del deploy del sito.

## Cosa è stato fatto

Cronologia in ordine (i passi 1–5 e 6a–6d sono lavori precedenti: i dettagli sono nella cronologia git):

1. Passi 1–5 e 6a–6d: lavori precedenti, già applicati (i dettagli sono nella cronologia dei commit).
2. **6e1**: meno scritture su Firestore e pausa dell'aggiornamento quando la scheda non è visibile.
3. **6e2**: tema ricordato in `localStorage` (niente lampo del tema sbagliato), divisione dei bundle, import OPML caricato solo quando serve.
4. **6e3**: suite di test con Vitest (finti Firestore/Auth in `src/test/`).
5. **Aggiornamenti**: Vite 8; dipendenze di sicurezza (TanStack Start 1.169.x, React 19.3.x, ecc.). `firebase` resta fissato alla versione esatta **12.14.0**: scelta dell'utente.
6. **Rimozione di Lovable**: `vite.config.ts` ora è esplicito (plugin Tailwind, TanStack Start, React, alias `@` tramite `resolve.tsconfigPaths`, porta 8080). La build è risultata identica byte per byte a quella con Lovable. Vulnerabilità `npm audit`: da 18 a 4.
7. **Temi**: Ember (predefinito, stile Claude), Cyber Neon, Voltage (cyberpunk), Slate, Daylight. Aurora è stato rimosso: chi lo aveva salvato ricade su Ember. I tile di Ember hanno un bordo terracotta fisso che scorre all'hover (classe `tile`).
8. **Controllo accessi (step 7)**, vedi sotto.
9. `README.md` con istruzioni di installazione e deploy.
10. **Pulizia**: rimossa la vecchia modalità ospite (stato `guest` in `useDashboard`/`dashboardSync`, relativi testi in `SyncStatus`) ed eliminata la cartella `.lovable/` (`plan.md` e `project.json`). `SyncBanner` resta: serve ancora per offline ed errori.
11. **Riquadri delle icone**: l'utente preferisce l'aspetto pulito **senza sfondo** dietro le icone (resta solo l'alone `--shadow-glow`), quindi la classe `bg-[var(--gradient-primary)]`, che non aveva effetto, è stata tolta dal codice. Le favicon dell'intestazione dei tile (`FeedFavicon` in `FeedCard`) sono passate da 16 a 24 px (+50%); l'icona RSS di riserva da 14 a 20 px.

## Come funziona il controllo accessi

- Collezione Firestore `allowlist`: un documento per indirizzo (l'id è l'indirizzo in minuscolo). L'amministratore ("owner") è definito **solo** in `firestore.rules` (copia locale, ignorata da git; il modello nel repo è `firestore.rules.example`).
- Al primo accesso l'amministratore crea da sé la propria voce con `role: "admin"` (le regole lo consentono solo a lui). Gli altri vengono abilitati dal pannello `/admin`, raggiungibile dal menu del tondino con la foto.
- Il client (`useAccess`, `AccessGate`) mostra la landing con il solo tasto Google a chi non è loggato, e "Access not allowed" a chi non è in lista. `rejectAccount` cancella da Authentication l'account creato da meno di 5 minuti; un account più vecchio viene solo scollegato (mai cancellato, per non lasciare dati orfani).
- Le regole Firestore negano i dati di `users/{uid}` a chi non è abilitato.
- Il server dei feed (`src/lib/serverAccess.ts`) pretende il token di login, lo passa a Firestore (REST) per leggere la voce dell'utente in `allowlist` e lascia decidere alle regole. Risposte ricordate 60 secondi (positive) o 10 (negative). Senza token 401, non in lista 403, impossibile verificare 503 (resta chiuso).
- Limite noto: chi ha un vero account Google e parla direttamente con le API di Firebase può lasciare account in Authentication e provocare letture rifiutate. Per un uso personale è accettabile; eventuale rimedio futuro: App Check.

## Da fare / idee in sospeso

- **Verificare le regole con il Simulatore di regole** della console (lettura di `users/<uid>/data/prefs` con: account amministratore, account in lista, account estraneo). Nell'ambiente di sviluppo di Claude l'emulatore Firestore non è raggiungibile, quindi le regole non sono mai state eseguite dai test.
- **Favicon delle righe nei Preferiti** (`BookmarkFavicon` in `BookmarksCard`): sono ancora da 16 px; l'utente ha chiesto +50% solo per quelle nell'intestazione dei tile. Da ingrandire solo se lo chiede.
- Le favicon dell'intestazione dei tile (24 px) sono chieste a Google con `sz=64`, per essere nitide sugli schermi ad alta densità; quelle dei Preferiti restano a `sz=32` (16 px). Il servizio `s2/favicons` non è documentato da Google: se un giorno smettesse di funzionare, bisognerà cambiare fonte. Se un sito non ha un'icona così grande, Google ne dà una più piccola (che viene ingrandita). Non verificato con l'app vera.
- Valutare la rimozione di `@tanstack/router-plugin` (dipendenza diretta non importata dal codice del repo: da verificare prima di toglierla).
- Il nome interno `--gradient-aurora` (sfondo del body) è rimasto per non toccare tutti i temi.
- Vulnerabilità residue (4, tutte in `@grpc/grpc-js` dentro Firebase, non incluse nei bundle serviti): scelta consapevole di non inseguirle ora.
- Idea dell'utente per dopo: un aspetto di base "come l'avrebbe creato Claude al posto di Lovable".

## Trucchi tecnici utili

- **npm:** il lockfile va generato con npm 10 e deve funzionare con `npm ci` sia con npm 10 sia con npm 11. Con npm 10.9.4 i comandi `npm install vitest` e `npm update` possono andare in errore: si installa un pacchetto alla volta con la versione esatta.
- **Build e test:** la build ha bisogno delle quattro variabili `VITE_FIREBASE_*` (anche finte, nello stesso comando della build); altrimenti la pagina mostra "This page didn't load". I test usano `VITE_FIREBASE_PROJECT_ID` finto già impostato in `vitest.config.ts`.
- **Server locale:** `wrangler dev --local --config wrangler.deploy.jsonc` dopo la build, con `--port` e `--inspector-port` distinti se se ne avviano due.
- **Cartella `dist`:** la build è deterministica, quindi si può confrontare byte per byte prima e dopo una modifica che non dovrebbe cambiare l'output.
- **Test degli accessi:** `src/test/fakeFirestore.ts`, `fakeAuth.ts` e `token.ts` simulano database, login e token; `serverAccess.test.ts` e `apiRoutes.test.ts` coprono il server.
