---
id: aleph.example-session
purpose: |
  Konkrete Beispiel-Session — diesmal mit Fokus auf *Retention*:
  wie aus einem Gespräch ein durchsuchbares Gedächtnis wird, wie
  man sich Wochen später wieder einklinkt, und welche konkreten
  Queries das Wiederfinden tragen. Stützt sich auf `learning.md`
  (Ausubel-Anchor, Generation Effect, Spacing) und `agent-loop.md`
  (Reply- + Extend-Constraints).
audience: prompt authors, UI implementers, reviewers
---

# Beispiel-Session: Gödels Unvollständigkeitssätze + Retention

Zwei Sessions, knapp zwei Wochen auseinander. Thema: Gödel.
Der Punkt: die *zweite* Session zeigt, wie der Pod der ersten
Session als externes Gedächtnis dient — und welche Queries
das tragen.

## Ausgangslage

Im Pod existieren aus früheren, unverbundenen Sessions:

```
g:Mathematics   prefLabel "Mathematics"
g:Logic         prefLabel "Logic"        broader g:Mathematics
g:FormalSystem  prefLabel "Formal System" broader g:Logic
g:Hilbert       a foaf:Person, prefLabel "David Hilbert"
```

Vier Knoten, drei Kanten. User hat noch nie über Gödel
gesprochen.

---

## Session 1 — 2026-05-28, Erstbegegnung

### Turn 1

**User msg1:** "Ich interessiere mich für Gödels
Unvollständigkeitssätze, hab keine Ahnung wo ich anfangen soll."

Explizite Frage nach Einstieg → keine Gegenfrage erzwingen,
direkt antworten. Anchor: `Formal System` existiert bereits.

**Agent msg2:**

```
body: "Gödel zeigt 1931: jedes formal system, das Arithmetik
beherrscht, hat wahre Aussagen, die es nicht beweisen kann.
Schlägt damit Hilberts Programm im Kern. Soll ich mit der
Beweisidee anfangen oder mit der Tragweite?"
```

- *Anchor (Ausubel):* `Formal System` exakt wie `prefLabel`,
  `Hilbert` auch — verbindet Neues an Vorhandenes.
- *Signaling:* beide Token matchen Graph-Labels.
- *Segmenting:* 2 Sätze Substanz + 1 Wahlfrage zum Pacing
  (Mayer-Segmenting: User pacet selbst).
- *Konkretheit (Paivio):* "wahre Aussagen, die es nicht
  beweisen kann" statt "Resultat über Beweisbarkeit".

**Extend extend2.jsonld** (neu nur was direkt referenziert ist):

```json
{
  "@graph": [
    { "@id": "g:GoedelIncompleteness", "@type": "Concept",
      "prefLabel": { "en": "Gödel's Incompleteness Theorems" },
      "broader":   "g:Logic",
      "related":   "g:FormalSystem",
      "perceivedImportance": 0.8,
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:02:11Z" },

    { "@id": "g:Goedel", "@type": "foaf:Person",
      "prefLabel": { "en": "Kurt Gödel" },
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:02:11Z" },

    { "@id": "g:GoedelIncompleteness",
      "derivedFrom": "g:Goedel" }
  ]
}
```

Zwei neue Entities, beide angedockt. Person + zugeordnete
Erkenntnis. `Hilbert` *nicht* neu — schon da, reicht.

### Turn 2

**User msg3:** "Tragweite. Ich dachte immer Mathematik wäre
vollständig."

Deklarativ → Generation-Effect erlaubt am Ende.

**Agent msg4:**

```
body: "Genau das Hilbert-Programm war: alles entscheidbar
machen. Gödels erster Satz killt Vollständigkeit, der zweite
killt den Beweis der eigenen Consistency. Was wäre die
Konsequenz, wenn ein System seine eigene Widerspruchsfreiheit
beweisen könnte?"
```

- *Anchor:* `Hilbert` (existing person). Bezug auf Vorturn
  über `der erste/zweite Satz`.
- Zwei neue Konzepte werden *eingeführt* aber im Reply nur
  beschreibend genannt — Formalisierung geschieht im Extend.
- *Generation Effect:* Frage zwingt User zum Nachdenken über
  Selbstbezug — Vorbereitung auf Turn 3.

**Extend extend4.jsonld:**

```json
{
  "@graph": [
    { "@id": "g:FirstIncompleteness", "@type": "Concept",
      "prefLabel": { "en": "First Incompleteness Theorem" },
      "broader":   "g:GoedelIncompleteness",
      "perceivedImportance": 0.75,
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:05:48Z" },

    { "@id": "g:SecondIncompleteness", "@type": "Concept",
      "prefLabel": { "en": "Second Incompleteness Theorem" },
      "broader":   "g:GoedelIncompleteness",
      "perceivedImportance": 0.7,
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:05:48Z" },

    { "@id": "g:HilbertProgram", "@type": "Concept",
      "prefLabel": { "en": "Hilbert's Program" },
      "derivedFrom": "g:Hilbert",
      "related":     "g:GoedelIncompleteness",
      "perceivedImportance": 0.65,
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:05:48Z" }
  ]
}
```

Drei neue Konzepte, alle mit ≥1 Kante zu Bestehendem. Unter
`max_new: 5`. Hilbert-Programm verbindet die alte
Hilbert-Person mit dem neuen Gödel-Cluster — *triangulation*,
nicht nur lineare Verlängerung.

### Turn 3

**User msg5:** "Wie zeigt man so was überhaupt? Selbstbezug
klingt komisch."

Frage → antworten, optional Probing am Ende.

**Agent msg6:**

```
body: "Gödel kodiert syntax als Zahlen — jedes Symbol, jede
Formel, jeder Beweis bekommt eine Nummer. Dann baut er eine
Formel, die *über sich selbst* sagt: 'ich bin nicht beweisbar'.
Wenn das System die Formel beweisen würde, wäre sie wahr — also
unbeweisbar. Widerspruch. Soll ich beim Diagonalargument
weitermachen?"
```

- *Anchor:* knüpft an "Selbstbezug" aus User-Turn.
- *Konkretheit:* "jedes Symbol bekommt eine Nummer" statt
  "arithmetische Kodierung der Syntax".
- *Generation Effect:* Wahl-Frage am Ende. User closet hier
  die App, antwortet nicht mehr. → wird zur Open Thread.

**Extend extend6.jsonld:**

```json
{
  "@graph": [
    { "@id": "g:GoedelNumbering", "@type": "Concept",
      "prefLabel": { "en": "Gödel Numbering" },
      "broader":   "g:FirstIncompleteness",
      "perceivedImportance": 0.6,
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:09:33Z" },

    { "@id": "g:DiagonalLemma", "@type": "Concept",
      "prefLabel": { "en": "Diagonal Lemma" },
      "requires":  "g:GoedelNumbering",
      "related":   "g:FirstIncompleteness",
      "perceivedImportance": 0.55,
      "wasGeneratedBy":  "g:Session_117",
      "generatedAtTime": "2026-05-28T10:09:33Z" }
  ]
}
```

`requires`-Kante (siehe `schema.md`) drückt explizit aus:
DiagonalLemma setzt GoedelNumbering voraus. Für späteres
View-Mode-Rendering wertvoll — Reihenfolge wird erzwingbar.

---

## Was nach Session 1 im Pod liegt

```
+ g:GoedelIncompleteness   broader Logic, related FormalSystem, derivedFrom Goedel
+ g:Goedel                 (Person)
+ g:FirstIncompleteness    broader GoedelIncompleteness
+ g:SecondIncompleteness   broader GoedelIncompleteness
+ g:HilbertProgram         derivedFrom Hilbert, related GoedelIncompleteness
+ g:GoedelNumbering        broader FirstIncompleteness
+ g:DiagonalLemma          requires GoedelNumbering, related FirstIncompleteness
+ 6 ChatMessages            position 1..6 in Session_117
+ 1 offene Probing-Frage    msg6 endet mit "?", kein msg7
```

Sieben neue Konzepte, jedes mit Anschluss. Drei
Chat-Replies, alle ≤4 Sätze. *Eine* offene Frage. Das ist
das Retentions-Substrat.

---

## Retentions-Mechanik — was das Setup tatsächlich liefert

`learning.md` listet die Prinzipien. Hier ist, wie sie sich
im Pod manifestieren:

1. **Concept-Graph als Ausubel-Anchor.** Beim nächsten Login
   sind die Knoten da. Erneutes Sehen reaktiviert — Spacing.
2. **ChatMessages sind first-class Entities.** Was du gesagt
   hast und was der Agent geantwortet hat ist queryable per
   SPARQL, nicht in einer Blob-History versteckt.
3. **Probing Questions als Retrieval Cues.** Eine
   `ChatMessage` mit `speaker "agent"`, die mit `?` endet
   und keine folgende `user`-Message hat, ist eine
   wartende Generation-Effect-Aufforderung. UI kann sie
   beim Wiedereintritt herausheben.
4. **`requires`-Kanten als Lernreihenfolge.** View-Mode
   kann Pfade so rendern, dass Voraussetzungen vorher
   kommen — natürlicher Recall-Pfad.
5. **`derivedFrom` als Personen-Anker.** "Wer war Gödel"
   öffnet einen Backlink auf alle Konzepte, die er begründet.

---

## Konkrete Recall-Queries

Was du tatsächlich gegen den Pod fahren kannst, um *wieder
reinzukommen*. SPARQL-Skizzen — gegen Oxigraph executable.

### Q1 — "Welche Konzepte habe ich überhaupt mal berührt?"

```sparql
PREFIX aleph: <https://vocab.aleph.wiki/>
PREFIX prov:  <http://www.w3.org/ns/prov#>
PREFIX skos:  <http://www.w3.org/2004/02/skos/core#>

SELECT ?c ?label ?session ?when WHERE {
  ?c a aleph:Concept ;
     skos:prefLabel  ?label ;
     prov:wasGeneratedBy  ?session ;
     prov:generatedAtTime ?when .
} ORDER BY DESC(?when)
```

Library-Rail kann das gruppieren — pro Session, sortiert
nach Zeit. Visuelle Anker für Wiedererinnerung.

### Q2 — "Suche nach Label-Substring"

```sparql
SELECT ?c ?label WHERE {
  ?c a aleph:Concept ;
     skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(STR(?label)), "gödel"))
}
```

`altLabel` mitnehmen wenn vorhanden — User schreibt evtl.
"Goedel" oder "incompleteness".

### Q3 — "Offene Threads — wo hat der Agent zuletzt was gefragt?"

```sparql
PREFIX aleph: <https://vocab.aleph.wiki/>

SELECT ?msg ?body ?session ?pos WHERE {
  ?msg a aleph:ChatMessage ;
       aleph:speaker  "agent" ;
       aleph:body     ?body ;
       aleph:position ?pos ;
       prov:wasGeneratedBy ?session .
  FILTER(STRENDS(STR(?body), "?"))
  FILTER NOT EXISTS {
    ?next a aleph:ChatMessage ;
          aleph:speaker  "user" ;
          aleph:position ?pNext ;
          prov:wasGeneratedBy ?session .
    FILTER(?pNext > ?pos)
  }
} ORDER BY DESC(?pos)
```

Liefert für Session_117 die msg6-Probing-Frage zurück.
UI-Vorschlag: beim Reopen der Session als "Where you left
off" prominent zeigen.

### Q4 — "Welche Sessions haben Konzept X angefasst?"

```sparql
SELECT DISTINCT ?session ?startedAt WHERE {
  ?c a aleph:Concept ;
     skos:prefLabel "Gödel's Incompleteness Theorems"@en ;
     prov:wasGeneratedBy ?session .
  ?session prov:startedAtTime ?startedAt .
} ORDER BY DESC(?startedAt)
```

Mehr-Session-Lernen wird so trivial sichtbar: Konzept X
wurde in drei Sessions berührt, hier die Reihenfolge.

### Q5 — "Was hab ich zuletzt zu X gesagt?"

```sparql
SELECT ?body ?when WHERE {
  ?msg a aleph:ChatMessage ;
       aleph:speaker "user" ;
       aleph:body    ?body ;
       prov:generatedAtTime ?when .
  FILTER(CONTAINS(LCASE(STR(?body)), "gödel"))
} ORDER BY DESC(?when) LIMIT 5
```

Auch der Reverse — *Agent*-Erklärungen zu X auffindbar.

### Q6 — "Pfad zwischen zwei Konzepten" (für View-Mode)

Property-Path-Query, beliebige Kantenrichtung:

```sparql
SELECT ?path WHERE {
  g:GoedelIncompleteness
    (skos:broader|^skos:broader|skos:related|aleph:requires|^aleph:requires)+
    g:Mathematics .
}
```

Findet die Kette `GoedelIncompleteness → Logic → Mathematics`.
Genau das Substrat, das `03-view.md` als `aleph:path` ausgibt.

---

## Session 2 — 2026-06-09, zwölf Tage später

Spacing-Intervall ~12 Tage. User öffnet App. Library-Rail
zeigt `Session_117` ganz oben. *Vor* dem ersten User-Turn
kann die UI proaktiv Q3 fahren und msg6-Probing-Frage
darstellen — *Generation-Effect über Zeit*.

User klickt stattdessen die Session, startet `Session_118`.

### Turn 1

**User msg1:** "Was hatten wir nochmal mit Gödel?"

Agent-Loop greift. Pre-Reply lookup: Q1 + Q4 mit
Filter auf User. Liefert Concept-Liste aus Session_117.
Außerdem msg6-Open-Thread (Q3).

**Agent msg2:**

```
body: "Vor 12 Tagen: First + Second Incompleteness Theorem,
Hilbert Program, Gödel Numbering, Diagonal Lemma. Letzte
offene Frage von mir war ob wir beim Diagonalargument
weitermachen. Still relevant?"
```

- *Spacing:* explizit benannter Zeitabstand reaktiviert die
  zeitliche Kontextualisierung — Episode-Memory hilft
  Retrieval.
- *Anchor:* fünf existierende Konzept-Labels exakt.
- *Signaling:* Labels matchen Graph 1:1.
- *Generation Effect:* greift den alten Cliffhanger auf.
  Nicht erfinden — *aus dem Graph holen* via Q3.

**Extend:** nichts. Reiner Recall-Turn, keine neuen
Entities impliziert.

### Turn 2

**User msg3:** "Ja gerne, aber kurz nochmal — was war das
Diagonalargument?"

Frage → antworten.

**Agent msg4:**

```
body: "Diagonal Lemma sagt: in einem System, das Gödel
Numbering beherrscht, gibt es zu jeder Formel φ(x) eine
Aussage ψ, die behauptet 'φ trifft auf mich zu'. Der
Selbstbezug aus msg6 — formalisiert."
```

- *Anchor:* `Diagonal Lemma`, `Gödel Numbering` (beide
  existing). Explizite Referenz auf `msg6` — Pod-interne
  Verlinkung möglich, weil ChatMessages adressierbar sind.
- *Dual Coding:* View-Mode auf `g:DiagonalLemma` kann jetzt
  einen Pfad rendern `Diagonal Lemma → (requires) → Gödel
  Numbering → (broader) → First Incompleteness`. Reply
  (verbal) + Pfad (spatial) = Paivio-Paar.

**Extend:** wieder nichts — Konzepte existieren schon, neue
Kanten nicht impliziert.

---

## Anti-Patterns für Retention

### A. Konzept-Drift bei Resurfacing

Session 2, Agent schreibt "der Unvollständigkeitssatz".
Konzept-Label im Graph ist "Gödel's Incompleteness Theorems".
UI matched nicht, kein Link, Wiedererkennung gestört.

→ Beim Lookup-Reply *exakt* die `prefLabel`-Strings nehmen,
nicht paraphrasieren.

### B. Vergessen aus dem Graph zu lesen

Agent improvisiert in Session 2 eine Zusammenfassung statt
Q1/Q3 zu fahren. Reply sagt vielleicht etwas Vernünftiges,
aber referenziert nicht die *tatsächlich* berührten Konzepte
— User hat keinen Anker zum Vorwissen.

→ Recall-Turns *müssen* aus dem Graph kommen, nicht aus dem
LLM-Kontext.

### C. Open Threads ignorieren

Agent stellt in Session 1 eine Probing-Frage, in Session 2
greift er sie nicht auf. Generation Effect verpufft.

→ Q3 vor erstem Reply einer wiederaufgenommenen Session
fahren, Resultat in Reply einbauen.

### D. Spacing als "rote Erinnerung" verkleiden

```
"Wie ich dir vor 12 Tagen erklärt habe, …"
```

Bevormundend, suggeriert User habe vergessen. Mayer-Coherence
verletzt: emotionales Rauschen.

→ Stattdessen nüchtern den Zeitabstand nennen, ohne Wertung
("Vor 12 Tagen: …").

### E. Backlinks-Übersättigung

Session 2 Reply listet alle 7 Konzepte aus Session 1 plus
Backlinks. Segmenting verletzt.

→ Top-3 nach `perceivedImportance` reicht. Rest auf Nachfrage.

---

## Was das Setup leistet, in einem Satz

Ein Aleph-Pod ist nicht ein Chat-Log, sondern ein
strukturiertes externes Gedächtnis: Konzepte, Kanten,
Nachrichten und offene Fragen sind *adressierbar*, und der
Agent-Loop ist verpflichtet, beim Resurfacen *aus dem
Gedächtnis zu reden*, nicht daran vorbei.
