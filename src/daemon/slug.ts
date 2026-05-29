/**
 * Normalize a human label into a PascalCase ASCII slug for use as the last
 * segment of an instance IRI (e.g. "Gödel's Incompleteness" → "GoedelsIncompleteness").
 * German umlauts are transliterated (ö→oe) before stripping; other accents are
 * folded via NFKD. Returns "" when nothing usable remains.
 */
export function slugify(label: string): string {
  const transliterated = label
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
  const ascii = transliterated.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Remove punctuation but keep spaces/hyphens as word separators
  const cleaned = ascii.replace(/[^\w\s-]/g, '');
  const words = cleaned.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
