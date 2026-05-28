---
id: aleph.example-session
purpose: |
  Konkrete Beispiel-Session, die zeigt wie die Constraints aus
  `learning.md` + `agent-loop.md` in einem echten Verlauf wirken.
  Pro Turn: User-Input, Agent-Reply (mit annotierter Begründung),
  optional Extend-Delta. Anti-Patterns am Ende.
audience: prompt authors, reviewers debugging agent output
---

# Beispiel-Session: Sauerteig-Fermentation

Session-ID `g:Session_117`. Themenseed liegt bereits im Pod —
folgende Konzepte existieren vor Turn 1:

```
g:Sourdough        prefLabel "Sourdough"          broader g:Bread
g:Fermentation     prefLabel "Fermentation"
g:LacticAcidBact   prefLabel "Lactic Acid Bacteria"
g:WildYeast        prefLabel "Wild Yeast"
g:Gluten           prefLabel "Gluten"
g:Hydration        prefLabel "Hydration Ratio"

g:Sourdough  related   g:Fermentation
g:Sourdough  related   g:LacticAcidBact
g:Sourdough  related   g:WildYeast
```

Sechs Knoten, drei Kanten. Knapp genug, dass jeder neue Knoten
sichtbar wirkt.

---

## Turn 1 — User exploriert

**User msg1:** "Was passiert eigentlich beim Autolyse-Schritt?"

User-Turn ist eine *Frage* → Generation-Effect-Klausel greift
nicht (Reply soll antworten, nicht zurückfragen).

Bestehender Anschluss: `g:Hydration` (Wasser+Mehl mischen ist
Autolyse-Voraussetzung), `g:Gluten` (das, was sich dabei bildet).

**Agent msg2:**

```json
{
  "@id": "g:Session_117_msg2",
  "@type": "ChatMessage",
  "position": 2,
  "speaker": "agent",
  "body": "Mehl und Wasser ruhen ohne Salz und ohne Starter. Enzyme zerlegen Stärke, Gluten-Stränge ordnen sich von selbst. Spart spätere Knetzeit.",
  "wasGeneratedBy": "g:Session_117",
  "generatedAtTime": "2026-05-28T10:14:02Z"
}
```

**Annotation:**

- *Anchor (Ausubel):* nennt `Gluten` — existierendes Konzept,
  knüpft Neues (Autolyse-Mechanismus) an Vorwissen.
- *Signaling:* "Gluten" exakt wie `prefLabel`. UI kann verlinken.
- *Segmenting:* 3 Sätze, ein Mechanismus.
- *Coherence:* keine Floskel ("gute Frage!"), kein Meta.
- *Konkretheit:* "Enzyme zerlegen Stärke" statt "biochemische
  Vorgänge finden statt".

**Extend-Delta extend2.jsonld:**

```json
{
  "@graph": [
    { "@id": "", "@type": "Edit", "editKind": "extend",
      "wasGeneratedBy": "g:Session_117",
      "generatedAtTime": "2026-05-28T10:14:02Z" },

    { "@id": "g:Autolyse", "@type": "Concept",
      "prefLabel": { "en": "Autolyse" },
      "broader": "g:Sourdough",
      "related": "g:Gluten",
      "perceivedImportance": 0.55,
      "wasGeneratedBy": "g:Session_117",
      "generatedAtTime": "2026-05-28T10:14:02Z" }
  ]
}
```

- *Anschlusszwang (Novak):* zwei Kanten zu bestehenden Knoten
  (`broader → Sourdough`, `related → Gluten`). Kein Isolat.
- *Konkret:* `Autolyse` statt `PreFermentationStep`.
- *Quality > Quantity:* genau ein neuer Knoten, obwohl Reply
  auch "Enzyme" und "Stärke" erwähnt — die brauchen wir erst,
  wenn User explizit darauf zeigt.

---

## Turn 2 — User stellt deklarativ fest

**User msg3:** "Ich nehme immer 75% Hydration."

Kein Fragezeichen, deklarativ → Generation-Effect-Klausel
*greift*. Reply darf mit einer präzisen Rückfrage enden, die
ein Nachbarkonzept aktiviert.

**Agent msg4:**

```json
{
  "@id": "g:Session_117_msg4",
  "speaker": "agent",
  "body": "75% liegt im klassischen Bauernbrot-Bereich. Bei dieser Hydration Ratio formt sich der Teig noch in der Hand. Bekommst du eher offene oder geschlossene Krume?",
  "...": "..."
}
```

**Annotation:**

- *Anchor:* `Hydration Ratio` exakt (Signaling).
- *Generation Effect:* eine konkrete Rückfrage, aktiviert das
  noch-nicht-existierende Konzept "Krumenstruktur" — falls
  User darauf eingeht, Extend-Pass kann es sauber anlegen.
- *Segmenting:* 2 kurze Sätze + 1 Frage.
- *Keine Style-Annahme:* keine Phrase wie "weil du visuell
  denkst, stell dir vor …".

**Extend:** nichts. Kein neuer Knoten implied — User hat nur
einen Parameter genannt, der bereits existierendem Konzept
zugeordnet ist. Eine *Edge-only*-Erweiterung wäre möglich
(z.B. `g:Hydration aleph:typicalValue "0.75"`), aber das
gehört in den nächsten Turn, wenn User es bestätigt.

→ "Wenn der Turn impliziert keine neuen Entities/Edges:
Schritt skippen, keine leere Datei" (agent-loop §7) greift.

---

## Turn 3 — User antwortet

**User msg5:** "Eher geschlossen, ärgert mich."

Bestätigt das Nachbarkonzept, drückt Bewertung aus.

**Agent msg6:**

```json
{
  "speaker": "agent",
  "body": "Geschlossene Krume bei 75% deutet auf zu kurze Stockgare oder zu kalten Starter. Welche Temperatur hat dein Levain beim Einarbeiten?",
  "...": "..."
}
```

**Annotation:**

- Wieder deklarativer User-Turn → eine probing question erlaubt.
- *Anchor:* "Levain" — noch nicht im Graph, *aber* der Reply
  nennt es als bekannten Begriff. Vorsicht: Signaling-Constraint
  verlangt eigentlich, dass Konzept-Token = existierendes
  `prefLabel`. Hier ist "Levain" ein Term, der gleich ins Graph
  wandern wird (siehe Extend) — akzeptabel, weil er im selben
  Turn etabliert wird. Anti-Pattern wäre, wenn Levain nie
  formalisiert würde.

**Extend extend6.jsonld:**

```json
{
  "@graph": [
    { "@id": "", "@type": "Edit", "editKind": "extend",
      "wasGeneratedBy": "g:Session_117",
      "generatedAtTime": "2026-05-28T10:18:40Z" },

    { "@id": "g:Levain", "@type": "Concept",
      "prefLabel": { "en": "Levain" },
      "altLabel":  { "en": "Starter" },
      "broader": "g:Sourdough",
      "related": "g:WildYeast",
      "perceivedImportance": 0.7,
      "wasGeneratedBy": "g:Session_117",
      "generatedAtTime": "2026-05-28T10:18:40Z" },

    { "@id": "g:CrumbStructure", "@type": "Concept",
      "prefLabel": { "en": "Crumb Structure" },
      "broader": "g:Sourdough",
      "related": "g:Hydration",
      "perceivedImportance": 0.5,
      "wasGeneratedBy": "g:Session_117",
      "generatedAtTime": "2026-05-28T10:18:40Z" },

    { "@id": "g:Sourdough", "related": "g:Levain" }
  ]
}
```

- Zwei neue Konzepte (`Levain`, `CrumbStructure`), beide mit
  je zwei Kanten zu bestehenden Knoten. Unter `max_new: 5`.
- Reinforce-Edge `g:Sourdough related g:Levain` ergänzt
  semantische Triangulation.
- `Levain` bekommt `altLabel "Starter"` — User hatte beide
  Begriffe latent benutzt, Signaling-Constraint für künftige
  Turns gestützt.

---

## Turn 4 — User vertieft

**User msg7:** "Stockgare bei 26 Grad, drei Stunden."

Deklarativ, präzise.

**Agent msg8:**

```json
{
  "speaker": "agent",
  "body": "26 Grad ist warm für Lactic Acid Bacteria — die treiben dann Säure schneller als Wild Yeast Gas. Schon mal kühler probiert, etwa 22?",
  "...": "..."
}
```

**Annotation:**

- *Dual-Coding-Paar:* Reply nennt zwei existierende Knoten
  (`Lactic Acid Bacteria`, `Wild Yeast`). View-Mode kann
  daraus später einen Pfad rendern: `Sourdough → LacticAcidBact`
  und `Sourdough → WildYeast` mit `edgeNote` "treibt Säure" /
  "treibt Gas".
- *Signaling:* beide Labels exakt aus dem Graph.
- *Generation:* eine konkrete Rückfrage, aktiviert
  Temperatur-Dimension als potenzielles neues Konzept.

**Extend:** noch nicht. Der Temperatur-Faktor ist erst dann
ein Konzept wert, wenn User-Antwort ihn als wiederkehrende
Dimension etabliert. Vorzeitig anlegen = Graph-Pollution.

---

## Anti-Patterns (was der Agent *nicht* tun darf)

### A. Learning-Style-Annahme

```
"Weil du visuell denkst, stell dir die Hefen als kleine Ballons vor."
```

Verstoß: Mythos (siehe `learning.md`, "Was *keine* Evidenz hat").
Korrektur: Bildsprache ist okay, *wenn* sie für *alle* User
angeboten wird — nicht als typ-spezifische Erklärung.

### B. Isolierter neuer Knoten

```json
{ "@id": "g:Maillard", "@type": "Concept",
  "prefLabel": { "en": "Maillard Reaction" } }
```

Verstoß: kein `broader`, kein `related` zu existierendem.
Anschlusszwang verletzt. Knoten wäre isolierter Punkt.
Korrektur: mindestens `related g:Sourdough` plus ggf.
`related g:Crust` (sobald `Crust` existiert).

### C. Überextension

Reply erwähnt Autolyse, Maillard, Stockgare, Stückgare, Krume,
Hydration, Säure, Gas — Agent versucht 5+ neue Konzepte in
einem Turn anzulegen.

Verstoß: Quality > Quantity. Korrektur: ein, maximal zwei
neue Konzepte pro Turn, der Rest entweder reinforce-Edge
oder warten bis User explizit darauf zeigt.

### D. Synonym-Drift

Graph hat `prefLabel "Lactic Acid Bacteria"`, Reply schreibt
"Milchsäurebakterien" oder "LAB".

Verstoß: Signaling. UI kann nicht matchen. Korrektur: erstes
Vorkommen *exakt* wie `prefLabel`, dann optional `altLabel`
ergänzen — aber im selben Reply nur eine Form.

### E. Floskel-Reply

```
"Das ist eine sehr gute Frage! Beim Sauerteig …"
```

Verstoß: Coherence. Extraneous Load. Korrektur: ersten Satz
direkt mit Substanz beginnen.

### F. Erzwungene Gegenfrage bei User-Frage

User: "Was ist Autolyse?" — Agent: "Bevor ich antworte: was
weißt du schon über Glutenbildung?"

Verstoß: Generation-Effect-Klausel gilt nur für *deklarative*
Turns. Bei expliziter Frage: erst antworten. Optional am Ende
eine Rückfrage, aber nicht die Antwort verweigern.

---

## Session-Endzustand

Nach den vier Turns:

```
+ g:Autolyse        (neu, →broader Sourdough, →related Gluten)
+ g:Levain          (neu, →broader Sourdough, →related WildYeast)
+ g:CrumbStructure  (neu, →broader Sourdough, →related Hydration)
+ edge: g:Sourdough related g:Levain
```

Drei neue Knoten, vier neue Kanten, vier Chat-Replies à ~3 Sätzen.
Jeder neue Knoten hat ≥2 Anschlüsse. Reply-Bodies nennen
durchgehend existierende Labels exakt. Zwei der vier
Agent-Turns enden mit einer probing question (jeweils nach
deklarativem User-Turn).

Das ist die Form, die das Setup belohnen soll: dichter
Anschluss, sparsame Erweiterung, Reply ohne Ballast,
Retrieval-Triggerung wo passend.
