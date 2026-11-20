const isMap = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

/** One file's run of elements in a merged array: elements start…start+length-1 came from `file`. */
type Segment = { file: string; start: number; length: number; labels?: string[] };

/**
 * Where each part of a merged scenario came from, so problems can name the file and the index within it.
 * Array paths and map key paths are dotted, as in problem paths (`historical.casualties`, `sources.x`).
 */
export class Provenance {
  private readonly segments = new Map<string, Segment[]>();
  private readonly owners = new Map<string, string>();

  /** Record that the map key or scalar at `path` was first defined in `file`. */
  own(path: string, file: string): void {
    if (!this.owners.has(path)) this.owners.set(path, file);
  }

  ownerOf(path: string): string | undefined {
    return this.owners.get(path);
  }

  /**
   * Record that `length` elements of the merged array at `arrayPath`, from index `start`, came from `file`.
   * With `labels` (one per element, e.g. GeoJSON feature ids) an element is named `file#label` instead of by index.
   */
  addSegment(arrayPath: string, file: string, start: number, length: number, labels?: string[]): void {
    const list = this.segments.get(arrayPath) ?? [];
    list.push({ file, start, length, ...(labels ? { labels } : {}) });
    this.segments.set(arrayPath, list);
  }

  /**
   * Rewrite a merged-scenario path as `file: path-within-file`. For example `forces[1].formations[0].id`, where
   * forces[1] is the first force of oob-german.yaml, becomes `oob-german.yaml: forces[0].formations[0].id`.
   * A path the provenance does not cover (such as `(root)`) is returned unchanged.
   */
  locate(path: string): string {
    const token = /([^.[\]]+)|\[(\d+)\]/g;
    let keys = '';
    let owner: string | undefined;
    for (let m = token.exec(path); m; m = token.exec(path)) {
      if (m[1] !== undefined) {
        keys = keys ? `${keys}.${m[1]}` : m[1];
        owner = this.owners.get(keys) ?? owner;
        continue;
      }
      const segs = this.segments.get(keys);
      if (!segs) break; // inside an element: it belongs wholly to one file
      const n = Number(m[2]);
      const seg = segs.find((x) => n >= x.start && n < x.start + x.length);
      if (!seg) break;
      const rest = path.slice(token.lastIndex);
      if (seg.labels) return `${seg.file}#${seg.labels[n - seg.start]}${rest}`;
      return `${seg.file}: ${path.slice(0, m.index)}[${n - seg.start}]${rest}`;
    }
    return owner ? `${owner}: ${path}` : path;
  }
}

/** Rewrite the leading path of a `path: message` problem with `locate`. */
export function locateProblem(problem: string, locate: (path: string) => string): string {
  const at = problem.indexOf(': ');
  return at < 0 ? problem : `${locate(problem.slice(0, at))}${problem.slice(at)}`;
}

/**
 * Merge the parts of a multi-file scenario (main file first, then includes in order).
 * Arrays concatenate; maps merge (`sources` entries are atomic, so a repeated key is a conflict);
 * any other repeated key is a conflict naming both files. Nothing is validated here. The provenance records
 * which file each key and each run of array elements came from.
 */
export function mergeScenarioParts(
  parts: Array<{ file: string; data: unknown }>,
): { merged: unknown; problems: string[]; provenance: Provenance } {
  const problems: string[] = [];
  const merged: Record<string, unknown> = {};
  const prov = new Provenance();

  const mergeInto = (target: Record<string, unknown>, src: Record<string, unknown>, path: string, file: string) => {
    const atomic = path === 'sources'; // each source id is one indivisible entry
    for (const [k, val] of Object.entries(src)) {
      const here = path ? `${path}.${k}` : k;
      if (!(k in target)) {
        prov.own(here, file);
        if (isMap(val) && !atomic) {
          target[k] = {};
          mergeInto(target[k] as Record<string, unknown>, val, here, file);
        } else if (Array.isArray(val)) {
          target[k] = [...val];
          prov.addSegment(here, file, 0, val.length);
        } else {
          target[k] = val;
        }
        continue;
      }
      const cur = target[k];
      if (Array.isArray(cur) && Array.isArray(val)) {
        prov.addSegment(here, file, cur.length, val.length);
        cur.push(...val);
      } else if (isMap(cur) && isMap(val) && !atomic) mergeInto(cur, val, here, file);
      else problems.push(`${here}: defined in ${prov.ownerOf(here) ?? '?'} and ${file}`);
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
  return { merged, problems, provenance: prov };
}
