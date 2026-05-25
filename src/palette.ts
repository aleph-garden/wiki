export type Palette = Record<string, string>;

export interface ThemePair {
  light: Palette;
  dark: Palette;
}

export type ThemeName = 'default' | 'parchment' | 'midnight' | 'rust';
export type Typeface = 'literary' | 'modern' | 'mono';

const THEMES: Record<ThemeName, ThemePair> = {
  default: {
    light: {
      bg: '#fbf8f1', panel: '#ffffff', fg: '#1a1714', mute: 'rgba(26,23,20,.55)',
      rule: 'rgba(26,23,20,.12)', soft: 'rgba(26,23,20,.04)',
      accent: '#1d2a4a', sepia: '#8a4b1c', sage: '#6e8579', gold: '#9a7926',
      ok: '#4a7d3f', warn: '#b25526', halo: '#7a8f86', hot: '#9a7926',
      kindConcept: '#1d2a4a', kindPerson: '#6e8579', kindEvent: '#9a7926',
    },
    dark: {
      bg: '#0a0c14', panel: 'rgba(20,22,30,.6)', fg: '#e9e4d3', mute: 'rgba(233,228,211,.55)',
      rule: 'rgba(233,228,211,.12)', soft: 'rgba(233,228,211,.04)', faint: 'rgba(233,228,211,.16)',
      accent: '#7da3d6', sepia: '#c98a4a', sage: '#9ac3b1', gold: '#d4ac4e',
      ok: '#7fb86b', warn: '#e08247', halo: '#7a8f86', hot: '#d8a55a',
      cool: '#7a9bb8', leaf: '#9ec2ab', aleph: '#e9e4d3',
      kindConcept: '#9ec2ab', kindPerson: '#7a9bb8', kindEvent: '#d8a55a',
      orbit: 'rgba(233,228,211,.08)',
    },
  },
  parchment: {
    light: {
      bg: '#f6efde', panel: '#fbf6e8', fg: '#23170d', mute: 'rgba(35,23,13,.55)',
      rule: 'rgba(35,23,13,.14)', soft: 'rgba(35,23,13,.05)',
      accent: '#26345a', sepia: '#9a5520', sage: '#7c9389', gold: '#aa8930',
      ok: '#5b7d40', warn: '#b25526', halo: '#7c9389', hot: '#aa8930',
      kindConcept: '#26345a', kindPerson: '#7c9389', kindEvent: '#aa8930',
    },
    dark: {
      bg: '#1a140a', panel: 'rgba(38,32,20,.6)', fg: '#f6efde', mute: 'rgba(246,239,222,.55)',
      rule: 'rgba(246,239,222,.12)', soft: 'rgba(246,239,222,.05)', faint: 'rgba(246,239,222,.18)',
      accent: '#a8b4d8', sepia: '#d49a5a', sage: '#a8c4b8', gold: '#e0b65c',
      ok: '#9ec488', warn: '#e08247', halo: '#a8c4b8', hot: '#e0b65c',
      cool: '#a8c0e0', leaf: '#a8c4b8', aleph: '#f6efde',
      kindConcept: '#a8c4b8', kindPerson: '#a8c0e0', kindEvent: '#e0b65c',
      orbit: 'rgba(246,239,222,.08)',
    },
  },
  midnight: {
    light: {
      bg: '#161a23', panel: '#1f2330', fg: '#e8e0c7', mute: 'rgba(232,224,199,.55)',
      rule: 'rgba(232,224,199,.14)', soft: 'rgba(232,224,199,.04)',
      accent: '#7da3d6', sepia: '#c98a4a', sage: '#9ac3b1', gold: '#d4ac4e',
      ok: '#7fb86b', warn: '#e08247', halo: '#9ac3b1', hot: '#d4ac4e',
      kindConcept: '#7da3d6', kindPerson: '#9ac3b1', kindEvent: '#d4ac4e',
    },
    dark: {
      bg: '#04060e', panel: 'rgba(10,14,28,.6)', fg: '#f4eed8', mute: 'rgba(244,238,216,.55)',
      rule: 'rgba(244,238,216,.12)', soft: 'rgba(244,238,216,.04)', faint: 'rgba(244,238,216,.18)',
      accent: '#8fb6dc', sepia: '#e0b65c', sage: '#a8d0bb', gold: '#e0b65c',
      ok: '#7fb86b', warn: '#e08247', halo: '#9ac3b1', hot: '#e0b65c',
      cool: '#8fb6dc', leaf: '#a8d0bb', aleph: '#f4eed8',
      kindConcept: '#a8d0bb', kindPerson: '#8fb6dc', kindEvent: '#e0b65c',
      orbit: 'rgba(244,238,216,.06)',
    },
  },
  rust: {
    light: {
      bg: '#f3ead7', panel: '#fbf6e8', fg: '#1b1410', mute: 'rgba(27,20,16,.55)',
      rule: 'rgba(27,20,16,.13)', soft: 'rgba(27,20,16,.04)',
      accent: '#2a3a3a', sepia: '#b25526', sage: '#6e8579', gold: '#9a7926',
      ok: '#5b7d40', warn: '#b25526', halo: '#b25526', hot: '#b25526',
      kindConcept: '#2a3a3a', kindPerson: '#6e8579', kindEvent: '#b25526',
    },
    dark: {
      bg: '#160c08', panel: 'rgba(38,20,12,.6)', fg: '#f0e0c8', mute: 'rgba(240,224,200,.55)',
      rule: 'rgba(240,224,200,.12)', soft: 'rgba(240,224,200,.04)', faint: 'rgba(240,224,200,.18)',
      accent: '#a8c4b8', sepia: '#d96a30', sage: '#a8c4b8', gold: '#e0b65c',
      ok: '#9ec488', warn: '#e08247', halo: '#d96a30', hot: '#d96a30',
      cool: '#a8c0e0', leaf: '#a8c4b8', aleph: '#f0e0c8',
      kindConcept: '#a8c4b8', kindPerson: '#a8c0e0', kindEvent: '#d96a30',
      orbit: 'rgba(240,224,200,.08)',
    },
  },
};

export function getPalette(theme: ThemeName): ThemePair {
  return THEMES[theme] ?? THEMES.default;
}

export function proseFont(typeface: Typeface): string {
  if (typeface === 'modern') return '"Inter", system-ui, sans-serif';
  if (typeface === 'mono')   return '"JetBrains Mono", ui-monospace, monospace';
  return '"Fraunces", "Cormorant Garamond", Georgia, serif';
}

export const FONT_UI    = "'Inter', system-ui, sans-serif";
export const FONT_MONO  = "'JetBrains Mono', ui-monospace, monospace";
export const FONT_SERIF = "'Fraunces', 'Cormorant Garamond', Georgia, serif";
