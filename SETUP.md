# Einrichtung / Setup — Schritt für Schritt

Deutsche Oberfläche. Englische Begriffe stehen in Klammern, weil die Doku sie verwendet.

Das Sheet heißt "Car Share — August 2026" und liegt in Robins Drive. Die Sheet-ID steht
absichtlich nicht hier — dieses Repo ist öffentlich.

Schritte mit **→ an Claude** liefern etwas, das für den nächsten Schritt gebraucht wird.

---

## A. Google Sheet

Erledigt — das Sheet existiert bereits.

Wichtig: das Sheet **nicht freigeben** (nicht "Freigeben" / *Share*). Die App greift über
das Skript zu, das unter deinem Konto läuft. Niemand sonst braucht Zugriff.

---

## B. Apps Script — Code einfügen

1. Im Sheet: **Erweiterungen** (*Extensions*) → **Apps Script**. Ein neuer Tab öffnet sich.
2. Oben links auf den Projektnamen ("Unbenanntes Projekt" / *Untitled project*) klicken und
   in `Car Share API` umbenennen.
3. Links in der Leiste **Dateien** (*Files*) siehst du `Code.gs`. Klick hinein, markiere
   alles (⌘A) und lösche es. Füge stattdessen den Inhalt von
   `app/apps-script/Code.gs` ein.
4. Zweite Datei anlegen: neben **Dateien** auf **+** → **Skript** (*Script*). Nenne sie
   `setup` (die Endung `.gs` kommt automatisch). Füge dort den Inhalt von
   `app/apps-script/setup.gs` ein.
5. **Speichern** (*Save*) — das Disketten-Symbol oder ⌘S.

> **Deshalb fehlte `setupSheet`:** die Funktions-Auswahlliste zeigt nur Funktionen, die im
> Projekt tatsächlich existieren. Vor dem Einfügen ist sie leer.

---

## C. Einmalige Migration ausführen

6. In der Leiste oben: die Auswahlliste neben **Ausführen** (*Run*) und **Debuggen**
   (*Debug*) aufklappen und **`setupSheet`** wählen. Dann auf **Ausführen** klicken.
7. Beim ersten Mal fragt Google nach Berechtigungen:
   - **Berechtigungen überprüfen** (*Review permissions*)
   - dein Google-Konto wählen
   - Die Warnung "Google hat diese App nicht überprüft" ist normal bei eigenen Skripten:
     unten auf **Erweitert** (*Advanced*) klicken
   - dann **Zu "Car Share API" wechseln (unsicher)** (*Go to … (unsafe)*)
   - **Zulassen** (*Allow*)
8. Unten öffnet sich das **Ausführungsprotokoll** (*Execution log*). Dort steht eine Zeile:
   ```
   APP_TOKEN = ...
   ```
   Diesen Wert kopieren — er wird in Schritt 13 gebraucht. **→ an Claude** brauchst du ihn
   nicht zu schicken, er kommt direkt in GitHub.
   Verloren? Funktion `showToken` wählen und **Ausführen**.
9. Zurück im Sheet prüfen: es gibt jetzt die Tabellenblätter **Reservations** und
   **Karma Actions**, und **Trip Log** hat neue Spalten M–S.

---

## D. Als Web-App bereitstellen (*deploy*)

10. Oben rechts **Bereitstellen** (*Deploy*) → **Neue Bereitstellung** (*New deployment*).
11. Links neben "Bereitstellungstyp auswählen" auf das **Zahnrad** klicken → **Web-App**
    (*Web app*).
12. Felder ausfüllen:
    | Feld (deutsch) | Wert |
    |---|---|
    | **Beschreibung** (*Description*) | `v1` |
    | **Ausführen als** (*Execute as*) | **Ich** (deine E-Mail) |
    | **Zugriffsberechtigung** / **Wer hat Zugriff** (*Who has access*) | **Alle** (*Anyone*) |

    ⚠️ **Alle** — nicht "Alle mit einem Google-Konto" (*Anyone with a Google account*).
    Die Freiwilligen sind nicht eingeloggt; mit der falschen Option bekommt die App nur
    Anmeldeseiten zurück. Das ist der häufigste Fehler an dieser Stelle.
13. **Bereitstellen** (*Deploy*) klicken, ggf. nochmal autorisieren. Danach erscheint die
    **Web-App-URL** — sie endet auf `/exec`. **→ an Claude schicken.**

### Nach jeder Backend-Änderung

Neuer Code allein reicht nicht. Immer:
**Bereitstellen** → **Bereitstellungen verwalten** (*Manage deployments*) → **Stift-Symbol**
→ **Version: Neue Version** (*New version*) → **Bereitstellen**.
Die URL bleibt gleich. Wird das vergessen, läuft weiter der alte Code — das ist der
klassische "warum ist mein Fix nicht live" -Moment.

---

## E. GitHub + Hosting

GitHub ist auf Englisch, egal welche Systemsprache.

14. Konto anlegen (falls nötig). **New repository**, Name `car-share-app`, **Public**
    (GitHub Pages ist nur bei öffentlichen Repos kostenlos). **→ an Claude schicken.**
15. Im Repo: **Settings** → **Pages** → Source: **GitHub Actions**.
16. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**,
    zweimal:
    - `API_URL` = die `/exec`-URL aus Schritt 13
    - `APP_TOKEN` = der Wert aus Schritt 8

    Was das bringt und was nicht: die Werte bleiben aus dem öffentlichen Quellcode und
    aus der Git-Historie heraus. Vor jemandem, der die fertige App im Browser inspiziert,
    verstecken sie nichts. Für neun Leute mit einem Auto ist das in Ordnung — der
    eigentliche Schutz ist, dass das Skript genau vier Operationen akzeptiert und sonst
    nichts.
17. Claude pusht Code und Workflow. Die Seite erscheint dann unter
    `https://<dein-username>.github.io/car-share-app/`.

---

## F. Auf die Handys

18. iPhone: Link in **Safari** öffnen → **Teilen** → **Zum Home-Bildschirm**
    (*Add to Home Screen*).
    Android/Chrome: Menü → **App installieren**.
19. Alltag bleibt wie gehabt: Spritpreis, Entfernungen, Mitglieder und Karma-Aktionen
    änderst du direkt im Sheet. Die App zieht die Änderungen beim nächsten Sync.

---

## Kurzes Glossar

| Deutsch | Englisch |
|---|---|
| Bereitstellen | Deploy |
| Neue Bereitstellung | New deployment |
| Bereitstellungen verwalten | Manage deployments |
| Ausführen / Ausführungsprotokoll | Run / Execution log |
| Erweiterungen | Extensions |
| Berechtigungen überprüfen | Review permissions |
| Erweitert | Advanced |
| Zulassen | Allow |
| Zugriffsberechtigung · Alle | Who has access · Anyone |
| Projekteinstellungen · Skripteigenschaften | Project settings · Script properties |
| Tabellenblatt | Sheet / tab |
