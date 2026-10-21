# Lumen RSS

Dashboard RSS personale in stile Netvibes / uStart: una pagina con i tuoi feed organizzati in **tab** e **tile**, che si aggiorna da sola e ti segue su ogni dispositivo.

È un sito **privato**: si entra solo con un account Google, e solo se l'indirizzo è nella lista degli accessi gestita dall'amministratore.

## Cosa fa

- **Tab e tile.** Ogni tab contiene tile di feed RSS/Atom o tile di Preferiti (segnalibri). I tile si trascinano; i tab si creano, rinominano, riordinano ed eliminano.
- **Aggiunta guidata dei feed.** Incolli l'indirizzo di un sito e Lumen ne trova il feed; in alternativa scegli tra alcuni feed popolari.
- **Colonne e stili.** Da 2 a 4 colonne per tab; stili dei tile Full, Condensed, Compact, Comfortable e Mini, per singolo tab o per tutti.
- **Aggiornamento automatico** ogni 10 minuti (con una piccola variazione per ogni feed, così le richieste non partono tutte insieme), pausa quando la scheda non è visibile.
- **Novità e letti.** Le voci nuove si evidenziano (opzionale) e quelle già aperte si attenuano; "segna tutto come letto" per ogni tile.
- **Temi.** Ember (predefinito, stile Claude), Cyber Neon, Voltage (cyberpunk), Slate e Daylight. Il tema scelto si ricorda sul dispositivo e nell'account.
- **Dati al sicuro.** Backup automatico giornaliero (gli ultimi 14), backup JSON completo scaricabile e ripristinabile, import/export OPML (compatibili anche con gli export di uStart), promemoria ogni 30 giorni per scaricare una copia.
- **Salvataggio nell'account** su Firestore, con scritture ridotte al minimo: ritrovi la dashboard identica su ogni dispositivo.
- **Controllo accessi.** Lista di indirizzi abilitati gestita da un pannello nel sito, riservato all'amministratore.

## Come è fatto

| Parte         | Tecnologia                                                 |
| ------------- | ---------------------------------------------------------- |
| Interfaccia   | React 19, TypeScript, Tailwind CSS 4, componenti shadcn/ui |
| App e routing | TanStack Start / Router (rendering lato server), Vite 8    |
| Server        | Cloudflare Workers (`src/server.ts`)                       |
| Login e dati  | Firebase Authentication (solo Google) e Firestore          |
| Test          | Vitest (oltre 350 test)                                    |

Il browser non scarica mai i feed direttamente: li chiede al server di Lumen (`/api/feed` e `/api/discover-feed`), che li legge, li interpreta e restituisce JSON. Questo evita i problemi di CORS e permette di applicare i controlli di sicurezza descritti più sotto.

I dati di ogni persona stanno in Firestore sotto `users/{uid}/...` (dashboard, preferenze, voci viste e visitate, backup). La lista degli accessi sta nella collezione `allowlist`.

## Requisiti

- **Node.js** 20.19 o superiore (oppure 22.12+). Testato con Node 22 e 24.
- Un account **Firebase** (il piano gratuito Spark basta) e un account **Cloudflare** (anche gratuito).
- Un terminale con `git` e `npm`. Gli esempi sono per PowerShell (Windows).

## Avvio in locale

```powershell
npm ci
Copy-Item .env.example .env     # poi compila .env (vedi sotto)
npm run dev
```

Il sito risponde su <http://localhost:8080>. Il server di sviluppo ascolta solo su `localhost`; per raggiungerlo da un altro dispositivo usa `npm run dev -- --host`.

Anche in locale il login usa il vero progetto Firebase, quindi serve avere già pubblicato le regole (vedi sotto) e aver configurato `.env`.

## Variabili d'ambiente

Si mettono nel file `.env` nella radice del progetto (non finisce su GitHub: è nel `.gitignore`). Il modello è `.env.example`.

| Variabile                   | Dove si trova                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`     | Firebase Console → Impostazioni progetto → Le tue app → App web → configurazione SDK |
| `VITE_FIREBASE_AUTH_DOMAIN` | stessa schermata                                                                     |
| `VITE_FIREBASE_PROJECT_ID`  | stessa schermata                                                                     |
| `VITE_FIREBASE_APP_ID`      | stessa schermata                                                                     |

Queste quattro non sono segreti: la configurazione web di Firebase è pubblica per natura, e finisce comunque nel codice servito al browser. La protezione dei dati sta nelle **regole Firestore**, non in queste chiavi.

Importante: le variabili vengono incorporate **al momento della build**, che si fa sul tuo computer con `npm run deploy`. Se `.env` manca o è incompleto, il sito pubblicato mostra "This page didn't load", e il server non riesce a verificare gli accessi (risponde 503).

## Configurare Firebase (una volta sola)

1. **Crea un progetto** nella [console Firebase](https://console.firebase.google.com/) e aggiungi un'**app web**: ti dà i quattro valori per il `.env`.
2. **Authentication → Metodo di accesso**: abilita **Google** (è l'unico metodo usato).
3. **Firestore Database**: crea il database (modalità produzione).
4. **Regole di sicurezza** (passo fondamentale, vedi la sezione seguente).
5. **Authentication → Impostazioni → Domini autorizzati**: aggiungi il dominio del sito pubblicato (per esempio `lumen-rss.<il-tuo-account>.workers.dev`, o il dominio personalizzato). `localhost` è già presente per lo sviluppo.

### Regole Firestore

Il repo contiene il modello `firestore.rules.example`. Il file con la tua email **non va mai su GitHub**: per questo la copia locale, `firestore.rules`, è nel `.gitignore`.

1. Crea la tua copia: `Copy-Item firestore.rules.example firestore.rules`
2. Apri `firestore.rules` e sostituisci `REPLACE-WITH-ADMIN-EMAIL` con il tuo indirizzo Google, **tutto minuscolo**, tra apici (una sola occorrenza, nella funzione `isOwner`). Quell'indirizzo è l'amministratore.
3. Incolla tutto il file in **Firestore Database → Regole** nella console Firebase e premi **Pubblica**.

Le regole non vengono pubblicate da `npm run deploy`: vanno ricaricate a mano ogni volta che il modello cambia. **Fallo prima del deploy del sito**, altrimenti nessuno (tu compreso) riesce ad entrare finché non le pubblichi.

Cosa stabiliscono le regole:

- ognuno legge e scrive solo i propri dati in `users/{uid}`, e solo se è abilitato;
- ognuno può controllare solo la propria voce in `allowlist`;
- solo l'amministratore vede l'intera lista e può modificarla;
- tutto il resto è negato.

Per verificarle prima di fidarti, usa il **Simulatore di regole** della console: una lettura di `users/<uid>/data/prefs` deve riuscire per te e per un indirizzo in lista, e fallire per uno estraneo.

## Pubblicare su Cloudflare Workers

Una tantum:

```powershell
npx wrangler login
```

Poi, ogni volta che vuoi pubblicare:

```powershell
npm run deploy
```

Il comando compila il sito (`vite build`) e lo carica con `wrangler deploy --config wrangler.deploy.jsonc`; alla fine stampa l'indirizzo, del tipo `https://lumen-rss.<account>.workers.dev`. La prima volta aggiungi quel dominio ai **Domini autorizzati** di Firebase Authentication (passo 5 sopra), altrimenti il login Google non parte.

Note:

- Il nome del Worker (`lumen-rss`) è in `wrangler.jsonc` e `wrangler.deploy.jsonc`: tienili uguali.
- Per un dominio tuo: dashboard Cloudflare → Workers e Pages → il Worker → Impostazioni → Domini e route → Aggiungi dominio personalizzato; poi aggiungi anche quello ai domini autorizzati di Firebase.
- Il piano gratuito di Cloudflare Workers è pensato per questo tipo di uso; i limiti attuali sono sul sito di Cloudflare.

**Ordine consigliato la prima volta:** 1) progetto Firebase e `.env`, 2) regole pubblicate, 3) `npm run deploy`, 4) dominio nei domini autorizzati, 5) primo accesso.

## Controllo accessi

- **Senza login** si vede solo la schermata con "Continue with Google": non parte nessun caricamento della dashboard.
- **Primo accesso dell'amministratore.** Quando entri con l'indirizzo scritto nelle regole, l'app crea da sola la tua voce in `allowlist` con il ruolo amministratore. Non devi creare nulla a mano in Firestore.
- **Aggiungere o togliere persone.** Clic sul tondino con la foto in alto a destra → **Manage access**. Scrivi l'indirizzo esattamente come lo mostra Google per quell'account e premi **Add**; il cestino toglie l'accesso (i dati salvati restano, nel caso li riabiliti). Il menu del tondino contiene anche **Sign out**.
- **Chi non è in lista** dopo il login vede "Access not allowed" e torna alla schermata iniziale. Se il suo account Google è stato creato proprio da quel tentativo (da meno di 5 minuti), l'app lo cancella subito da Authentication, così non restano tracce. Un account più vecchio viene solo scollegato, mai cancellato.
- **Il server dei feed** richiede il token di login: senza token risponde 401, se l'indirizzo non è in lista 403, se non riesce a verificare 503 (resta chiuso, non aperto). Per farlo non usa segreti: passa il token a Firestore e fa decidere alle regole.

L'indirizzo dell'amministratore compare **solo** in `firestore.rules` (locale, ignorato da git) e nella console Firebase: né nel codice del sito né nel `.env`.

## Backup e dati

- **Backup automatico** una volta al giorno (al primo accesso della giornata), conservando gli ultimi 14, in `users/{uid}/backups`.
- **Backup JSON completo** dal pulsante **Data**: contiene tab, feed, preferiti, colonne e stili; si può riaggiungere a quanto esiste o sostituire tutto.
- **OPML**: import ed export della sola lista dei feed, compatibile con altri lettori.
- Un promemoria ricorda di scaricare una copia fuori da Firebase ogni 30 giorni (posticipabile di 7).

## Temi

Un tema è un blocco di variabili CSS in `src/styles.css`, selezionato da `[data-theme="nome"]`. Per aggiungerne uno servono tre cose: l'id e il nome in `src/lib/themeConfig.ts`, i colori dell'anteprima in `SWATCHES` dentro `src/components/LayoutMenu.tsx` e il blocco CSS. Ember è il tema di base ed è definito direttamente in `:root`. Un id non più presente (come il vecchio Aurora) ricade sul tema predefinito.

## Comandi

| Comando              | Cosa fa                                  |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | server di sviluppo su `localhost:8080`   |
| `npm run build`      | compila in `dist/`                       |
| `npm run deploy`     | compila e pubblica su Cloudflare Workers |
| `npm test`           | esegue tutti i test una volta            |
| `npm run test:watch` | test in modalità continua                |
| `npm run lint`       | controllo ESLint                         |
| `npm run format`     | formatta con Prettier                    |

Prima di ogni deploy conviene lanciare `npm test`.

## Struttura del progetto

```text
src/
  routes/            pagine (index, admin) e API (api/feed, api/discover-feed)
  components/        schermate e componenti (AccessGate, UserMenu, FeedCard, ...)
  components/ui/     componenti base shadcn/ui
  lib/               logica: sincronizzazione, backup, tema, accessi, proxy dei feed
  test/              strumenti per i test (finti Firestore, login, token)
  server.ts          punto d'ingresso del Worker
  styles.css         temi e stili globali
firestore.rules.example   modello delle regole Firestore (la copia vera è ignorata da git)
wrangler.jsonc            configurazione Worker per lo sviluppo
wrangler.deploy.jsonc     configurazione Worker per `npm run deploy`
```

## Sicurezza del server dei feed

- Solo `http` e `https`, solo le porte 80, 443, 8080 e 8443.
- Rifiuta indirizzi interni o privati (localhost, reti locali, indirizzi riservati) e ripete il controllo a ogni reindirizzamento (massimo 8).
- Limiti di dimensione per feed (5 MB) e pagine (512 KB), tempo massimo di 15 secondi.
- Accetta richieste solo dal sito stesso (controllo dell'origine) e solo con login valido e indirizzo in lista.
- Le risposte hanno `Cache-Control: private`: nessuna cache condivisa le rimanda ad altri.

## Problemi comuni

| Sintomo                                            | Causa probabile                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "This page didn't load" nel sito pubblicato        | il `.env` mancava o era incompleto al momento di `npm run deploy`                                                                            |
| Dopo il login: "Access not allowed" anche per te   | regole non pubblicate, oppure `REPLACE-WITH-ADMIN-EMAIL` non sostituito, oppure email scritta con maiuscole o diversa da quella dell'account |
| Il login non parte o dà `auth/unauthorized-domain` | il dominio non è tra i domini autorizzati di Firebase Authentication                                                                         |
| I feed non si caricano e l'errore è 401/403        | sessione scaduta (ricarica la pagina), oppure l'indirizzo non è in lista                                                                     |
| I feed non si caricano e l'errore è 503            | il server non raggiunge Firestore: controlla `VITE_FIREBASE_PROJECT_ID` e le regole                                                          |
| `npm ci` si lamenta del lockfile                   | usa npm 10 o più recente con Node 20.19+                                                                                                     |

## Manutenzione

- `firebase` è fissato a una versione esatta (12.14.0) nel `package.json`: aggiornalo di proposito, non per caso.
- Dopo aver cambiato `firestore.rules.example`, ricorda di aggiornare la tua copia locale e di ripubblicarla nella console.
- Per controllare le vulnerabilità delle dipendenze: `npm audit`.
