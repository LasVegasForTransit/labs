import { sourced, type Sourced } from '../sourced.ts';

/**
 * The clause Act One opens on.
 *
 * Quoted verbatim so the page can show the sentence itself rather than a
 * paraphrase of it. The argument is that one sentence written in 1937 is doing
 * an enormous amount of work in 2026, and that only lands if the reader reads
 * the sentence.
 */
export const FUEL_REVENUE_RESTRICTION = {
  article: '9',
  section: '5',
  heading:
    'Proceeds from fees for licensing and registration of motor vehicles and excise taxes on fuel reserved for construction, maintenance and repair of public highways; exception.',
  text:
    'The proceeds from the imposition of any license or registration fee and other charge ' +
    'with respect to the operation of any motor vehicle upon any public highway in this ' +
    'State and the proceeds from the imposition of any excise tax on gasoline or other ' +
    'motor vehicle fuel shall, except costs of administration, be used exclusively for the ' +
    'construction, maintenance, and repair of the public highways of this State. The ' +
    'provisions of this section do not apply to the proceeds of any tax imposed upon motor ' +
    'vehicles by the Legislature in lieu of an ad valorem property tax.',
  url: 'https://www.leg.state.nv.us/const/nvconst.html',
  retrieved: '2026-08-05',

  /**
   * The one exception the section itself carves out. Worth naming because it is
   * the only existing crack in the wall, and it is not one transit can use.
   */
  statedException: 'Taxes imposed on motor vehicles in lieu of an ad valorem property tax.',

  amendmentPath: 'constitutional-amendment' as const,

  /**
   * Nevada's own history with this section demonstrates the process rather than
   * predicting it. The section was proposed and passed by the 1937 Legislature,
   * agreed to and passed by the 1939 Legislature, then ratified by voters at the
   * 1940 general election. Its 1962 amendment followed the identical path
   * (1960 Legislature, 1961 Legislature, 1962 general election).
   *
   * Applying that to the next available sessions: passed 2027, agreed 2029,
   * ratified at the November 2030 general election, revenue flowing in 2031.
   * This is a fact about procedure, not pessimism, and it is the floor on what
   * the piece can honestly promise.
   */
  earliestEffectiveYear: 2031,
  precedent: {
    proposed: 1937,
    agreed: 1939,
    ratified: 1940,
    amendedBy: [1960, 1961, 1962] as const,
  },
} as const;

/**
 * Clark County's share of the fuel revenue Article 9 Section 5 walls off from
 * transit.
 *
 * An estimate, and a wide one. Nevada publishes fuel tax collections statewide
 * and by county, but the constitutionally restricted portion is not a line item:
 * Section 5 covers state excise tax on motor vehicle fuel plus vehicle licensing
 * and registration charges, while published county figures mix in local option
 * taxes and the voter-approved fuel revenue index, which are separately
 * dedicated. The range spans the defensible readings rather than picking one and
 * implying a precision the sources do not support.
 *
 * Stated in FY2018 dollars because that is the year of the collections figures
 * this derives from. Restating it to the model's base year is the model's job,
 * which is exactly why every USD figure has to record its dollar year.
 */
export const RESTRICTED_FUEL_REVENUE: Sourced = sourced({
  value: 300_000_000,
  low: 200_000_000,
  high: 450_000_000,
  unit: 'USD/year',
  dollarYear: 2018,
  confidence: 'estimated',
  source: 'Nevada DMV, Fuel Tax Presentation to the 80th Legislature (FY2018 collections)',
  url: 'https://www.leg.state.nv.us/App/NELIS/REL/80th2019/ExhibitDocument/OpenExhibitDocument?exhibitId=35753&fileDownloadName=Department+of+Motor+Vehicles+-_Fuel+Tax+Presentation.pdf',
  retrieved: '2026-08-05',
  note:
    'Statewide fuel tax collections were $580.5M in FY2018, of which Clark County gasoline ' +
    'tax (PPI portion) was $93.7M. Clark County holds roughly 73% of state population and a ' +
    'larger share of vehicle miles travelled. The midpoint assumes a little over half of ' +
    'statewide restricted fuel revenue is attributable to Clark County; the low bound takes ' +
    'only the clearly county-attributable state excise, and the high bound takes the full ' +
    'population share of all restricted collections. Needs replacing with a figure taken ' +
    'directly from an NDOT or Department of Taxation table before publication.',
});
