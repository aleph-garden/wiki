---
id: aleph.learning
purpose: |
  Lernwissenschaftliche Referenz für alle Aleph-Prompts. Wird von
  `agent-loop.md`, `02-extend.md` und `03-view.md` referenziert.
  Keine direkten Outputs — reine Designgrundlage.
audience: prompt authors, agent-loop runtime
---

# Lernwissenschaftliche Grundlagen für Aleph

Diese Notiz fasst evidenzbasierte Prinzipien zusammen, an denen sich die
Aleph-Prompts orientieren. Sie ist Referenz, nicht Instruktion — die
konkreten Constraints stehen in den Prompt-Dateien. Wenn ein Constraint
in einem Prompt unklar wird, hier ist das Warum.

## Was Evidenz hat

### 1. Dual Coding (Paivio, 1971ff)

Hirn verarbeitet verbal + bildlich auf zwei Kanälen. Gleichzeitiger
Einsatz beider verbessert Memorierung. Konkrete Begriffe schlagen
abstrakte ("Konkretheitseffekt").

**Aleph-Konsequenz:** Chat-Reply (verbal) + Graph-Pfad (spatial) sind
das Dual-Coding-Paar. Reply-Body sollte Konzepte exakt so benennen,
wie sie als Knoten existieren — damit Visualisierung greift.

### 2. Cognitive Load Theory (Sweller) + Multimedia Learning (Mayer)

Working memory begrenzt. Drei Loads: *intrinsic* (Stoff selbst),
*germane* (lernrelevant), *extraneous* (Ballast). Designziel:
extraneous minimieren, germane maximieren.

Relevante Mayer-Prinzipien für uns:

- **Coherence** — Schmuck-Content raus. Keine Floskeln, keine
  Meta-Kommentare.
- **Signaling** — Struktur sichtbar machen (Konzept-Labels exakt,
  damit UI Highlights setzen kann).
- **Spatial Contiguity** — zusammengehöriger Text + visuelles
  Element räumlich nah (Reply zu Konzept X erscheint nah am Knoten X
  in der View).
- **Segmenting** — Häppchen statt Monolog, User pacet selbst.
- **Redundancy** — nicht gleicher Inhalt parallel in zwei Modalitäten
  (kein Reply, der den Graph-Pfad in Worten dupliziert).

### 3. Meaningful Learning (Ausubel) + Concept Maps (Novak)

Ausubel: *"The most important single factor influencing learning is
what the learner already knows."* Neues Wissen wird an existierende
kognitive Strukturen angedockt — oder es bleibt rote Memorierung.

Novak baute Concept Maps direkt auf Ausubel auf. Belegt: bessere
Langzeitretention, weniger Misconceptions, taugt für jedes Fach.

**Aleph-Konsequenz:** Der Concept-Graph *ist* eine
Ausubel/Novak-Struktur. Jedes neue Konzept braucht Anschluss an
mindestens einen bestehenden Knoten. Isolate Inseln verboten.
Im Reply: explizit Brücken zu Vorwissen schlagen ("X ist eine
Verfeinerung von Y, das wir schon haben").

### 4. Generation Effect / Retrieval Practice / Spacing

Aktives Abrufen schlägt Wiederlesen (*Testing Effect*). Verteilte
Wiederholung schlägt geballte (*Spacing Effect*). Kombination
synergistisch.

**Aleph-Konsequenz:** Agent kann bei deklarativen User-Turns eine
*probing question* einstreuen, die ein Nachbarkonzept aktiviert —
zwingt User zum Retrieval. Cross-Session-Spacing (alte Konzepte
nach N Tagen beiläufig wieder aufgreifen) ist Feature-Ziel, nicht
Prompt-Sache.

### 5. Knowledge-Graph-Visualisierung skaliert schlecht

Praktikerstudie (arxiv:2304.01311): Node-Link-Diagramme jenseits
weniger hundert Knoten unlesbar. User wollen *knowledge cards*
(eine Karte pro Konzept mit ~3 Nachbarn + kurzer Definition),
Timeline-Views, semantische Erklärungen — nicht Roh-Graph-Dumps.

**Aleph-Konsequenz:** Sparsam neue Knoten anlegen. Lieber eine
gute Kante zwischen bestehenden als ein neuer Knoten. Quality
> Quantity bei Extend-Pässen.

## Was *keine* Evidenz hat — explizit vermeiden

### Learning Styles ("visueller Lerner" etc.)

APA, Yale Poorvu Center, mehrere Reviews: kein evidenzbasierter
Beleg, dass Matching von Lehrform zu selbstberichtetem "Stil"
Lernerfolg verbessert. Studien dazu hatten durchgehend
methodische Defekte. Schadhafter Nebeneffekt: Lehrer-Bias
(*"kinesthetic = dumm"*).

**Aleph-Konsequenz:** Agent macht *nie* Annahmen über User-Typ.
Keine Sätze wie "weil du visuell lernst …". Designe für alle.

### Cognitive-Bias-Maßnahmen ohne Mechanismus

Vage Empfehlungen ("aktiviere mehr Sinne!", "mach es bunter!")
ohne klaren CLT-Mechanismus dahinter ignorieren. Wenn ein
Vorschlag nicht auf intrinsic↑ / extraneous↓ / germane↑
abbildbar ist, ist er Folklore.

## Quick-Reference: Prinzip → Aleph-Hebel

| Prinzip | Quelle | Aleph-Hebel |
|---|---|---|
| Dual Coding | Paivio | Reply-Text + Graph-Pfad gepaart |
| Coherence | Mayer | keine Floskeln, kein Schmuck im `body` |
| Signaling | Mayer | Konzept-Token = exaktes `rdfs:label` |
| Spatial Contiguity | Mayer | Reply nennt Konzept, UI verlinkt zum Knoten |
| Segmenting | Mayer | max ~3 Sätze pro Reply, ein Gedanke pro Turn |
| Konkretheit | Paivio | Labels konkret (`:NeuralBackprop` > `:LearningMechanism`) |
| Meaningful Learning | Ausubel | Reply nennt min. ein bestehendes Konzept |
| Concept-Map-Anschluss | Novak | jedes neue Concept ≥1 Kante zu altem |
| Generation Effect | Roediger et al. | bei deklarativen Turns: 1 probing question |
| Spacing | Ebbinghaus / Cepeda | (Feature-Ziel: Cross-Session-Recall) |
| KG-Sparsamkeit | arxiv 2304.01311 | `max_new` klein, Kanten > Knoten |

## Quellen

- Paivio (1971), *Imagery and Verbal Processes*. Dual-coding overview:
  https://en.wikipedia.org/wiki/Dual-coding_theory
- Clark & Paivio (1991), *The empirical case for dual coding*:
  https://www.researchgate.net/publication/238343549
- Sweller (1988ff), Cognitive Load Theory — Übersicht:
  https://isu.pressbooks.pub/thuff/chapter/cognitive-load-theory-jacob-andrysiak/
- Mayer, *Cambridge Handbook of Multimedia Learning*, Ch. 12 —
  Coherence/Signaling/Redundancy/Contiguity:
  https://edtechuvic.ca/wp-content/uploads/sites/11/2022/09/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles.pdf
- Ausubel, *Meaningful learning re-visited*:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10130311/
- Novak & Cañas, *The theory underlying concept maps*:
  https://www.researchgate.net/publication/215439441
- APA / Association for Psychological Science — Learning styles debunked:
  https://www.psychologicalscience.org/news/releases/learning-styles-debunked-there-is-no-evidence-supporting-auditory-and-visual-learning-psychologists-say.html
- Roediger & Karpicke (2006ff), Testing Effect — Übersicht via
  https://www.sciencedirect.com/science/article/abs/pii/S0749596X09001156
- Knowledge Graphs in Practice (IEEE VIS 2023):
  https://arxiv.org/abs/2304.01311
