// Canonicalize a session's claims into the pod's /g/ graph.
// Run: node --import tsx scripts/bless.ts <sessionId> [podBase]
import { PodClient } from '../src/lib/pod';
import { blessSession } from '../src/daemon/bless';

const sessionId = process.argv[2];
const podBase = process.argv[3] ?? process.env.POD_BASE ?? 'http://localhost:3000';
if (!sessionId) {
  console.error('usage: bless <sessionId> [podBase]');
  process.exit(1);
}

const { promoted } = await blessSession(new PodClient(podBase), sessionId);
console.log(`[bless] ${sessionId}: promoted ${promoted.length} concept(s):`);
for (const iri of promoted) console.log(`  ${iri}`);
process.exit(0);
