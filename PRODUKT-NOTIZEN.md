# CoTenk – Produkt-Notizen

Stand: 24.09.2026. Dieses Dokument enthält drei Teile:

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
- **Weitere ACP-Agents** (Claude Code über `claude-code-acp`, Gemini CLI, eigener Befehl). Dafür muss `acp_spawn` in Rust generalisiert werden (Befehl und Argumente statt fest `devin acp`), und Auth ist pro Agent anders. In Settings steht es als „Coming soon“; nimm das raus, falls du es nicht ankündigen willst.
- **Freigabe statt Auto-Approve.** Aktuell werden alle Agent-Berechtigungen automatisch erteilt. Für Vertrauen (besonders in Teams) wäre ein Diff-Review sinnvoll: „Agent möchte 3 Blöcke ändern – ansehen, übernehmen, verwerfen.“
- **Agent-Präsenz im Dokument** (welchen Block der Agent gerade bearbeitet) und farbig markierte Agent-Änderungen.
- **BYOK in der Web-Version** (Modell per API-Key, laut idee.txt „später“), damit Agents auch ohne Desktop-App laufen.
- **Embeds mit gespeichertem Zustand.** Widgets wie Kanban oder Habit-Tracker verlieren ihren Zustand beim Neuladen. Idee: eine kleine, sichere postMessage-API (`cotenk.save(data)`), die Daten zurück ins Markdown schreibt. Das ist mächtig, braucht aber ein durchdachtes Sicherheitskonzept.

### Workspace
- **Lokaler Modus ohne Account** („Ausprobieren ohne Registrierung“, Speicherung im Browser, später migrieren). Das senkt die Einstiegshürde stark, widerspricht aber dem aktuellen Plan „Login per Supabase“.
- **Obsidian-Vault oder Markdown-Ordner als Workspace importieren.** Starker Wedge, weil der Datei-Sync bereits fremde `.md`-Dateien übernimmt; es fehlt nur ein Import-Flow.
- **Seiten verlinken** (`[[Seite]]`) mit Backlinks, verschachtelte Unterseiten und Ordner.
- **Drag & Drop** für Seiten und Blöcke.
- **Kanban-Ansicht für Tasks**, Datums-Picker, wiederkehrende Tasks, Benachrichtigungen bei `@mention`.
- **Teilen per öffentlichem Link** (read-only), später Teams und Rollen. Mehrere Menschen im selben Dokument waren laut idee.txt bewusst erst mal ausgelassen.
- **Deutsche UI / i18n.** Die UI ist jetzt einheitlich Englisch (vorher gemischt). Falls die erste Zielgruppe deutschsprachig ist, lohnt sich i18n früh.

### Technik
- **Bundle-Größe** ~1 MB (Warnung von Vite). Code-Splitting für Marketplace und Agents würde den Start beschleunigen.
- **Supabase-Sync** lädt nur beim Login. Realtime-Subscriptions würden Änderungen von anderen Geräten sofort zeigen; der Editor kann sie dank Live-Follow schon übernehmen.
- **Produkt-Analytics** (datenschutzfreundlich, z. B. PostHog EU), um die Aktivierungsmetrik tatsächlich zu messen.

### Preis-Idee für CoTenk selbst (nur Vorschlag)
- **Free**: solo, unbegrenzte Seiten, eigener Agent (BYO).
- **Pro (~8 €/Monat)**: Sync auf beliebig vielen Geräten, Paid Listings verkaufen, Versionshistorie.
- **Team (~12 €/Nutzer)**: geteilte Workspaces, Rollen, Agent-Freigaben und Audit-Log.
