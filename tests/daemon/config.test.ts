// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../../src/daemon/config';

const SAVED = { ...process.env };
afterEach(() => { process.env = { ...SAVED }; });

describe('loadConfig', () => {
  it('reads POD_BASE and splits COMUNICA_SOURCES on commas', () => {
    process.env.POD_BASE = 'http://localhost:3000';
    process.env.COMUNICA_SOURCES = 'https://a.example/sparql, https://b.example/sparql';
    delete process.env.AGENT_MODEL;
    const c = loadConfig();
    expect(c.podBase).toBe('http://localhost:3000');
    expect(c.comunicaSources).toEqual(['https://a.example/sparql', 'https://b.example/sparql']);
    expect(c.promptPath).toBe('prompts/agent-event.md');
    expect(c.model).toBeUndefined();
  });

  it('defaults podBase and empty sources when unset', () => {
    delete process.env.POD_BASE;
    delete process.env.COMUNICA_SOURCES;
    const c = loadConfig();
    expect(c.podBase).toBe('http://localhost:3000');
    expect(c.comunicaSources).toEqual([]);
  });

  it('passes AGENT_MODEL through', () => {
    process.env.AGENT_MODEL = 'claude-opus-4-8';
    const c = loadConfig();
    expect(c.model).toBe('claude-opus-4-8');
  });
});
