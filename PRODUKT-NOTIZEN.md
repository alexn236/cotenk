# CoTenk – Produkt-Notizen

Stand: 27.09.2026. Dieses Dokument enthält drei Teile:

1. was umgesetzt wurde,
2. meine Gedanken zu Positionierung und Product-Market-Fit,
3. Ideen, bei denen ich **unsicher** war und die ich deshalb **nicht** umgesetzt habe. Sie brauchen deine Entscheidung.

---

## 1. Umgesetzt

### Workspace und Navigation
- **Befehlspalette (Ctrl/⌘ + K)**: durchsucht Titel und Inhalte aller Seiten (mit Textausschnitt), bietet Aktionen (neue Seite oder Ordner, Vorlagen, Build with AI, Navigation, Theme) und „Ask the agent: …“ direkt aus der Suche. Der Such-Button in der Sidebar war vorher ohne Funktion.
- **Rail neu sortiert**: Home, Docs, Tasks, Agents, Marketplace. Suche, Settings, Theme und Avatar sitzen unten. Der Avatar zeigt das echte Initial statt eines fest verdrahteten „A“. Ein Punkt am Agents-Icon zeigt an, wenn ein Agent arbeitet.
- **Shortcuts**: Ctrl+K (Palette), Ctrl+\ (Sidebar). Eine Übersicht steht unter Settings → About.
- **Ordner**: umbenennen (Doppelklick oder Menü, neue Ordner starten direkt im Umbenennen-Modus), „New page here“, löschen mit Undo. Leere Ordner zeigen „Empty folder“.
- **Seitenmenü** (Sidebar und Editor-Header, gleiche Einträge): Pin, Move to…, Duplicate, Copy as markdown, Publish to marketplace, Delete. **Löschen hat jetzt Undo** per Toast.
- **Toasts** für Rückmeldungen und Undo.
- **Bugfix**: Klicks in Sidebar-Menüs (auch auf den Hintergrund) haben ungewollt die Seite oder den Chat geöffnet, weil React-Portale Events durchreichen.

### Editor
- **Agent-Änderungen live**: Schreibt der Agent (oder Datei-Sync bzw. Supabase) eine offene Seite um, übernimmt der Editor das sofort. Vorher blieb der alte Stand stehen und hätte die Agent-Änderung beim nächsten Tippen überschrieben. Die Pill „Updated by agent · Undo“ macht die Änderung rückgängig, Ctrl+Z geht auch.
- **„Ask agent“** im Header: freie Anweisung oder Schnellaktionen (Zusammenfassen, Weiterschreiben, Aufgaben extrahieren, interaktives Diagramm, Überarbeiten). Man bleibt auf der Seite und sieht zu.
- **Slash-Menü erweitert**: Table, Callout, Bar chart (Embed), Progress bars (Embed), „Ask agent…“. Die Labels sind jetzt einheitlich Englisch, deutsche Suchbegriffe funktionieren weiter.
- **Theme-fähige Embeds**: Das Theme wird als `--ck-*`-CSS-Variablen ins sandboxed iframe gegeben (z. B. `var(--ck-accent)`), sodass Widgets in Hell und Dunkel passen.
- **Neue Seiten**: leerer Titel mit Fokus, man kann sofort tippen. Leere Seiten zeigen „Let the agent draft this page“ und „Start from a template“.
- **Task-Marker als Chips**: `@devin` und `due:2026-10-01` werden in der Ansicht als Chips gerendert (Agents mit ⚡, überfällig rot). Die Datei bleibt reines Markdown.

### Agents
- **Workspace-Konventionen für jeden Agent**: Der erste Turn jedes Chats bekommt (unsichtbar) die Regeln mit: Frontmatter behalten, neue Seiten als `.md` mit `# Titel`, Embed-Format, Theme-Variablen, Task-Marker. Das macht das Ökosystem offen, weil jeder ACP-Agent versteht, wie CoTenk-Seiten aussehen.
- **Seitenkontext**: Aktionen von einer Seite oder einem Task schicken Dateipfad und `cotenk-id` mit, der Agent arbeitet also an der echten Datei.
- **Aktivitäts-Pill**: Außerhalb der Agents-Ansicht zeigt eine schwebende Pill, was der Agent gerade tut (letzter Tool-Call), mit Stop und „Open chat“.
- **Leerer Zustand** mit hilfreicheren Vorschlägen und einem „Connect Devin CLI“-Button, wenn das Setup fehlt.
- **Web-Version**: Statt eines kryptischen `invoke`-Fehlers erscheint ein klarer Hinweis, dass Agents lokal in der Desktop-App laufen. Der Datei-Sync wird im Browser sauber übersprungen.
- **Settings → Agents**: Abschnitt „Open ecosystem“ mit Devin CLI (verfügbar) und Claude Code, Gemini CLI, Custom ACP (als „Coming soon“ markiert, siehe Teil 3).

### Tasks
- **Owner und Fälligkeit** direkt im Markdown: `@name` und `due:YYYY-MM-DD` (oder `📅 YYYY-MM-DD`).
- **Gruppierung** „By page“ oder „By date“ (Overdue, Today, Next 7 days, Later, No date).
- **Sidebar**: Hinweis „x overdue · y due today“, Liste „People & agents“ mit Filter pro Person oder Agent.
- **„Hand to agent“** pro Task: Der Agent erledigt ihn und hakt ihn in der Seite selbst ab.
- Quick-Add bleibt in Tasks (vorher sprang man in die neu erstellte Inbox-Seite). Standardfilter ist jetzt „Open“.

### Marketplace
- **Discover**: 8 kuratierte Vorlagen (Project brief, Meeting notes, Agent handoff brief, KPI dashboard, Roadmap timeline, Focus session, Weekly review, Decision log), davon 3 mit interaktiven Embeds. Dazu Community-Listings aus Supabase, Kategorien, Suche und Vorschau-Modal mit echter Darstellung inklusive Embeds.
- **Publish**: jede Seite als Snapshot veröffentlichen (Titel, Beschreibung, Kategorie; Preis vorerst nur „Free“, „Paid — coming soon“ ist sichtbar, aber deaktiviert).
- **My listings**: eigene Listings mit Install-Zähler, Unpublish.
- **Build with AI**: Seite beschreiben, der Agent baut sie im Workspace (optional mit interaktiven Widgets). Die Seite erscheint danach automatisch in Docs.
- **Migration**: `supabase/migrations/20260924_marketplace.sql` (Tabelle, RLS, Install-Zähler-Funktion). **Die musst du noch in Supabase ausführen.** Ohne sie läuft alles, nur Community und Publish zeigen einen Hinweis.

### Home
- Begrüßung mit echtem Namen (aus der E-Mail-Adresse statt fest „Alex“), Hinweis auf überfällige Tasks.
- Schnellaktionen: New page, Ask agent, Templates, Build with AI.
- „Get started“-Checkliste (4 Schritte, hakt sich anhand des echten Zustands selbst ab, ausblendbar).
- Tasks mit Chips (Fälligkeit zuerst), letzte Agent-Chats.
- Die Welcome-Seite zeigt jetzt alle Kernfunktionen zum Ausprobieren, inklusive Live-Widget.

### Geprüft
- `tsc` und `eslint` ohne Fehler oder Warnungen, `vite build` läuft durch.
- Im Browser durchgeklickt (mit temporärem Test-Harness ohne Login, danach wieder gelöscht): Palette, Slash-Menü, Chart-Embed, Ask-agent-Popover, Seitenmenü, externe Änderung mit Undo, Löschen und Undo, Vorlage installieren, Ordner anlegen, umbenennen und verschieben, Publish-Dialog, Light und Dark.
- **Nicht getestet**: der echte Devin-Agent (braucht die Desktop-App mit Devin-Login) und echtes Publish gegen Supabase (braucht die Migration und einen Login).

### Nachtrag 27.09. — Sync-Härtung und Welcome v2
- **Datenverlust-Bugs im Sync behoben** (beim Durchgehen von Login-Merge und Sign-out gefunden):
  - Schlug der erste Pull fehl (offline), durfte der Sync trotzdem pushen – und löschte dabei jede Remote-Seite, die lokal fehlte. Jetzt: kein Push vor erfolgreichem Pull, Pull wird mit Backoff wiederholt.
  - Gelöscht wird remote nur noch, was lokal explizit gelöscht wurde (nicht mehr „fehlt lokal“). Gepusht werden nur geänderte Zeilen.
  - Desktop: Der Datei-Mirror startete bei einem fehlgeschlagenen Pull und glich den Ordner gegen die Seed-Seiten ab → alle Account-Dateien wurden von der Platte gelöscht. Er wartet jetzt auf einen erfolgreichen Pull.
  - Sign-out verwarf Änderungen im 900-ms-Debounce. Jetzt wird vorher geflusht (Seiten und Agent-Chats).
  - **Sign-out auf dem Desktop löscht keine Dateien mehr.** Der Ordner gehört dem Nutzer (ggf. ein Obsidian-Vault); die Seiten bleiben lokal. Im Browser wird wie bisher auf die Seed-Seiten zurückgesetzt.
- **Welcome-Seite versioniert** (`d-welcome-v2`, `src/lib/welcome.ts`): Accounts mit einer *unveränderten* alten Version bekommen die neue; bearbeitete Kopien bleiben. Fingerprint ignoriert Datums-, Häkchen- und Widget-Zustand.
- **Web-Hinweis**: Im Browser zeigt die Welcome-Seite „Get the desktop app — agents run there“ statt „Connect an agent“; „Ask agent“ im Web bietet im Toast „Get the app“. URL über `VITE_DESKTOP_DOWNLOAD_URL` (Standard: GitHub Releases).
- **Marketplace ohne Login lesbar**: `20260927_marketplace_public_read.sql` (Policy für `anon`, Install-Zähler auch anonym).
- **Externe Links** in Seiten öffnen im System-Browser (`open_url`), statt die App-Webview wegzunavigieren.
- **Geprüft (27.09.)**: `tsc`, `eslint`, `vite build`, `cargo check` grün. Headless-Chrome-Durchlauf gegen den Dev-Server (23 Checks, alle grün, keine Konsolenfehler): Welcome/CTA im Web, Chart-Hover am Rand, Theme-Wechsel in Embeds, Slider-Zustand übersteht Reload, Notion-ZIP per Drop, Wikilink + Backlinks, Seite per Drag in Root, Kanban-Drag setzt `due:`, Community ohne Login, Palette-Import, Review-Dialog (Blockzahl, Allow, Reads ohne Prompt). **Nicht getestet**: echter Login-Merge und Realtime gegen Supabase (kein Test-Account, Migrationen nicht angewendet), echte Agents (Claude/Devin/Gemini) in der Desktop-App.

### Nachtrag 28.09. — Mehrere Nutzer, Profile, Onboarding
- **Seiten-Schlüssel pro Workspace** (`20260928_workspaces_profiles.sql`): `docs`/`folders` haben jetzt `(workspace_id, id)` als Primärschlüssel. Vorher war vermutlich `id` allein der Schlüssel, und die Seed-Seiten tragen feste IDs (`d-welcome-v2` …) – ein zweiter Account konnte seine Welcome-Seite dann nicht hochladen (RLS-Fehler, ganzer Batch scheitert). Das Schema von `docs`/`folders` stand bisher in keiner Migration; die neue legt es an bzw. übernimmt bestehende Tabellen. **Nicht gegen Supabase geprüft** (kein Zugang von hier) – bitte vorher mit `select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.docs'::regclass and contype = 'p';` nachsehen und danach mit zwei Test-Accounts gegenprüfen.
- **Neue IDs sind zufällige UUIDs** (`src/lib/ids.ts`) für Seiten, Ordner, Chats, Importe und Listings.
- **Workspaces + Mitglieder**: jeder Account hat einen persönlichen Workspace (Trigger bei Sign-up, Backfill für bestehende). RLS läuft über `workspace_members` (owner/editor/viewer). Geteilte Workspaces brauchen „nur“ noch Einladungen und eine Workspace-Auswahl in der UI.
- **Agent-Chat-Sync repariert**: löscht remote nur noch, was lokal gelöscht wurde; kein Push vor erfolgreichem Pull; nur geänderte Chats werden hochgeladen.
- **Lokal und Account getrennt**: Abgemeldet = Seiten dieses Geräts (Browser-Cache + eigener Ordner). Angemeldet = Account-Workspace + eigener Ordner `~/Documents/CoTenk (name)`. Beim ersten Login fragt ein Dialog, ob lokale Seiten in den Account wandern. Wer nach dem Update zuerst die App nutzt, behält den bisherigen Ordner.
- **Profile**: Anzeigename (Sign-up, Settings → Account, Publish-Dialog). Der Marketplace zeigt nie mehr den E-Mail-Präfix; bestehende Listings mit automatisch abgeleitetem Autor werden in der Migration auf Anzeigename bzw. „Anonymous“ gesetzt.
- **Passwort vergessen / ändern**: Reset per Code aus der E-Mail (Desktop) oder Link (Web). Braucht `{{ .Token }}` im Supabase-Template „Reset Password“.
- **Onboarding an einem Ort**: Home-Checkliste mit 3 Schritten (Agent verbinden → Agent ändert eine Seite → Notizen importieren); die App startet auf Home, bis sie erledigt oder ausgeblendet ist. Im Web: Notizen, Desktop-App, Login.
- **Geführtes Agent-Setup** (Dialog): Node.js prüfen → CLI per Klick installieren (Terminal mit festem `npm install -g …`) → Sign-in → „Try it on the welcome page“ öffnet direkt „Ask agent“.
- **Geprüft**: `tsc`, `eslint`, `vite build`, `cargo check`. **Nicht getestet**: Migration gegen eine echte Datenbank, Login-/Merge-Flow, Passwort-Reset, Installation über den Setup-Dialog in der Desktop-App.

### Nachtrag 02.10. — Daten, Verlauf, Anhänge, Tasks
- **Version history + "Recently deleted"** (`20261005_history_cleanup_account.sql`): Ein Datenbank-Trigger auf `docs` legt Versionen an (vor jeder Bearbeitungsphase, höchstens alle 10 Minuten, 40 pro Seite) und sichert jede gelöschte Seite 60 Tage. Unabhängig vom Client, also auch bei Sync-Fehlern. UI: Seitenmenü → Version history; Settings → Data & backup → Recently deleted. Nur mit Account.
- **Export + Konto löschen** (Settings → Data & backup): ZIP mit Seiten als Markdown (Ordner/Unterseiten als Verzeichnisse), Chats, Bildern und Dateien (relative Links). Konto löschen: entfernt erst alle Dateien im Storage, dann `delete_account()` (löscht `auth.users`, alles andere hängt per CASCADE dran). Bestätigung per E-Mail-Eingabe, Export-Angebot davor. Neuer Rust-Befehl `fs_write_b64` für das Speichern auf dem Desktop.
- **Unbenutzte Dateien**: `referenced_note_files()` sucht in Seiten, Versionen und Chats. Settings → "Check now", außerdem wöchentlich leise nach einem Sync (nur Dateien älter als 3 Tage).
- **Bilder**: eigener Bild-Block (nie Markdown-Text sichtbar), Größe per Griff ziehen (`#w=480` im Link), Bildunterschrift, Vergrößern (Lightbox), Löschen. **Dateianhänge** (`/file`, Einfügen): `[name](cotenk-file:pfad#s=bytes)`, bis 25 MB, Bucket `note-images` (mime-Beschränkung aufgehoben).
- **Tasks**: Datums-Menü am Task (Heute/Morgen/Freitag/Woche/Datumsauswahl), Wiederholung `every:day|weekday|week|month|year` (beim Abhaken entsteht die nächste Aufgabe darunter), Benachrichtigungen (`src/lib/notifications.ts`): Tageszusammenfassung für fällige/überfällige Tasks mit deinem @Namen und Hinweis, wenn ein neuer Task mit deinem @Namen von außen (Agent, anderes Gerät) erscheint.
- **Unterseiten** (`docs.parent_id`): Seitenmenü → Add subpage, im Baum einklappbar, Drag einer Seite auf eine andere verschachtelt sie. Löschen einer Elternseite hebt die Unterseiten eine Ebene hoch. **Der Datei-Spiegel auf der Platte bleibt flach** (die Beziehung lebt nur in der Datenbank/im lokalen Speicher). **Umbenennen** passt `[[Links]]` an, sobald der Titel verlassen wird (nicht bei doppelten Titeln).
- **E-Mails**: `node scripts/email-templates.mjs build|preview|apply` — sechs Supabase-Vorlagen (Bestätigung, Passwort zurücksetzen mit Link **und** Code, Magic Link, Einladung, E-Mail-Wechsel, Re-Auth) im CoTenk-Look inkl. Dark Mode. `apply` braucht `SUPABASE_ACCESS_TOKEN`.
- **Geprüft**: `tsc`, `eslint`, `vite build`, `cargo check`; Trigger-Regex per SQL getestet. **Nicht getestet**: alle UI-Abläufe (Export, Konto löschen, Verlauf, Anhänge, Unterseiten, Benachrichtigungen) und der Trigger gegen echte Seiten.

---

## 2. Positionierung und Product-Market-Fit

**Ein Satz:** *Der offene Workspace, in dem dein lokaler Agent direkt mitschreibt – Seiten, Tasks und kleine Tools an einem Ort, für dich allein oder im Team.*

**Beste Startzielgruppe (Wedge):** Solo-Entwickler, Indie-Hacker und kleine Tech-Teams, die schon mit CLI-Agents arbeiten (Devin, Claude Code, Gemini CLI) und ihre Planung heute in Notion oder Obsidian daneben haben. Ihr Problem: Kontext wird ständig zwischen Notizen und Terminal hin- und herkopiert. CoTenk löst das, weil die Seiten echte Markdown-Dateien sind, auf denen der Agent direkt arbeitet.

**Differenzierung:**
- vs. **Notion AI**: offen (jeder ACP-Agent, eigener Agent, lokale Dateien, kein Lock-in) und keine eingebaute KI, die man mitbezahlt.
- vs. **Obsidian**: Agent-first, Tasks mit Owner (Mensch oder Agent) und interaktive Embeds ohne Plugin-Chaos.
- vs. **reinem Agent-Chat**: Ergebnisse landen als dauerhafte, teilbare Seiten, nicht in einem Chatverlauf.

**Wachstumsschleife:** Agent baut eine interaktive Seite → Nutzer veröffentlicht sie → andere installieren → sie werden selbst Creator. Der Marketplace ist darum nicht nur ein Feature, sondern der Distributionskanal.

**Aktivierungsmetrik (Vorschlag):** „Erste Agent-Änderung auf einer eigenen Seite innerhalb der ersten Sitzung.“ Genau darauf zielen die Welcome-Seite, die Checkliste und „Ask agent“ im Header.
**North-Star-Vorschlag:** Wöchentlich aktive Seiten, die sowohl von einem Menschen als auch von einem Agent bearbeitet wurden.

---

## 3. Ideen – bewusst NICHT umgesetzt (Entscheidung bei dir)

### Marketplace und Monetarisierung
- **Bezahlte Listings mit Provision.** Vorschlag: Stripe Connect, 15–20 % Provision für CoTenk, Auszahlung an Creator. Offen sind Steuern/USt (EU-OSS), Rückerstattungen, Mindestpreis und ob Käufer Updates bekommen. Die DB-Spalte `price_cents` ist vorbereitet, die UI zeigt „Paid — coming soon“.
- **Moderation.** Community-Listings können HTML/JS enthalten. Sie laufen sandboxed (kein Zugriff auf Session oder Daten), könnten aber z. B. Phishing-Formulare zeigen. Vorschlag: „Report“-Button, Review vor Veröffentlichung für Listings mit Embeds, verifizierte Creator.
- **Listing-Updates und Versionen** (aktuell ein Snapshot), **Bewertungen**, **„Remix“-Zähler**, Creator-Profile.
- **„Für mich bauen lassen“ als bezahlter Service** (jemand oder ein Agent baut auf Anfrage eine Seite gegen Geld). Das lässt sich über Build with AI plus Paid Listings abbilden, das Geschäftsmodell ist aber offen.

### Agents
- ~~**Weitere ACP-Agents**~~ → **umgesetzt (27.09.)**: Gemini CLI (`gemini --experimental-acp`) und ein frei konfigurierbarer ACP-Befehl („Custom“) laufen neben Claude Code und Devin. `acp_spawn` nimmt dafür einen optionalen Befehl entgegen. **Wieder entfernt (02.10.)**: Es gibt nur noch Claude Code und Devin CLI.
- **Skills & MCP nur in CoTenk (02.10.)**: Settings → Skills & MCP. Skills (Markdown, Import von .md) und MCP-Server (Befehl oder URL) sind nur nutzbar, wenn die Agents in CoTenk laufen. Ohne CoTenk gestartetes `claude` oder `devin` kann sie nicht nutzen. Mit Login synct die Liste über Supabase (`agent_extensions`, Migration muss noch angewendet werden); Werte von Keys/Tokens bleiben auf dem Gerät.
  - **Claude Code**: alles pro ACP-Session (Plugin für Skills, `mcpServers`).
  - **Devin CLI** (3000.10.31) ignoriert MCP-Server aus `session/new`. Deshalb liegt im Workspace `.devin/mcp_config.local.json` mit einem Gateway (`cotenk --mcp-gateway`). Das Gateway liefert Skills und die MCP-Tools nur an Devin-Prozesse mit CoTenks Token. Ein normales `devin` im Workspace-Ordner sieht den Server, aber ohne Tools.
  - Offen: OAuth-MCPs (Linear, Supabase …) brauchen bei Devin den Login über mcp-remote im Browser; Skills mit Zusatzdateien (Skripte) werden noch nicht unterstützt, nur reine SKILL.md.
- ~~**Freigabe statt Auto-Approve.**~~ → **umgesetzt (27.09.)**: Edits und Befehle erscheinen als Block-Diff („Claude Code wants to change 3 blocks in …“) mit Allow / Allow for this chat / Reject. Lesen braucht keine Freigabe. Auto-Approve ist in Settings → Agents schaltbar; Standard ist „Review“.
- **Agent-Präsenz im Dokument** (welchen Block der Agent gerade bearbeitet) und farbig markierte Agent-Änderungen.
- **BYOK in der Web-Version** (Modell per API-Key, laut idee.txt „später“), damit Agents auch ohne Desktop-App laufen.
- ~~**Embeds mit gespeichertem Zustand.**~~ → **umgesetzt (27.09.)**: `cotenk.save(data)` / `cotenk.state`. Der Zustand steht als `<script type="application/json" data-cotenk-state>` im Embed-Block selbst, synct also wie jede Änderung. Der Burndown auf der Welcome-Seite nutzt es.

### Workspace
- ~~**Lokaler Modus ohne Account**~~ → **umgesetzt (27.09.)**: Die App startet ohne Login direkt im Workspace. Seiten liegen im Browser-Cache (Desktop: zusätzlich im Workspace-Ordner), Agents laufen lokal ohne Account. Login kommt als Dialog erst, wenn er einen Grund hat (Sync, Publish, Community) – Sidebar-Footer, Rail, Settings → Account, Palette. Beim ersten Login werden lokale Seiten in den Account gemergt (unveränderte Seed-Seiten ausgenommen); Sign-out setzt das Gerät auf den Seed zurück. Die Welcome-Seite ist jetzt ein interaktiver Spielplatz (animiertes Live-Dashboard, Burndown mit Scope-Regler als Agent-Beispiel) und über Ctrl K → „Open the welcome page“ jederzeit wiederherstellbar.
- ~~**Obsidian-Vault oder Markdown-Ordner importieren.**~~ → **umgesetzt (27.09.)**: Import-Dialog und Drop-Zone (Fenster-weit) für Notion-Export (.zip, auch verschachtelt; Hash-Suffixe, Links → `[[…]]`, `<aside>` → Callout, CSV-Datenbanken → Tabelle), Obsidian-Vault (Ordner wählen oder droppen; Frontmatter-Tags, `![[…]]`) und lose .md/.txt/.csv. Bilder bis 512 KB kommen inline mit. Danach: „Summarize with agent“.
- ~~**Seiten verlinken** (`[[Seite]]`) mit Backlinks~~ → **umgesetzt (27.09.)**: `[[Titel]]`, `[[Titel|Label]]`, fehlende Seiten werden per Klick angelegt, „Linked from“ unter jeder Seite. Offen: verschachtelte Unterseiten, Umbenennen aktualisiert Links noch nicht.
- ~~**Drag & Drop** für Seiten~~ → **umgesetzt (27.09.)**: Seiten in Ordner ziehen bzw. auf „Documents“ (Root). Offen: Reihenfolge innerhalb eines Ordners und Blöcke.
- ~~**Kanban-Ansicht für Tasks**~~ → **umgesetzt (27.09.)**: Tasks → Board (Spalten nach Fälligkeit plus Done; Karte ziehen setzt `due:` bzw. hakt ab). Offen:, Datums-Picker, wiederkehrende Tasks, Benachrichtigungen bei `@mention`.
- **Teilen per öffentlichem Link** (read-only), später Teams und Rollen. Mehrere Menschen im selben Dokument waren laut idee.txt bewusst erst mal ausgelassen.
- **Deutsche UI / i18n.** Die UI ist jetzt einheitlich Englisch (vorher gemischt). Falls die erste Zielgruppe deutschsprachig ist, lohnt sich i18n früh.

### Technik
- ~~**Bundle-Größe**~~ → **umgesetzt (27.09.)**: Views, Publish-Dialog und Importer laden lazy, Vendor-Chunks (react, supabase, markdown, motion) separat. Haupt-Chunk 1,21 MB → 361 kB, keine Vite-Warnung mehr.
- ~~**Supabase-Sync** lädt nur beim Login.~~ → **umgesetzt (27.09.)**: Realtime-Abo auf docs/folders plus Re-Pull bei Fensterfokus (Fallback), neuere `updatedAt` gewinnt. Braucht `20260927_realtime.sql`. Alter Text: Realtime-Subscriptions würden Änderungen von anderen Geräten sofort zeigen; der Editor kann sie dank Live-Follow schon übernehmen.
- ~~**Produkt-Analytics**~~ → **umgesetzt (27.09.)**: PostHog EU ohne SDK (`src/lib/analytics.ts`), aktiv nur mit `VITE_POSTHOG_KEY`, Opt-out in Settings → About, respektiert Do-Not-Track. Events: `app_opened`, `agent_page_changed` (`first`, `session_index`), `signed_in` (`minutes_since_first_open`), `import_completed`, `agent_turn_completed`, `agent_permission`, `template_installed`, `page_published`, `page_cta`. Offen (rechtlich): ob die Web-Version ein Consent-Banner braucht.

### Preis-Idee für CoTenk selbst (nur Vorschlag)
- **Free**: solo, unbegrenzte Seiten, eigener Agent (BYO).
- **Pro (~8 €/Monat)**: Sync auf beliebig vielen Geräten, Paid Listings verkaufen, Versionshistorie.
- **Team (~12 €/Nutzer)**: geteilte Workspaces, Rollen, Agent-Freigaben und Audit-Log.
