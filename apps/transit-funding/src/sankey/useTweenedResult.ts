import { useEffect, useRef, useState } from 'react';
import type { YearResult } from '@/core/model';

/**
 * Interpolates the values and lets core re-lay-out each frame, rather than
 * tweening SVG path strings.
 *
 * Every intermediate frame is therefore a real layout of a real, if fractional,
 * budget. The diagram cannot pass through a geometrically impossible state on
 * its way between two valid ones, which a path tween has no way to guarantee.
 */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Line {
  readonly id: string;
}

/**
 * Both states' lines in a stable order: the start state's order first, then
 * anything the end state introduces. A line missing from one side counts as
 * zero, so it grows or shrinks instead of appearing at full size.
 */
function mergeById<T extends Line>(
  from: readonly T[],
  to: readonly T[],
): readonly [T | undefined, T | undefined, string][] {
  const ids = [
    ...from.map((l) => l.id),
    ...to.map((l) => l.id).filter((id) => !from.some((f) => f.id === id)),
  ];
  return ids.map((id) => [from.find((l) => l.id === id), to.find((l) => l.id === id), id]);
}

export function blendResults(from: YearResult, to: YearResult, t: number): YearResult {
  if (t <= 0) return from;
  if (t >= 1) return to;

  const revenue = mergeById(from.revenue, to.revenue).map(([a, b, id]) => {
    const template = a ?? b;
    if (!template) throw new Error(`no template for revenue line ${id}`);
    return { ...template, amount: lerp(a?.amount ?? 0, b?.amount ?? 0, t) };
  });

  const cost = mergeById(from.cost, to.cost).map(([a, b, id]) => {
    const template = a ?? b;
    if (!template) throw new Error(`no template for cost line ${id}`);
    return {
      ...template,
      required: lerp(a?.required ?? 0, b?.required ?? 0, t),
      funded: lerp(a?.funded ?? 0, b?.funded ?? 0, t),
    };
  });

  const totalRevenue = lerp(from.totalRevenue, to.totalRevenue, t);
  const totalRequired = lerp(from.totalRequired, to.totalRequired, t);

  return {
    year: Math.round(lerp(from.year, to.year, t)),
    revenue,
    cost,
    totalRevenue,
    totalRequired,
    // Recomputed rather than interpolated, so the readout never disagrees with
    // the bands a reader is looking at mid-transition.
    gap: totalRevenue - totalRequired,
  };
}

const easeInOutCubic = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export function useTweenedResult(target: YearResult, durationMs = 620): YearResult {
  const [current, setCurrent] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || durationMs <= 0) {
      fromRef.current = target;
      setCurrent(target);
      return;
    }

    const from = fromRef.current;
    let start: number | undefined;
    const step = (now: number): void => {
      start ??= now;
      const p = Math.min(1, (now - start) / durationMs);
      setCurrent(blendResults(from, target, easeInOutCubic(p)));
      if (p < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, durationMs]);

  return current;
}
