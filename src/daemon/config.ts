import type { Config } from './types';

export function loadConfig(): Config {
  const sources = (process.env.COMUNICA_SOURCES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    podBase: process.env.POD_BASE ?? 'http://localhost:3000',
    comunicaSources: sources,
    promptPath: process.env.PROMPT_PATH ?? 'prompts/agent-event.md',
    model: process.env.AGENT_MODEL || undefined,
    shaclEnforce: process.env.SHACL_ENFORCE === 'true',
  };
}
