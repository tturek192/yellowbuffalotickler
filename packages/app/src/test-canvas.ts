/** A call made on the stub context, with the fill and stroke styles then in force. */
export type Call = { name: string; args: unknown[]; fillStyle: unknown; strokeStyle: unknown; globalAlpha: unknown };

/** A 2D context stub (w × h CSS pixels at devicePixelRatio 1) that records every method call. */
export function recordingContext(w = 800, h = 600) {
  const calls: Call[] = [];
  const props: Record<string | symbol, unknown> = { canvas: { width: w, height: h }, globalAlpha: 1 };
  const returns: Record<string, (...a: unknown[]) => unknown> = {
    getTransform: () => ({ a: 1 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (t) => ({ width: String(t).length * 6 }),
  };
  const ctx = new Proxy(
    {},
    {
      get: (_, k) =>
        k in props
          ? props[k]
          : (...args: unknown[]) => {
              calls.push({ name: String(k), args, fillStyle: props.fillStyle, strokeStyle: props.strokeStyle, globalAlpha: props.globalAlpha });
              return returns[String(k)]?.(...args);
            },
      set: (_, k, v) => {
        props[k] = v;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls, count: (name: string) => calls.filter((c) => c.name === name).length };
}
