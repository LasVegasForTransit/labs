import { useEffect, useRef, useState } from 'react';

/**
 * Which scene the reader is looking at, given how much of each is on screen.
 *
 * Extracted from the hook so the selection rule is testable without a DOM. The
 * interesting behaviour is the tie-break and the hold, not the observer.
 */
export function sceneFromRatios(ratios: readonly number[], previous = 0): number {
  let best = -1;
  let bestRatio = 0;
  for (let i = 0; i < ratios.length; i++) {
    // Strictly greater, so a tie keeps the earlier scene. Without that,
    // scrolling back up flickers between two equally visible sections.
    if ((ratios[i] ?? 0) > bestRatio) {
      bestRatio = ratios[i] ?? 0;
      best = i;
    }
  }
  return best === -1 ? previous : best;
}

export type RegisterScene = (index: number) => (el: HTMLElement | null) => void;

export function useSceneState(count: number): [number, RegisterScene] {
  const [scene, setScene] = useState(0);
  const elements = useRef<(HTMLElement | null)[]>([]);
  const ratios = useRef<number[]>([]);
  const sceneRef = useRef(0);

  useEffect(() => {
    ratios.current = Array<number>(count).fill(0);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = elements.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) ratios.current[index] = entry.intersectionRatio;
        }
        const next = sceneFromRatios(ratios.current, sceneRef.current);
        sceneRef.current = next;
        setScene(next);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const element of elements.current) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [count]);

  const register: RegisterScene = (index) => (el) => {
    elements.current[index] = el;
  };

  return [scene, register];
}
