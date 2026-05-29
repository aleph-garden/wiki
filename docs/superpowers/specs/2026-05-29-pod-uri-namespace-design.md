# Pod-URI- und Namespace-Design

**Status:** Draft
**Date:** 2026-05-29
**Author:** Christopher Mühl

## Motivation

Der Agent-Daemon hat funktioniert (Reply geschrieben, Triples asserted), aber
die asserted Concepts erschienen nicht in der UI. Ursache war ein leeres `@id`,
das auf die Pod-Dokument-URL kollabierte statt auf eine sinnvolle Instanz-IRI —
und dahinter ein grundsätzlicheres Problem: alle Instanzen lagen flach unter
einem hartkodierten `https://aleph.wiki/g/`-Namespace, der

- eine **zentrale Identitäts-Autorität** impliziert (alle Nutzer teilen einen
  globalen Concept-Namespace), was dem Solid-/Personal-Pod-Modell widerspricht,
- **Wissen, Chat und Provenance** vermischt (`g:GameTheory`, `g:Session_042`,
  `g:Session_042_msg2`, `g:Session_050_turn1` im selben Topf),
- **Slug-Kollisionen** erzeugt (`g:GoedelIncompleteness` vs
  `g:GoedelIncompletenessTheorems` parallel),
- nicht zur Aleph-Garden-Vision passt: *dein Pod ist ein universeller
  RDF-Graph, Apps sind Perspektiven darüber* — Wissen gehört dir, nicht
  „aleph.wiki".

Dieses Spec legt das Instanz-Namespace-Schema, die Identitäts-/Portabilitäts-
Strategie, Discovery, Slug/Dedup und den Canonicalization-Gate fest.

## Entscheidungen (verbindlich)

1. **Pod-scoped Identität.** Instanz-IRI = `<podbase>/g/<slug>`. Keine zentrale
   Autorität. Lokal `http://localhost:3000/g/<slug>`, deployed
   `https://<pod>.<host>/g/<slug>`.
2. **Relative IRIs** in den gespeicherten Dokumenten → portabel. Egal welcher
   Host ausliefert, die absolute IRI ist dieser Host. Kein Rewrite bei Umzug
   dev→prod.
3. **Typ-agnostischer `/g/`-Raum.** `/g/` ist ein „Dinge"-Raum; der Typ steckt
   in den Triples (`a aleph:Concept`), nicht im Pfad. Keine type-segmentierten
   Pfade (`/concept/`, `/person/`).
4. **Wissen vs. App-Plumbing getrennt.**
   - Wissen (Concept/Person/Event/…) → `/g/` (universelles Substrat, von
     beliebigen Apps geteilt).
   - aleph.wiki-spezifisch (Session/Message/Edit/Provenance) → `aleph.wiki/…`.
5. **Discovery via Solid TypeIndex.** `rdf:type → Container`. Dinge dürfen
   überall im Pod liegen; gefunden werden sie über den TypeIndex. `/g/` ist der
   registrierte, überschreibbare **Default-Schreibort** für eigene neue
   Instanzen. Der Agent **liest überall** (TypeIndex-aufgelöst), nicht nur `/g/`.
6. **Lesbare Slugs + Pflicht-Lookup.** `<slug>` = PascalCase aus `prefLabel`.
   Vor dem Minten Pflicht: existierendes Concept per Label suchen → Treffer
   wiederverwenden, sonst neu.
7. **Canonicalization-Gate (Bless).** Der Agent schreibt **nie direkt nach
   `/g/`**. Er produziert Vorschläge in der Session (Draft). Erst beim
   ausdrücklichen Absegnen werden kanonische Triples aus der Session-Historie
   (inkl. User-Änderungen) nach `/g/` gemintet. „Git für Wissen": Session =
   Working-Draft, `/g/` = kanonisch, Bless = Commit.
8. **Agent referenziert Bestehendes.** Während der Session sucht der Agent immer
   zuerst existierende kanonische Concepts (TypeIndex-aufgelöst, irgendwo im
   Pod) und referenziert sie per IRI; neu vorschlagen nur, wenn nichts passt.
9. **Provenance colocated.** Kein separater `/aleph/assertions/`-Baum.
   Provenance-Records leben im Session-Container neben den Messages. Sie zeigen
   per IRI auf **kanonische Concepts (wo auch immer sie liegen — TypeIndex-
   aufgelöst, nicht zwingend `/g/`)** und/oder auf **andere Triples derselben
   Session** (z.B. eine Aussage leitet sich aus einer früheren ab).
10. **Turtle, nicht JSON-LD.** Alle vom Daemon geschriebenen RDF-Ressourcen sind
    `.ttl` (JSS liefert gespeichertes JSON-LD nicht als Turtle aus).
11. **Session-IDs `yymmdd-nnn`** (z.B. `260529-001`) → lexikografisch
    chronologisch sortierbar.

## Namespaces

| Zweck | Namespace | Prefix | Status |
|---|---|---|---|
| Vokabular (Klassen, Prädikate) | `https://vocab.aleph.wiki/` | `aleph:` | Code-Ist |
| Vokabular (Vision-Ziel, Hash-URIs) | `https://aleph.garden/ns/core#` | `aleph:` | Angleichung später (out of scope) |
| Instanzen | `<podbase>/g/` | `g:` | dieses Spec |
| Standard | prov, skos, foaf, rdfs, xsd | — | wo möglich bevorzugen (Interop) |

Interop entsteht über **geteiltes Vokabular**, nicht über Pfade: wo es passt
Standard-Vokabular (`schema:`, `skos:`, `foaf:`, `prov:`) verwenden, eigene
`aleph:`-Terme nur als Lückenfüller.

## Storage-Layout

```
<podbase>/
  g/                                   # universeller Wissensgraph (TypeIndex-Default)
    GoedelIncompletenessTheorems.ttl   #   ein Concept = eine Ressource
    GameTheory.ttl
  aleph.wiki/                          # aleph.wiki-Plumbing (Learning-Mode)
    sessions/
      260529-001/                      # ein Container je Session, chronologisch sortierbar
        meta.ttl                       #   AlephSession-Knoten, Teilnehmer, Zeiten
        msg1.ttl                       #   Chat-Messages
        msg2.ttl
        claim_01.ttl                   #   ein Claim = ein Named Graph: Wissens-Triples
        claim_02.ttl                   #   + Provenance-Knoten; einzeln invalidierbar
        ...                            #   Bless = Union aller nicht-invalidierten Claims
  settings/
    publicTypeIndex.ttl                # rdf:type → Container-Registrierungen
```

Identität ≠ Container-Layout: die IRI eines Concepts ist `<podbase>/g/<slug>`;
*wo* es physisch liegt, sagt der TypeIndex. Default ist `/g/`, aber ein
Registration-Eintrag kann auf beliebige Container zeigen (auch vorhandene,
nicht-aleph Daten).

## Discovery: TypeIndex

```turtle
# <podbase>/settings/publicTypeIndex.ttl
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix aleph: <https://vocab.aleph.wiki/> .

<#concepts> a solid:TypeRegistration ;
    solid:forClass aleph:Concept ;
    solid:instanceContainer </g/> .
```

- **Loader:** statt `/aleph/` blind zu crawlen, fragt der Reader den TypeIndex
  „wo liegen `aleph:Concept`/`aleph:Person`/`aleph:Event`?" und lädt genau diese
  Container. Mehrere Container je Typ erlaubt.
- **Writer (Canonicalization):** Schreibziel für neue Instanzen = der für den
  Typ registrierte Container; fehlt eine Registrierung, Default `/g/` (und der
  Eintrag wird angelegt).
- **Bootstrap:** Fehlt der TypeIndex, legt aleph.wiki ihn mit dem `/g/`-Default
  an.

## Instanz-IRIs & Relative-Mechanik

- **Schreiben:** Concept-Ressourcen mit relativen IRIs serialisieren, sodass der
  Subjekt-Knoten gegen die Dokument-/Pod-URL aufgelöst wird (kein hartkodierter
  Host). Der Daemon erzeugt Turtle in-process (`jsonld.toRDF` → `n3`), die
  Slug-IRI relativ zur `/g/`-Basis.
- **Laden:** oxigraph lädt mit `base_iri = Dokument-URL` (macht es bereits) →
  relative IRIs werden zum ausliefernden Host absolut.
- **Queries:** der Knoten-Filter darf **nicht** mehr auf den Host
  `STRSTARTS(?iri, "https://aleph.wiki/g/")` prüfen. Stattdessen: Filter über
  `rdf:type` (Concept/Person/Event) plus die per TypeIndex geladenen Container.
  Pfad-/Host-Annahmen raus.

## Slug & Dedup

- **Slug:** PascalCase aus dem englischen `prefLabel`, ASCII-gefaltet,
  Satzzeichen entfernt (`"Gödel's Incompleteness Theorems"` →
  `GoedelIncompletenessTheorems`). Einmal vergeben, fix — Label-Änderung ändert
  nur `prefLabel`, nicht die IRI.
- **Kollision:** existiert der Slug bereits mit *anderem* Concept, Suffix `_2`
  etc.
- **Pflicht-Lookup:** vor dem Minten Suche per `prefLabel`/`altLabel` (TypeIndex-
  aufgelöst). Treffer → IRI wiederverwenden. Zwei Lookup-Momente:
  - **Propose-Zeit** (Session): Bestehendes finden & referenzieren.
  - **Bless-Zeit** (Canonicalization): finale Reconciliation, Neues minten.

## Canonicalization / Bless

Die Session ist der Branch, `/g/` der Main, Bless der Commit.

1. **Während der Session** sammelt der Container: Messages + `draft.ttl`
   (vorgeschlagene Triples des Agenten) + User-Änderungen daran.
2. **Bless** (ausdrückliche User-Aktion „diese Session segne ich ab"):
   a. Lies die Session-Historie (Draft + User-Edits, letzter Stand).
   b. Reconciliation: Slug-Lookup/Dedup gegen `/g/` (Entscheidung 6); Referenzen
      auf Bestehendes bleiben Referenzen, nur Neues wird gemintet.
   c. Merge in `/g/`: pro Concept Triples in die existierende `/g/<slug>.ttl`
      mergen (nicht überschreiben) — siehe Merge-Semantik unten.
   d. Provenance: jedes kanonische Triple `prov:wasGeneratedBy <session>`; ein
      erneutes Absegnen nach weiteren Edits → `prov:wasRevisionOf` auf den
      vorigen Stand; optional `aleph:Snapshot` je Bless.
3. **Der Agent schreibt nie direkt nach `/g/`** — nur Vorschläge in die Session.

### Session-interne Struktur

- **Kein separates Draft-File.** Der **Union-Graph des Session-Containers** ist
  der Arbeitsstand; das Session-Ergebnis = dieser Union **minus invalidierter
  Claims**. Der Agent materialisiert Vorschläge live (kein reines Konversations-
  Modell) — du siehst den Graphen wachsen und kannst eingreifen.
- **Ein Claim = eine Ressource (Named Graph).** Solid gibt Graph-pro-Ressource
  gratis (jede Ressource ist durch ihre URL benannt). Jeder Claim ist
  selbstbeschreibend: Provenance-Knoten + die Wissens-Triples, die er einführt.
- **Ausschluss = Claim invalidieren** — am Claim-/Graph-Knoten, **kein RDF-Star**
  (`<#a> a aleph:ImaginedAssertion ; prov:wasGeneratedBy <../> ;
  prov:wasInvalidatedBy <#review>`). Bless überspringt invalidierte Claims.
  Feiner ausschließen: Claim verwerfen und einen kleineren Named Graph neu
  anlegen. (Per-Einzeltriple bräuchte Reifizierung — bewusst draußen.)
- **Session-IRIs für Entitäten.** Über mehrere Claims referenzierte Entitäten
  bekommen **session-scoped IRIs** (relativ zum Session-Container), nicht per-Doc-
  Hash-IRIs (die gelten nur innerhalb *einer* Ressource). Referenzen auf
  **Bestehendes** zeigen auf dessen kanonische IRI (TypeIndex-aufgelöst, überall).
  Provenance bleibt Knoten-/Claim-Ebene und kann auf andere Session-Entitäten/
  Claims *oder* kanonische IRIs zeigen.
- **Bless:** Union der nicht-invalidierten Claim-Graphen → Slug-Lookup/Dedup →
  Promotion an die kanonische IRI (TypeIndex-Ziel, Default `/g/`); Session-IRIs
  auf kanonische umschreiben bzw. per `owl:sameAs` verknüpfen; Provenance +
  `prov:wasGeneratedBy <session>` mit-übernehmen.

## Agent-Verhalten (Zusammenfassung)

- Liest überall im Pod (TypeIndex-aufgelöst), nicht nur `/g/`.
- Referenziert existierende kanonische Concepts per IRI; schlägt Neues nur vor,
  wenn nichts passt.
- Schreibt Vorschläge in den Session-Draft, nie nach `/g/`.
- Schreibt schlanke Provenance-Records in den Session-Container.

## aleph.wiki — Domain-Rollen

Keine Identitäts-Autorität. Produkt-/Service-Domain:
1. **App-Hosting** — der Viewer / die Perspektive-UI.
2. **Hosted Agent-Service** — Learning-Mode-Daemon als abonnierbarer/testbarer
   Dienst. Alternative: lokal / Bring-Your-Own-API.
3. *(optional)* **Managed Pod-Hosting** — `aleph.wiki/<username>/` für Nutzer
   ohne eigenen Pod; deren IRIs sind dann `aleph.wiki/<username>/g/<slug>` — ein
   Pod-Host unter vielen.

## Offene Detailpunkte (im Implementierungsplan zu klären)

- **`/g/`-Merge-Semantik:** Wenn mehrere Sessions dasselbe Concept anfassen —
  Triples additiv mergen; wie mit widersprüchlichen Werten (z.B. zwei
  `prefLabel@en`) umgehen? Vorschlag: additiver Merge, Konflikt-Erkennung beim
  Bless, User entscheidet.
- **Bless-Remapping:** Mechanik des Umschreibens von Hash-IRI-Referenzen auf
  kanonische IRIs beim Promoten — direktes Rewrite vs. `owl:sameAs`-Brücke.
- **TypeIndex-Wiring:** genaues Lesen/Schreiben/Bootstrappen im Loader (`rdf.ts`)
  und im Daemon-Writer.
- **Slug-Normalisierung:** exakte Regel (Sprache des prefLabel, Unicode-Faltung,
  maximale Länge, Kollisions-Suffix).
- **Migration:** bestehende `/aleph/concepts/`, `/aleph/sessions/*/msg*.ttl`,
  die kaputten `/aleph/assertions/`-Files und die alten `aleph.wiki/g/`-IRIs auf
  das neue Schema überführen (oder als Legacy belassen + neu ab jetzt).

## Out of Scope

- **Vokabular-Angleichung** `vocab.aleph.wiki` → `aleph.garden/ns/core#`
  (eigenes Spec).
- **Cross-Pod-Federation** (Referenzen auf fremde Pods, Auth) — später.
- **aph.gdn Resolver-Service** (stabile Sharing-Indirektion) — später; das
  relative-IRI-Modell hält es offen.
- **Versionierungs-Tiefe** über `wasRevisionOf`/`Snapshot` hinaus (volle
  Historie/Diff-UI).
