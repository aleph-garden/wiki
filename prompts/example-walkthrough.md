---
id: aleph.example-walkthrough
purpose: |
  Komplette Beispiel-Sitzung über Gödels Unvollständigkeitssätze.
  Zeigt: Lern-Arc von Nullwissen bis Verständnis der Tragweite,
  pro Turn die *tatsächlich* erzeugten RDF-Tripel, am Ende
  ein Point-Mode-Render und ein `aleph:View`-Tripel-Block.
  Erweitert `example-session.md` (Retention-Demo) — diese
  Datei zeigt was *innerhalb* einer Sitzung passiert.
audience: prompt authors, UI implementers, anyone evaluating whether
  the schema carries enough signal for the rendering pipeline
notation: |
  Extend-Deltas hier als Turtle gezeigt, weil Tripel lesbarer
  sind. Der echte Agent-Loop schickt sie als JSON-LD an den Pod
  (siehe `02-extend.md`); Pod normalisiert beide auf denselben
  RDF-Graphen. Chat-Messages bleiben JSON-LD (siehe `04-chat-log.md`).
---

# Komplette Sitzung: Gödels Unvollständigkeitssätze

Session-ID `g:Session_117`. User hat keinen Vorkontakt mit
dem Thema. Pod enthält aus früheren Sessions nur:

```
g:Mathematics   skos:prefLabel "Mathematics"@en .
g:Logic         skos:prefLabel "Logic"@en ;
                skos:broader   g:Mathematics .
g:FormalSystem  skos:prefLabel "Formal System"@en ;
                skos:broader   g:Logic .
g:Hilbert       a foaf:Person ;
                skos:prefLabel "David Hilbert"@en .
```

Zehn Turns. Pro Turn: User-Msg, Agent-Reply, Extend-Tripel,
ein-Zeilen-Annotation welche `learning.md`-Prinzipien greifen.

---

## Turn 1 — Einstieg

**msg1 user:** "Ich möchte verstehen, was Gödels
Unvollständigkeitssätze eigentlich aussagen."

**msg2 agent (`body`):**

> Gödel zeigt 1931: jedes hinreichend mächtige formale
> System hat wahre Aussagen, die es nicht beweisen kann.
> Damit endet die Hoffnung, Mathematik komplett zu axiomatisieren.
> Wollen wir mit der Intuition oder mit dem Beweisprinzip anfangen?

**Extend (delta):**

```turtle
g:GoedelIncompleteness
    a aleph:Concept, aleph:ImportantConcept ;
    skos:prefLabel "Gödel's Incompleteness Theorems"@en ;
    skos:broader   g:Logic ;
    skos:related   g:FormalSystem ;
    aleph:derivedFrom g:Goedel ;
    aleph:perceivedImportance 0.85 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:02:11Z"^^xsd:dateTime .

g:Goedel
    a foaf:Person ;
    skos:prefLabel "Kurt Gödel"@en ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:02:11Z"^^xsd:dateTime .
```

*Anchor:* `Formal System` existiert (Ausubel). *Signaling:*
exakte Labels. *Segmenting:* zwei Sätze + Wahlfrage. *Konkretheit:*
"wahre Aussagen, die es nicht beweisen kann" > "Limitsresultat".

---

## Turn 2 — Begriffsklärung

**msg3 user:** "Beweisprinzip. Aber Moment — ich dachte
immer, Mathematik wäre vollständig."

Deklarativ → Generation Effect am Ende erlaubt.

**msg4 agent:**

> Häufige Verwechslung: Mathematik ist *consistent* (frei von
> Widersprüchen), das ist gut belegt. *Complete* heißt: für
> jede Aussage entweder Beweis oder Gegenbeweis. Gödel killt
> Completeness, nicht Consistency. Welche Aussagen denkst du
> könnten unbeweisbar sein?

**Extend:**

```turtle
g:Consistency
    a aleph:Concept ;
    skos:prefLabel "Consistency"@en ;
    skos:broader   g:FormalSystem ;
    aleph:perceivedImportance 0.6 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:04:30Z"^^xsd:dateTime .

g:Completeness
    a aleph:Concept ;
    skos:prefLabel "Completeness"@en ;
    skos:broader   g:FormalSystem ;
    skos:related   g:GoedelIncompleteness ;
    aleph:perceivedImportance 0.65 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:04:30Z"^^xsd:dateTime .
```

*Anchor:* `Formal System`. *Probing Question* aktiviert
Selbstbezug-Idee für Turn 3.

---

## Turn 3 — Beweistechnik

**msg5 user:** "Sowas wie 'dieser Satz ist unbeweisbar'?"

**msg6 agent:**

> Genau das. Gödel kodiert syntax als Zahlen — jedes Symbol,
> jede Formel, jeder Beweis bekommt eine Nummer (Gödel
> Numbering). Damit kann ein arithmetischer Satz indirekt
> *über sich selbst* sprechen: er ruft seine eigene Nummer
> über das Diagonal Lemma auf. Daraus folgt: ein Satz, der
> seine eigene Unbeweisbarkeit behauptet, ist wahr, wenn er
> unbeweisbar ist — und der erste Unvollständigkeitssatz ist
> da.

**Extend:**

```turtle
g:GoedelNumbering
    a aleph:Concept ;
    skos:prefLabel "Gödel Numbering"@en ;
    skos:definition "Encoding of syntax as natural numbers, allowing arithmetic to refer to its own formulas."@en ;
    skos:broader   g:GoedelIncompleteness ;
    aleph:perceivedImportance 0.6 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:07:18Z"^^xsd:dateTime .

g:DiagonalLemma
    a aleph:Concept ;
    skos:prefLabel "Diagonal Lemma"@en ;
    aleph:requires g:GoedelNumbering ;
    skos:related   g:GoedelIncompleteness ;
    aleph:perceivedImportance 0.55 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:07:18Z"^^xsd:dateTime .

g:FirstIncompleteness
    a aleph:Concept, aleph:ImportantConcept ;
    skos:prefLabel "First Incompleteness Theorem"@en ;
    skos:broader   g:GoedelIncompleteness ;
    aleph:requires g:DiagonalLemma ;
    aleph:perceivedImportance 0.8 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:07:18Z"^^xsd:dateTime .
```

Drei Konzepte, klare `requires`-Kette
`First ← Diagonal Lemma ← Gödel Numbering`. Die kann
View-Mode als Lernreihenfolge rendern.

---

## Turn 4 — Skepsis

**msg7 user:** "Das klingt wie das Lügner-Paradox. Ist das
nicht ein Trick?"

Frage → antworten, keine Gegenfrage erzwingen.

**msg8 agent:**

> Der Lügner ist ein *natürlich-sprachliches* Paradox und
> führt zu Widerspruch. Gödel formalisiert den Selbstbezug
> mathematisch und vermeidet Widerspruch — die Aussage ist
> wahr aber unbeweisbar, nicht beides zugleich. Der
> Unterschied: Self-Reference im Formalismus ist
> kontrollierbar, im Alltagssprech nicht.

**Extend:**

```turtle
g:SelfReference
    a aleph:Concept ;
    skos:prefLabel "Self-Reference"@en ;
    skos:related g:DiagonalLemma, g:GoedelIncompleteness ;
    aleph:perceivedImportance 0.5 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:10:45Z"^^xsd:dateTime .

g:LiarParadox
    a aleph:Concept ;
    skos:prefLabel "Liar Paradox"@en ;
    skos:related g:SelfReference ;
    skos:definition "Sentence asserting its own falsity; yields contradiction in unrestricted natural language."@en ;
    aleph:perceivedImportance 0.4 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:10:45Z"^^xsd:dateTime .
```

*Mayer Redundancy:* Reply duplikiert nicht den Pfad —
benennt nur den Kontrast. *Anchor* an User-eigenem Begriff
(Lügner-Paradox) → Ausubel.

---

## Turn 5 — Zweiter Satz

**msg9 user:** "Und der zweite Satz?"

**msg10 agent:**

> Der zweite Satz schärft den ersten: ein hinreichend mächtiges,
> consistentes System kann seine eigene Consistency nicht
> beweisen. Wer Widerspruchsfreiheit von Peano-Arithmetik
> beweisen will, braucht ein stärkeres System — und das
> bräuchte wieder ein noch stärkeres. Turtles all the way up.

**Extend:**

```turtle
g:SecondIncompleteness
    a aleph:Concept, aleph:ImportantConcept ;
    skos:prefLabel "Second Incompleteness Theorem"@en ;
    skos:broader   g:GoedelIncompleteness ;
    aleph:requires g:FirstIncompleteness ;
    skos:related   g:Consistency ;
    aleph:perceivedImportance 0.75 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:13:02Z"^^xsd:dateTime .

g:PeanoArithmetic
    a aleph:Concept ;
    skos:prefLabel "Peano Arithmetic"@en ;
    skos:broader   g:FormalSystem ;
    skos:related   g:SecondIncompleteness ;
    aleph:perceivedImportance 0.55 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:13:02Z"^^xsd:dateTime .
```

Zweite-Satz hängt explizit am ersten (`requires`). Peano
ist das Standard-Beispiel-System — wichtig für Card-Mode-Backlinks.

---

## Turn 6 — Historischer Kontext

**msg11 user:** "Hilbert wollte ja eigentlich das Gegenteil."

Deklarativ → eine Probing-Frage erlaubt.

**msg12 agent:**

> Hilbert's Program wollte Mathematik finit begründen:
> consistency-Beweis aus rein endlichen Mitteln, alle
> Aussagen entscheidbar. Gödels zweiter Satz schließt
> den consistency-Beweis aus, der erste die Entscheidbarkeit.
> Das Programm ist nicht tot, aber radikal reduziert.
> Bekanntestes Salvage-Resultat: Gentzens consistency-Beweis
> über transfinite Induktion. Soll ich da reingehen oder
> lieber Richtung Turing weiter?

**Extend:**

```turtle
g:HilbertProgram
    a aleph:Concept, aleph:ImportantConcept ;
    skos:prefLabel "Hilbert's Program"@en ;
    aleph:derivedFrom g:Hilbert ;
    skos:related      g:GoedelIncompleteness, g:Consistency, g:Completeness ;
    aleph:perceivedImportance 0.7 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:15:50Z"^^xsd:dateTime .
```

Ein einzelnes Konzept, aber *Triangulation*: verbindet die
bestehende Hilbert-Person mit drei Gödel-Cluster-Knoten.
Höchster Wert pro Tripel-Investition.

---

## Turn 7 — Brücke zu Turing

**msg13 user:** "Turing."

**msg14 agent:**

> Turing 1936 macht das berechenbarkeitstheoretisch:
> es gibt kein allgemeines Verfahren, das von jedem
> Programm + Eingabe entscheidet ob es hält (Halting Problem).
> Strukturell dasselbe Phänomen wie Gödels erster Satz —
> beides Anwendungen der Diagonalisierung auf einen
> Universalbegriff. Church-Turing-These verbindet die
> beiden Welten: Berechenbarkeit = effektive
> Beweisbarkeit.

**Extend:**

```turtle
g:Turing
    a foaf:Person ;
    skos:prefLabel "Alan Turing"@en ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:18:22Z"^^xsd:dateTime .

g:HaltingProblem
    a aleph:Concept, aleph:ImportantConcept ;
    skos:prefLabel "Halting Problem"@en ;
    aleph:derivedFrom g:Turing ;
    skos:related     g:GoedelIncompleteness, g:DiagonalLemma ;
    aleph:perceivedImportance 0.75 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:18:22Z"^^xsd:dateTime .

g:ChurchTuringThesis
    a aleph:Concept ;
    skos:prefLabel "Church-Turing Thesis"@en ;
    skos:related     g:HaltingProblem, g:FirstIncompleteness ;
    aleph:perceivedImportance 0.5 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:18:22Z"^^xsd:dateTime .
```

Person + zwei Konzepte, alle mit Cross-Edge in den
Gödel-Cluster. Die `related g:DiagonalLemma`-Kante ist die
*tragende* Brücke — Halting-Beweis benutzt sie strukturell.

---

## Turn 8 — Abstraktion

**msg15 user:** "Also alles dasselbe Phänomen?"

Deklarativ.

**msg16 agent:**

> Unterhalb: ein universeller Mechanismus (Beweiser,
> Berechner) wird auf seine eigene Beschreibung losgelassen,
> Widerspruch ausweicht in Unentscheidbarkeit. Tarski's
> Wahrheitsundefinierbarkeit gehört auch in diesen Cluster.
> Würdest du sagen, das ist ein Limit der Sprache oder ein
> Limit der Logik?

**Extend:**

```turtle
g:TarskiUndefinability
    a aleph:Concept ;
    skos:prefLabel "Tarski's Undefinability Theorem"@en ;
    skos:related g:FirstIncompleteness, g:SelfReference ;
    skos:definition "Arithmetical truth cannot be defined within arithmetic itself."@en ;
    aleph:perceivedImportance 0.5 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:21:09Z"^^xsd:dateTime .
```

Cluster verdichten statt erweitern. *Generation Effect:*
Wahlfrage zwingt User zu Stellungnahme.

---

## Turn 9 — Grenzen des Resultats

**msg17 user:** "Heißt das, Mathematik ist gebrochen?"

Frage → antworten.

**msg18 agent:**

> Nein. Was Gödel *nicht* sagt: es betrifft nur Systeme
> mächtig genug, Peano-Arithmetik zu enthalten — schwächere
> Systeme können complete sein (Presburger-Arithmetik etwa
> ist entscheidbar). Es sagt nichts über konkrete
> mathematische Praxis: kein einziger Beweis im echten
> Mathematik-Alltag ist davon betroffen. Es ist ein
> Resultat *über* Formalisierung, kein Resultat *in* der
> Mathematik.

**Extend:**

```turtle
g:PresburgerArithmetic
    a aleph:Concept ;
    skos:prefLabel "Presburger Arithmetic"@en ;
    skos:broader  g:FormalSystem ;
    skos:related  g:Completeness ;
    skos:definition "First-order arithmetic with addition only, no multiplication; decidable and complete."@en ;
    aleph:perceivedImportance 0.45 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:23:55Z"^^xsd:dateTime .

g:MetaMathematics
    a aleph:Concept ;
    skos:prefLabel "Metamathematics"@en ;
    skos:broader  g:Mathematics ;
    skos:related  g:GoedelIncompleteness ;
    skos:definition "Mathematical study of mathematics itself as formal object."@en ;
    aleph:perceivedImportance 0.55 ;
    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:23:55Z"^^xsd:dateTime .
```

Counter-Beispiel-Konzept (`Presburger`) ist pädagogisch
wertvoll: zeigt was *nicht* unter den Satz fällt → schärft
Verständnis. Klassischer Ausubel-Move: durch Kontrast
disambiguieren.

---

## Turn 10 — Abschluss

**msg19 user:** "Macht Sinn. Was wäre der nächste Schritt
wenn ich tiefer rein will?"

**msg20 agent:**

> Drei Richtungen je nach Geschmack: technisch der
> Originalbeweis (Smullyan's "Gödel's Incompleteness
> Theorems" ist die freundlichste Quelle), philosophisch
> Penrose vs. mechanistic mind, oder anwendungsnah
> Programmverifikation und Curry-Howard. Sag mir welche und
> ich baue beim nächsten Mal von dort aus weiter.

Kein Extend — bewusst. Letzter Turn ist Übergabe, keine
Konzept-Erweiterung. (Smullyan und Penrose würden im
*nächsten* Turn — User-Antwort — formalisiert.)

---

## Zustand des Pods nach Session 117

Konzepte hinzugefügt (in chronologischer Reihenfolge):

```
g:GoedelIncompleteness     (0.85)  ImportantConcept
g:Goedel                   Person
g:Consistency              (0.6)
g:Completeness             (0.65)
g:GoedelNumbering          (0.6)
g:DiagonalLemma            (0.55)
g:FirstIncompleteness      (0.8)   ImportantConcept
g:SelfReference            (0.5)
g:LiarParadox              (0.4)
g:SecondIncompleteness     (0.75)  ImportantConcept
g:PeanoArithmetic          (0.55)
g:HilbertProgram           (0.7)   ImportantConcept
g:Turing                   Person
g:HaltingProblem           (0.75)  ImportantConcept
g:ChurchTuringThesis       (0.5)
g:TarskiUndefinability     (0.5)
g:PresburgerArithmetic     (0.45)
g:MetaMathematics          (0.55)
```

16 Concepts (5 davon `ImportantConcept`), 2 Personen, 10
ChatMessages. Über 30 Kanten. Jeder neue Knoten hat ≥1
Anschluss an Bestehendes.

---

## Graph-Visualisierung — Point-Mode auf `g:GoedelIncompleteness`

UI-Regel (siehe `schema.md`): Fokus zentral, Orbit 1 =
direkte `skos:broader`-Kinder, Orbit 2 = direkte Nachbarn,
Orbit 3 = Rest.

```
                          [Mathematics]
                                 │ broader
                         [Logic]
                            ▲ broader (target)
                            │
            ┌──────────[GöDEL'S INCOMPLETENESS]──────────┐
            │ broader        ★ focus      ★ broader      │
            │                                            │
       ┌────┴────┐                              ┌────────┴────────┐
       │  First  │                              │     Second      │
       │ Incompl │                              │     Incompl     │
       └────┬────┘                              └────────┬────────┘
            │ requires                       requires   │
       ┌────┴────┐                              ┌───────┴───────┐
       │ Diagonal│      ─── related ──►         │ Consistency   │
       │  Lemma  │                              └───────────────┘
       └────┬────┘
   requires │
       ┌────┴────┐         related        ┌──────────────┐
       │  Gödel  │◄──────────────────────►│   Halting    │
       │Numbering│                        │   Problem    │
       └─────────┘                        └──────┬───────┘
                                                 │ derivedFrom
                                            [Alan Turing]
```

Wichtig: `requires` zeichnet *Lernreihenfolge* — der Pfad
`Gödel Numbering → Diagonal Lemma → First Incompleteness`
ist topologisch sortiert, die UI rendert ihn als
chronologische Treppe links unten.

Knotengröße ∝ `perceivedImportance` → `GoedelIncompleteness`
(0.85) und `FirstIncompleteness` (0.8) dominieren visuell;
`PresburgerArithmetic` (0.45) ist klein, sitzt am Rand.

---

## `aleph:View` für die Frage "Wie führt Gödel zur Unentscheidbarkeit?"

Komponiert per `03-view.md`. Pfadwahl: vom Fokus zu
`HaltingProblem`, die strukturelle Brücke.

```turtle
:View_goedel_to_halting
    a aleph:View ;
    aleph:question "Wie führt Gödel zur Unentscheidbarkeit?" ;
    aleph:path  ( g:GoedelIncompleteness
                  g:FirstIncompleteness
                  g:DiagonalLemma
                  g:HaltingProblem ) ;
    aleph:trail ( "Mathematics" "Logic" "Metamathematics" ) ;

    aleph:edgeNote [
        aleph:from g:GoedelIncompleteness ;
        aleph:to   g:FirstIncompleteness ;
        rdfs:label "narrows to" ] ;
    aleph:edgeNote [
        aleph:from g:FirstIncompleteness ;
        aleph:to   g:DiagonalLemma ;
        rdfs:label "requires" ] ;
    aleph:edgeNote [
        aleph:from g:DiagonalLemma ;
        aleph:to   g:HaltingProblem ;
        rdfs:label "structurally analogous to" ] ;

    aleph:pathNote [
        aleph:atConcept g:DiagonalLemma ;
        aleph:noteText  "Selbstbezug über Kodierung —\nidentisches Werkzeug bei Turing." ] ;
    aleph:pathNote [
        aleph:atConcept g:HaltingProblem ;
        aleph:noteText  "Berechenbarkeit statt Beweisbarkeit,\nsonst dieselbe Diagonale." ] ;

    aleph:suggestion [
        aleph:target g:TarskiUndefinability ;
        aleph:reason "Dritte Variante derselben Diagonale" ] ;
    aleph:suggestion [
        aleph:target g:ChurchTuringThesis ;
        aleph:reason "Brücke Berechenbarkeit ↔ Beweisbarkeit" ] ;

    prov:wasGeneratedBy  g:Session_117 ;
    prov:generatedAtTime "2026-05-28T10:27:00Z"^^xsd:dateTime .
```

Vier Konzepte, drei Edge-Notes, zwei narration-Notes, zwei
Suggestions. Alle Konzept-IRIs sind tatsächlich im Graph
(03-view.md verbietet erfundene Pfade). Trail zeigt die
Domänen-Hierarchie *oberhalb* des Pfads.

---

## Card-Mode für `g:FirstIncompleteness`

UI-Header + gruppierte Triples (siehe `schema.md`):

```
┌─────────────────────────────────────────────────────────┐
│  FIRST INCOMPLETENESS THEOREM            ★★★★☆ (0.80)   │
│  ImportantConcept · touched in 1 session                │
├─ Identity ──────────────────────────────────────────────┤
│  type           Concept, ImportantConcept               │
│  prefLabel      First Incompleteness Theorem            │
├─ Relations ─────────────────────────────────────────────┤
│  broader        Gödel's Incompleteness Theorems         │
│  requires       Diagonal Lemma                          │
├─ Backlinks ─────────────────────────────────────────────┤
│  ← requires     Second Incompleteness Theorem           │
│  ← related      Church-Turing Thesis                    │
│  ← related      Tarski's Undefinability Theorem         │
│  ← related      Halting Problem                         │
├─ Provenance ────────────────────────────────────────────┤
│  generatedBy    Session_117  ·  2026-05-28 10:07:18 Z   │
└─────────────────────────────────────────────────────────┘
```

Backlinks zeigen *was alles dieses Konzept braucht oder
darauf verweist* — der zentrale Retention-Mechanismus. Beim
Wiederlesen sieht User sofort, in welchem Netz das Konzept
hängt.

---

## Was diese Sitzung über das Setup verrät

- 10 Turns produzieren 16 Konzepte, ~30 Kanten, 1 View,
  10 ChatMessages. Dichte, aber nicht überfrachtet — jeder
  Knoten kommt aus einem konkreten Reply-Bezug.
- Drei strukturelle Patterns wiederholen sich: *Anker an
  Existentem* (Hilbert, FormalSystem), *Cluster-Verdichtung*
  (`Tarski` als dritte Variante), *Counter-Beispiel*
  (`Presburger` schärft was *nicht* unter den Satz fällt).
- Der View am Ende ist nicht "die Antwort", sondern *eine
  konkrete Frage entlang des Graphen* — er kann beliebig
  oft mit anderen Fragen neu komponiert werden, ohne dass
  der Graph nochmal angefasst werden muss.
- Card-Mode + Backlinks tragen das Wiederfinden in
  Session 2 (siehe `example-session.md`): das Netz an
  Backlinks ist der echte Recall-Cue.

Ein Aleph-Pod baut so über jede Sitzung ein dichteres,
durchquerbares Netz — Lernen materialisiert sich als
Graph, nicht als Notiz.
