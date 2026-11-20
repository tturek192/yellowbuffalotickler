import { z } from 'zod';

export type Sourced<T> =
  | { value: T; source: string; page?: string; note?: string }
  | { value: T; estimate: string };

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

export function v<T>(s: Sourced<T>): T {
  return s.value;
}

export type Point = [number, number];
export const PointSchema = z.tuple([z.number(), z.number()]);
