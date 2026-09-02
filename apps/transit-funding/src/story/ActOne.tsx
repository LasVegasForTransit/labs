import { useMemo } from 'react';
import { FUEL_REVENUE_RESTRICTION } from '@/core/data/nevada';
import { simulateYear, toGraph } from '@/core/model';
import { DEFAULT_LAYOUT, layoutGraph } from '@/core/layout';
import { describeGraph } from '@/core/flow';
import { Sankey } from '../sankey/Sankey.tsx';
import { useTweenedResult } from '../sankey/useTweenedResult.ts';
import { useSceneState } from './useSceneState.ts';
import { RTC_BASELINE, RTC_BASE_YEAR } from '@/core/data/rtc-baseline';
import { FUEL_LEVER } from './fuel-lever.ts';

const YEAR = FUEL_REVENUE_RESTRICTION.earliestEffectiveYear;

// Module scope: these are constants, and rebuilding them each render would make
// every memo below depend on a new object identity every time.
const WITH_FUEL_LEVER = {
  ...RTC_BASELINE,
  revenue: [...RTC_BASELINE.revenue, FUEL_LEVER],
};

const CLAUSE_INTACT = { horizonYear: YEAR, levers: {} };
const CLAUSE_STRUCK = { horizonYear: YEAR, levers: { fuel: 1 } };

/**
 * Act One.
 *
 * Opens on the clause rather than on a budget. The thesis is that a few small
 * changes are enough, and the piece never opens by conceding scarcity, which is
 * the opposition's frame and loses the argument before the first scroll.
 */
export function ActOne() {
  const states = useMemo(
    () =>
      [
        simulateYear(WITH_FUEL_LEVER, CLAUSE_INTACT, RTC_BASE_YEAR),
        simulateYear(WITH_FUEL_LEVER, CLAUSE_INTACT, YEAR),
        simulateYear(WITH_FUEL_LEVER, CLAUSE_STRUCK, YEAR),
      ] as const,
    [],
  );

  // One scale across every state in the scene, so a band changes size only when
  // the money changes.
  const scaleDomain = useMemo(
    () => Math.max(...states.flatMap((s) => [s.totalRevenue, s.totalRequired])),
    [states],
  );

  const [scene, register] = useSceneState(states.length);
  const shown = useTweenedResult(states[scene] ?? states[0]);
  const graph = toGraph(shown);
  const layout = layoutGraph(graph, { ...DEFAULT_LAYOUT, scaleDomain });

  return (
    <article className="mx-auto grid max-w-6xl gap-12 px-6 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="md:order-2">
        <figure className="md:sticky md:top-12">
          <Sankey
            layout={layout}
            description={describeGraph(graph)}
            width={DEFAULT_LAYOUT.width}
            height={DEFAULT_LAYOUT.height}
          />
          <figcaption className="mt-2 max-w-[60ch] text-sm">
            Where transit money comes from, and what it pays for.
          </figcaption>
          <p className="mt-1 max-w-[60ch] text-xs text-[var(--color-on-surface-variant)]">
            Figures from RTC's 2024 National Transit Database filing. The constitutional text and
            the {YEAR} date are sourced; growth rates are stated assumptions.
          </p>
        </figure>
      </div>

      <div className="md:order-1">
        <section ref={register(0)} className="min-h-[70vh]">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-on-surface-variant)]">
            Act one
          </p>
          <h1 className="mt-3 text-5xl font-extrabold leading-[1.05] tracking-tight">
            One sentence
          </h1>
          <blockquote
            cite={FUEL_REVENUE_RESTRICTION.url}
            className="mt-6 border-l-2 border-[var(--color-primary)] pl-5 text-lg leading-relaxed"
          >
            {FUEL_REVENUE_RESTRICTION.text}
          </blockquote>
          <p className="mt-5 max-w-[62ch]">
            That is Article {FUEL_REVENUE_RESTRICTION.article}, Section{' '}
            {FUEL_REVENUE_RESTRICTION.section} of the Nevada Constitution. It says what the tax you
            pay at the pump can be spent on, and it has said so since 1940.
          </p>
        </section>

        <section
          ref={register(1)}
          className="min-h-[70vh] border-t border-[var(--color-outline)] pt-8"
        >
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
            What it holds back
          </h2>
          <p className="mt-4 max-w-[62ch]">
            Fuel tax is collected in Clark County every day. Under that sentence, none of it can run
            a bus. It goes to roads, and only to roads, because a legislature in 1937 wrote the word{' '}
            <em>exclusively</em> and voters ratified it three years later.
          </p>
          <p className="mt-4 max-w-[62ch]">
            The one exception the section carves out is a tax on vehicles standing in for a property
            tax. There is no transit exception. There never was.
          </p>
        </section>

        <section
          ref={register(2)}
          className="min-h-[70vh] border-t border-[var(--color-outline)] pt-8"
        >
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">Strike it</h2>
          <p className="mt-4 max-w-[62ch]">
            Nevada changes its constitution by passing the same measure through two consecutive
            legislatures and then a vote of the people. That is how this section arrived: the 1937
            Legislature, the 1939 Legislature, the 1940 ballot. It is how the section was amended in{' '}
            {FUEL_REVENUE_RESTRICTION.precedent.amendedBy[2]}, by the identical path.
          </p>
          <p className="mt-4 max-w-[62ch]">
            Run that forward from the 2027 session and the first dollar arrives in {YEAR}. Not a new
            tax. A sentence.
          </p>
        </section>
      </div>
    </article>
  );
}
