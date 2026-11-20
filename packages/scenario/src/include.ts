const isMap = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Merge the parts of a multi-file scenario (main file first, then includes in order).
 * Arrays concatenate; maps merge (`sources` entries are atomic, so a repeated key is a conflict);
 * any other repeated key is a conflict naming both files. Nothing is validated here.
 */
export function mergeScenarioParts(
  parts: Array<{ file: string; data: unknown }>,
): { merged: unknown; problems: string[] } {
  const problems: string[] = [];
  const merged: Record<string, unknown> = {};
  const owner = new Map<string, string>(); // path of a defined scalar/atomic entry -> file

  const mergeInto = (target: Record<string, unknown>, src: Record<string, unknown>, path: string, file: string) => {
    const atomic = path === 'sources'; // each source id is one indivisible entry
    for (const [k, val] of Object.entries(src)) {
      const here = path ? `${path}.${k}` : k;
      if (!(k in target)) {
        if (isMap(val) && !atomic) {
          target[k] = {};
          owner.set(here, file);
          mergeInto(target[k] as Record<string, unknown>, val, here, file);
        } else {
          target[k] = Array.isArray(val) ? [...val] : val;
          owner.set(here, file);
        }
        continue;
      }
      const cur = target[k];
      if (Array.isArray(cur) && Array.isArray(val)) cur.push(...val);
      else if (isMap(cur) && isMap(val) && !atomic) mergeInto(cur, val, here, file);
      else problems.push(`${here}: defined in ${owner.get(here) ?? '?'} and ${file}`);
    }
  };

  for (const { file, data } of parts) {
    if (data === null || data === undefined) continue;
    if (!isMap(data)) {
      problems.push(`${file}: expected a mapping at the top level`);
      continue;
    }
    mergeInto(merged, data, '', file);
  }
  return { merged, problems };
}
