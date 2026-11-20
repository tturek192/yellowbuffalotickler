import type { Scenario } from './schema';

export const TIERS = ['primary', 'official', 'scholarly', 'secondary', 'tertiary'] as const;
export type Tier = (typeof TIERS)[number];

const WEAK: ReadonlySet<string> = new Set<Tier>(['secondary', 'tertiary']);

/** One problem per citation under `historical.*` whose source is secondary or tertiary. */
export function historicalTierRule(s: Scenario): string[] {
  const problems: string[] = [];
  const check = (path: string, id: unknown) => {
    if (typeof id !== 'string') return;
    const tier = s.sources[id]?.tier;
    if (tier && WEAK.has(tier)) {
      problems.push(
        `${path}: source "${id}" is ${tier}; historical targets need primary, official or scholarly sources`,
      );
    }
  };
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}[${i}]`));
    } else if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if ('value' in o && typeof o.source === 'string') check(`${path}.source`, o.source);
      if ('value' in o && Array.isArray(o.sources)) {
        o.sources.forEach((c, i) => check(`${path}.sources[${i}]`, (c as { source?: unknown } | null)?.source));
      }
      for (const [k, val] of Object.entries(o)) walk(val, `${path}.${k}`);
    }
  };
  walk(s.historical, 'historical');
  return problems;
}
