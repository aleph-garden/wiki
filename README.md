# aleph.wiki

**An external memory system for connection-based learning through semantic knowledge graphs.**

---

## What is aleph.wiki?

Aleph.wiki transforms scattered learning into a web of connected knowledge. When you can't remember where you learned something, when you forget crucial connections between ideas, when knowledge lives in isolated notes that never resurface - aleph.wiki captures not just what you learned, but how concepts relate and how your understanding evolved over time.

**The core value:** Connection-triggered recall. Seeing graph connections brings back the full learning context - not just isolated facts, but the relationships, insights, and progression of understanding.

### How it works

Interactive learning sessions capture concepts as semantic triples in Turtle format, building a persistent knowledge graph that grows across sessions. Using standard ontologies (SKOS, FOAF, schema.org), aleph.wiki creates rich, queryable representations with cross-linked concepts, multilingual labels, and temporal relationships.

The system is designed for minimal interruption during learning. You provide brief inputs, and the assistant responds by writing structured RDF data to `index.ttl`, capturing both the concepts and the context of each learning interaction. Over time, patterns emerge - game theory appears in biology, economics, and politics; information theory connects thermodynamics, communication, and epistemology.

## Why aleph.wiki?

### Core Innovations

**1. Ontology-Aware Multi-Layer Visualization**

Unlike standard network graphs that force all data into one view, aleph.wiki renders your knowledge based on its semantic properties:
- **Temporal data** → Timeline view showing how events unfold
- **Conceptual relationships** → Network graph for exploring connections
- **Provenance data** → Knowledge archaeology - see how your understanding evolved

The visualization layer is determined by the ontology, not manual categorization. Switch between views to see the same knowledge from different angles.

**2. Provenance Replay - Knowledge Archaeology**

Every learning session becomes part of the graph's history. Watch your knowledge graph grow over time, see which sessions added what, identify which topics you explored deeply versus touched lightly. Provenance isn't just audit trail - it's a way to understand how you learned.

**3. Minimal-Interruption Learning Experience**

Brief inputs during learning sessions. The AI assistant structures knowledge as RDF triples in the background. You think, explore, and ask questions. The system handles semantic correctness, relationship mapping, and temporal tracking.

### What Makes It Different

**vs. Obsidian/Roam:** Graph views exist, but limited to single network visualization. No temporal replay, no ontology-aware rendering.

**vs. Notion/Evernote:** Document-centric, no graph visualization, connections are manual.

**vs. Mem.ai/Reflect:** AI features for summarization, but not knowledge structuring as semantic web data.

**The Gap:** Personal knowledge management + semantic web rigor + ontology-aware visualization + provenance as learning tool. This combination doesn't exist in the current market.

## Quick Example

**Scenario:** You're at a dinner party. Someone mentions Iran protests. You learned about this months ago - where? What was the connection you found interesting?

Pull up aleph.wiki. Search "Iran protests." The graph shows:

```turtle
<concept:mahsa-amini-protests> a skos:Concept , schema:Event ;
    skos:prefLabel "2022 Iranian Protests"@en , "اعتراضات ایران ۱۴۰۱"@fa ;
    skos:related <concept:women-life-freedom> , <concept:morality-police> ;
    skos:broader <concept:human-rights-movements> , <concept:womens-rights> ;
    schema:startDate "2022-09-16"^^xsd:date ;
    prov:wasGeneratedBy <session:2024-08-15-evening> .
```

**What you see:** Not just the event, but the web of connections. The protests link to broader human rights movements, women's rights history, state authority concepts. The provenance shows you learned this in an August evening session. Click the session - the timeline replays what else you explored that night. The full context comes back.

**The moment:** You confidently join the conversation, making connections you'd completely forgotten existed in your notes. Connection-triggered recall in action.

## Solid Protocol Integration

This project is designed to work with the **Solid Protocol** for decentralized, user-controlled data storage:

- **Agent**: Claude Code writes RDF triples directly to your Solid Pod via authenticated PATCH operations
- **Visualizer**: Web-based Solid app reads your knowledge graph and renders it with live updates
- **Ownership**: You control your data - knowledge graphs live in your Pod, not our servers
- **Collaboration**: Share concepts across Pods, create team workspaces, reference public ontologies

See [`rdf-graph-viewer/SOLID_INTEGRATION.md`](./rdf-graph-viewer/SOLID_INTEGRATION.md) for detailed architecture and implementation plan.

**Status:** Solid integration is planned but not yet implemented. Current version uses local filesystem storage.

## Requirements

- **[Claude Code](https://claude.com/claude-code)** - Required for the RDF learning agent

The agent runs as a skill within Claude Code and writes semantic triples to your knowledge graph.

## Repository Structure

- **`agent/`** - RDF learning agent (Claude Code skill)
- **`mcp-server/`** - Model Context Protocol server for Solid Pod operations
- **`rdf-graph-viewer/`** - Graph visualization frontend (early development)
- **`aleph.wiki/`** - Future Solid app implementation
- **`.claude/`** - Claude Code configuration for this repository

## Usage

**⚠️ Early Development Warning**: This project is in active development. APIs, file formats, and core functionality may change without notice. Expect breaking changes.

### Setup

1. Install [Claude Code](https://claude.com/claude-code)

2. Copy the agent skill to your Claude Code instance:
   ```bash
   cp agent/rdf-learning.md ~/.config/claude-code/skills/rdf-learning.md
   ```

   Or use the project-local command (already configured):
   ```bash
   # Skill is already in .claude/commands/rdf-learning.md
   ```

3. Ensure `~/aleph-wiki/` directory exists for storing the knowledge graph:
   ```bash
   mkdir -p ~/aleph-wiki/ontologies
   ```

4. Invoke the skill in Claude Code:
   ```
   /rdf-learning
   ```

### Learning Flow

1. Start a learning session by invoking the `rdf-learning` skill
2. Ask questions or provide topics you want to explore
3. The assistant writes RDF triples to `~/aleph-wiki/index.ttl`
4. Monitor the file or use RDF visualization tools to explore your growing knowledge graph
5. Future sessions build on previous concepts, creating cross-session links

The graph structure allows filtering by session, time period, topic hierarchy, or semantic relationships - supporting both visual exploration and SPARQL queries for research.

## License

AGPL-3.0 - see [LICENSE](./LICENSE) for details.
