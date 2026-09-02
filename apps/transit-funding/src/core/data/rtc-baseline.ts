import { sourced } from '../sourced.ts';
import type { FiscalInputs } from '../model.ts';

/**
 * RTC of Southern Nevada's actual money, from its 2024 National Transit
 * Database filing.
 *
 * Not the adopted budget. rtcsnv.com refuses automated requests, and the only
 * archived audited statement is encrypted, so the agency's own document could
 * not be retrieved. NTD is the next best thing and is arguably better for this
 * purpose: it is a federal filing the agency is legally required to make, it is
 * machine-readable, and it is reported on a standard schedule that makes peer
 * comparison possible later without restating anything.
 *
 * What it costs: NTD reports operating expense by function rather than by mode,
 * so paratransit is not separable here. When the adopted budget is obtained,
 * that split should replace this one — `docs/reference/sources.md` records it
 * as outstanding.
 */
const NTD = {
  source: 'National Transit Database, 2024 Annual Data, agency 90045',
  url: 'https://data.transportation.gov/resource/ujv8-f24s.json',
  retrieved: '2026-08-05',
} as const;

const EXPENSES = {
  source: 'National Transit Database, 2024 Annual Data, Service and Operating Expenses by Agency',
  url: 'https://data.transportation.gov/resource/ectq-t3k3.json',
  retrieved: '2026-08-05',
} as const;

export const RTC_BASE_YEAR = 2024;

const reported = (value: number, doc: typeof NTD | typeof EXPENSES) =>
  sourced({
    value,
    unit: 'USD/year',
    dollarYear: RTC_BASE_YEAR,
    confidence: 'reported' as const,
    ...doc,
  });

/**
 * Growth and inflation are judgement, not reporting, so they carry ranges. The
 * midpoints are deliberately unremarkable: sales-tax-backed local revenue
 * tracking a little above inflation, federal formula funding roughly flat in
 * nominal terms, and labour-driven operating cost rising faster than either.
 * That combination is why the gap opens without anyone deciding to defund
 * anything.
 */
const rate = (value: number, note: string) =>
  sourced({
    value,
    unit: 'ratio',
    confidence: 'estimated' as const,
    low: value - 0.01,
    high: value + 0.01,
    note,
    source: 'Assumption, stated so it can be argued with',
    url: 'https://data.transportation.gov/resource/ujv8-f24s.json',
    retrieved: '2026-08-05',
  });

/** Printed on the face of the filing. The model must reproduce these. */
export const RTC_PUBLISHED_TOTAL_REVENUE = reported(414_501_581, NTD);
export const RTC_PUBLISHED_OPERATING_EXPENSES = reported(330_345_296, EXPENSES);

/**
 * Funding that did not go to operations in the reporting year: capital and
 * everything held back. Derived rather than reported, because NTD's funding
 * table and its operating expense table are separate filings and the difference
 * between them is arithmetic rather than a published line.
 */
const CAPITAL_AND_RESERVES = 414_501_581 - 330_345_296;

export const RTC_BASELINE: FiscalInputs = {
  baseYear: RTC_BASE_YEAR,
  revenue: [
    {
      id: 'local',
      label: 'Local',
      difficulty: 'authorized',
      base: reported(221_410_613, NTD),
      growth: rate(0.03, 'Sales-tax-backed local revenue, tracking above inflation'),
    },
    {
      id: 'federal',
      label: 'Federal',
      difficulty: 'authorized',
      base: reported(97_529_438, NTD),
      growth: rate(0.01, 'Formula funding, roughly flat in nominal terms'),
    },
    {
      id: 'fares',
      label: 'Fares and directly generated',
      difficulty: 'authorized',
      base: reported(85_308_831, NTD),
      growth: rate(0.01, 'Ridership recovery against no assumed fare increase'),
    },
    {
      id: 'state',
      label: 'State',
      difficulty: 'authorized',
      base: reported(10_252_699, NTD),
      growth: rate(0.01, 'No assumed change in state participation'),
    },
  ],
  cost: [
    {
      id: 'vehicle-operations',
      label: 'Vehicle operations',
      base: reported(156_689_371, EXPENSES),
      inflation: rate(0.04, 'Operator wages and benefits, the largest single driver'),
      // The service that stops when money runs out. Everything else is
      // contractual, mandated, or fixed, which is why a shortfall lands here.
      discretionary: true,
    },
    {
      id: 'general-administration',
      label: 'General administration',
      base: reported(109_767_915, EXPENSES),
      inflation: rate(0.03, 'Salaries, insurance, and facilities overhead'),
      discretionary: false,
    },
    {
      id: 'vehicle-maintenance',
      label: 'Vehicle maintenance',
      base: reported(50_475_546, EXPENSES),
      inflation: rate(0.04, 'Parts and technician wages'),
      discretionary: false,
    },
    {
      id: 'facility-maintenance',
      label: 'Facility maintenance',
      base: reported(13_412_464, EXPENSES),
      inflation: rate(0.03, 'Stops, shelters, yards, and buildings'),
      discretionary: false,
    },
    {
      id: 'capital-and-reserves',
      label: 'Capital and reserves',
      base: sourced({
        value: CAPITAL_AND_RESERVES,
        unit: 'USD/year',
        dollarYear: RTC_BASE_YEAR,
        confidence: 'derived',
        note: 'Total funding less total operating expense, from the two NTD tables.',
        ...NTD,
      }),
      inflation: rate(0.02, 'Construction cost, held below operating inflation'),
      discretionary: false,
    },
  ],
};
