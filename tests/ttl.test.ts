import { describe, it, expect } from 'vitest';
import { renderChatMessage, renderSessionMeta, renderEditMeta } from '../src/lib/ttl';

describe('renderChatMessage', () => {
  it('renders a user message with provenance', () => {
    const ttl = renderChatMessage({
      sessionId: 'Session_001',
      position: 3,
      speaker: 'user',
      body: 'what is Nash equilibrium?',
      generatedAt: '2026-05-26T14:23:01Z',
    });
    expect(ttl).toContain('a aleph:ChatMessage');
    expect(ttl).toContain('aleph:speaker "user"');
    expect(ttl).toContain('aleph:position 3');
    expect(ttl).toContain('aleph:body "what is Nash equilibrium?"');
    expect(ttl).toContain('prov:wasGeneratedBy :Session_001');
    expect(ttl).toContain('"2026-05-26T14:23:01Z"^^xsd:dateTime');
    expect(ttl).toContain('a aleph:Edit');
    expect(ttl).toContain('aleph:editKind "create"');
  });

  it('escapes quotes and backslashes in body', () => {
    const ttl = renderChatMessage({
      sessionId: 'S', position: 1, speaker: 'user',
      body: 'he said "hi" and \\ then left', generatedAt: '2026-05-26T00:00:00Z',
    });
    expect(ttl).toContain('"he said \\"hi\\" and \\\\ then left"');
  });

  it('includes optional hint', () => {
    const ttl = renderChatMessage({
      sessionId: 'S', position: 2, speaker: 'agent',
      body: 'idea', hint: 'suggestion', generatedAt: '2026-05-26T00:00:00Z',
    });
    expect(ttl).toContain('aleph:hint "suggestion"');
  });
});

describe('renderSessionMeta', () => {
  it('renders session meta with start time', () => {
    const ttl = renderSessionMeta({
      sessionId: 'Session_042',
      startedAt: '2026-05-26T14:00:00Z',
      attributedTo: 'Toph',
    });
    expect(ttl).toContain(':Session_042 a aleph:AlephSession');
    expect(ttl).toContain('prov:startedAtTime "2026-05-26T14:00:00Z"^^xsd:dateTime');
    expect(ttl).toContain('prov:wasAttributedTo :Toph');
  });
});

describe('renderEditMeta', () => {
  it('renders self-described edit block', () => {
    const ttl = renderEditMeta({
      sessionId: 'Session_001',
      at: '2026-05-26T14:00:00Z',
      kind: 'create',
      attributedTo: 'Toph',
    });
    expect(ttl).toContain('<> a aleph:Edit');
    expect(ttl).toContain('prov:wasGeneratedBy :Session_001');
    expect(ttl).toContain('aleph:editKind "create"');
  });
});
