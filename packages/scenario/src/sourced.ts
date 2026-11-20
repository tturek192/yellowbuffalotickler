import { z } from 'zod';
import { parseLocalDateTime } from './local-time';

export type Cite = { source: string; page?: string; note?: string };
export type Disputed<T> = { value: T; range: [T, T]; sources: Cite[]; note: string };
export type Sourced<T> =
  | { value: T; source: string; page?: string; note?: string }
  | { value: T; estimate: string }
  | Disputed<T>;

export const CiteSchema = z.object({
  source: z.string().min(1),
  page: z.string().optional(),
  note: z.string().optional(),
});

export function sourced<S extends z.ZodTypeAny>(inner: S) {
  return z.union([
    z.object({
      value: inner,
      source: z.string().min(1),
      page: z.string().optional(),
      note: z.string().optional(),
    }),
    z.object({ value: inner, estimate: z.string().min(1) }),
  ]);
}

/** Numbers compare numerically, local-time strings chronologically; anything else is not orderable. */
function order(a: unknown, b: unknown): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    try {
      return parseLocalDateTime(a).getTime() - parseLocalDateTime(b).getTime();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** A value the sources disagree on: a working value, the range they span, and at least two citations. */
export function disputed<S extends z.ZodTypeAny>(inner: S) {
  return z
    .object({
      value: inner,
      range: z.tuple([inner, inner]),
      sources: z.array(CiteSchema).min(2),
      note: z.string().min(1),
    })
    .superRefine((d, ctx) => {
      const lo = order(d.range[0], d.value);
      const hi = order(d.value, d.range[1]);
      if (lo === undefined || hi === undefined || lo > 0 || hi > 0) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'value must lie within range (range[0] <= value <= range[1])' });
      }
    });
}

export function sourcedOrDisputed<S extends z.ZodTypeAny>(inner: S) {
  return z.union([sourced(inner), disputed(inner)]);
}

export function v<T>(s: Sourced<T>): T {
  return s.value;
}

export type Point = [number, number];
export const PointSchema = z.tuple([z.number(), z.number()]);
