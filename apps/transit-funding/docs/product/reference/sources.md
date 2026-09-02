# Sources

Every figure in the fiscal model appears in the evidence inventory. Model code contains no
unreferenced public number.

## Constitutional restriction

| Figure                   | Value                                           | Confidence | Source                                                                            | Retrieved  |
| ------------------------ | ----------------------------------------------- | ---------- | --------------------------------------------------------------------------------- | ---------- |
| Article 9 Section 5 text | Verbatim                                        | Reported   | [Nevada Constitution](https://www.leg.state.nv.us/const/nvconst.html)             | 2026-08-05 |
| Adoption path            | 1937 Legislature, 1939 Legislature, 1940 ballot | Reported   | Same, section history note                                                        | 2026-08-05 |
| 1962 amendment path      | 1960 Legislature, 1961 Legislature, 1962 ballot | Reported   | Same, section history note                                                        | 2026-08-05 |
| Earliest effective year  | 2031                                            | Derived    | Adoption path applied to the 2027 and 2029 sessions and the 2030 general election | 2026-08-05 |

Section 5 reserves charges on operating a motor vehicle on a public highway and excise tax on motor
vehicle fuel for highways. Its stated exception covers a tax imposed on motor vehicles in place of
an ad valorem property tax.

Nevada amends its constitution by passing the same measure through two consecutive legislatures and
then a popular vote. The section followed that path in 1940 and again in 1962. Applied to the next
sessions, the sequence is 2027 passage, 2029 passage, November 2030 ballot, and 2031 revenue.

## Fuel revenue

| Figure                                         | Value                                    | Confidence | Source                                                                                                                                                                                                                                 | Retrieved  |
| ---------------------------------------------- | ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Statewide fuel tax collections, FY2018         | $580,470,766                             | Reported   | [Nevada DMV fuel tax presentation, 80th Legislature](https://www.leg.state.nv.us/App/NELIS/REL/80th2019/ExhibitDocument/OpenExhibitDocument?exhibitId=35753&fileDownloadName=Department+of+Motor+Vehicles+-_Fuel+Tax+Presentation.pdf) | 2026-08-05 |
| Clark County gasoline tax, PPI portion, FY2018 | $93,714,850                              | Reported   | Same                                                                                                                                                                                                                                   | 2026-08-05 |
| Clark County restricted fuel revenue           | $300M, range $200M–$450M, FY2018 dollars | Estimated  | Derived from the two reported figures                                                                                                                                                                                                  | 2026-08-05 |

The restricted figure stays a deliberately wide estimate. Nevada publishes fuel tax collections, but
the constitutionally restricted Clark County share is not a separate line item. The range covers
defensible readings of state excise tax, vehicle charges, local option taxes, and population share.

The interface presents the estimate with its range and hatched confidence encoding. A primary NDOT
or Department of Taxation table replaces the estimate when one establishes the same boundary
directly.

## RTC funding and expenses

The baseline uses RTC of Southern Nevada's 2024 National Transit Database filing for agency 90045.
Reported funding lines sum to the published total, and reported expense lines sum to published
operating expense.

| Figure                       | Value        | Confidence | Source                                                                                        | Retrieved  |
| ---------------------------- | ------------ | ---------- | --------------------------------------------------------------------------------------------- | ---------- |
| Total funding                | $414,501,581 | Reported   | [NTD funding sources by agency](https://data.transportation.gov/resource/ujv8-f24s.json)      | 2026-08-05 |
| Local                        | $221,410,613 | Reported   | Same                                                                                          | 2026-08-05 |
| Federal                      | $97,529,438  | Reported   | Same                                                                                          | 2026-08-05 |
| Fares and directly generated | $85,308,831  | Reported   | Same                                                                                          | 2026-08-05 |
| State                        | $10,252,699  | Reported   | Same                                                                                          | 2026-08-05 |
| Total operating expenses     | $330,345,296 | Reported   | [NTD service and operating expenses](https://data.transportation.gov/resource/ectq-t3k3.json) | 2026-08-05 |
| Vehicle operations           | $156,689,371 | Reported   | Same                                                                                          | 2026-08-05 |
| General administration       | $109,767,915 | Reported   | Same                                                                                          | 2026-08-05 |
| Vehicle maintenance          | $50,475,546  | Reported   | Same                                                                                          | 2026-08-05 |
| Facility maintenance         | $13,412,464  | Reported   | Same                                                                                          | 2026-08-05 |
| Capital and reserves         | $84,156,285  | Derived    | Total funding less total operating expense                                                    | 2026-08-05 |

NTD is a federal filing rather than RTC's adopted budget. Its standard schedule supports later peer
comparison, but expense by function does not isolate the paratransit share. TransitFunding labels
that limitation and uses aggregate expense categories.

## Assumptions and evidence gaps

Growth and inflation rates are model assumptions. Each one carries a midpoint, low and high bounds,
source context, and a note explaining the judgment.

| Evidence gap                                  | Model treatment                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Primary Clark County restricted-revenue table | Display the derived estimate and full range                                  |
| Paratransit expense split                     | Use aggregate NTD function categories; do not claim a mode split             |
| RTC adopted budget                            | Use the federal NTD filing as the reported baseline and name the distinction |

An evidence gap remains visible in the source inventory and interface. It never turns into an
unlabeled point estimate.
