# Talent Atlas

A campus research sourcing dashboard built around official conference proceedings. The Worker has no runtime package dependencies. Sites-managed D1 stores source plans and validation history; R2 stores versioned source collections.

## GitHub Pages snapshot

The [published research dashboard](https://gabbyxia.github.io/Candidate-Agent/) is a static version of the checked-in papers and cited research proposals. It supports browsing, filtering, local shortlists/evidence review, and JSON/Excel downloads. Live research and saved server runs remain in the full application.

The GitHub Actions workflow builds and publishes updated snapshots on pushes to `main` in [GabbyXia/Candidate-Agent](https://github.com/GabbyXia/Candidate-Agent). It makes no model calls and does not upload local run results, caches, credentials, or database state. See [Pages setup and updates](docs/GITHUB_PAGES.md).

```sh
npm run build:pages
```

The generated `dist-pages/` is ignored by Git. GitHub Actions uploads it as a deployment artifact rather than committing generated files.

New teammates can start with the [Talent Atlas onboarding guide](docs/ONBOARDING.md) for the end-to-end workflow, component map, evidence rules, local setup, and recovery steps.

The included 2024–2026 snapshot contains **1,200 real papers and 8,869 author occurrences across 15 conference editions**: 587 OSDI/NSDI papers and 613 SIGCOMM/CoNEXT/IMC papers. An author occurrence is a byline entry, not a count of independently verified people. The snapshot contains no synthetic candidates, invented academic biographies, or generated graduation dates.

## Run and verify

Requires Node 22.13 or newer. Run npm commands from the `talent-atlas` directory, which contains `package.json` and `package-lock.json`. If your terminal is currently in the parent `candidate-agent` directory, enter the app first:

```sh
cd talent-atlas
```

Install development migration tooling once, then start the local server:

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Source verification reads saved snapshots without contacting publishers:

```sh
npm run verify:sources
npm run build
npm test
npm run validate
```

## Talent mapping run

The primary screen takes one technical hiring direction through the complete workflow:

1. Match the direction to the maintained CS-domain catalog and recommend relevant conferences, with reasons and editable scope.
2. Collect official main-conference paper records for the chosen publication years using validated source plans.
3. Deduplicate papers and build provisional author identities without discarding unmatched or incomplete records.
4. Create one independent, source-cited API research task per author. Tasks search university pages, personal sites, labs, CVs, and public professional pages; LinkedIn is optional.
5. Aggregate academic evidence and categorize research leads by research alignment, academic status, and graduation timing. Unknown facts remain needs-review records.
6. Export an actual `.xlsx` workbook and inspect, search, filter, or paginate the results in the same run screen. The existing dashboard is also available.

The workbook contains Summary, Candidates, Matches, NeedsReview, Papers, Sources, and Coverage sheets. It retains all authors and papers. Proposed facts, reviewed facts, source dates, citations, explicit graduation dates, and uncertain duration estimates are distinguished. Export was independently round-tripped through openpyxl with the complete 1,200-paper/6,847-profile snapshot; the workbook is about 15.9 MiB. Exported text cannot execute as an Excel formula.

Runs and task leases persist in D1, while checkpoints and individual research outputs persist in R2. Processing advances in bounded batches while the run page is open or when an API client calls the advance endpoint. Closing the page preserves progress but does not promise unattended processing. Resume continues the same saved run. Interrupted model calls with uncertain provider processing require explicit retry, avoiding automatic duplicate API charges. Completed author tasks are retained when failed source editions are explicitly retried.

The default research and source-discovery model is `gpt-6.1-sol`. Local development loads the ignored app `.env`; production uses the Sites secret store. The supplied API key was verified, stored as a secret, and used in bounded live research tests. Full-cohort research starts only when a user starts or resumes a mapping run. API usage is billed to the configured OpenAI account.

## Catalog and collection scope

Choose a CS subdomain, review its mapped conferences and official sources, then collect selected editions. The curated catalog covers **18 subdomains and 54 venues**. Eight venue adapters are implemented: OSDI, NSDI, FAST, historical USENIX ATC, USENIX Security, SIGCOMM, CoNEXT, and IMC. Other venues are explicitly mapped as planned connectors; inclusion does not imply their papers have been collected.

The bundled paper snapshot covers five venues over three years. Other implemented USENIX adapters fetch official sources when requested. ATC 2026 uses its ACM SIGOPS source through a validated declarative plan; live verification collected all 135 publisher-declared papers. Source availability and accepted-census uncertainty are reported per edition.

## Hybrid source resolution

Open **Source plans** to inspect the shared registry. It starts with **29 validated plans**: USENIX conference editions from 2023–2026, including the ATC 2026 publisher migration, and SIGCOMM/CoNEXT/IMC from 2024–2026. A plan is keyed by conference, year, and main track. Its immutable version identifies official authority, entry URL, deterministic adapter, restricted selectors when needed, and single-page scope.

Known sources run through existing publisher adapters. On a missing plan or semantic parser drift, the configured source agent proposes a new declarative plan. Code checks the authority chain, edition, accepted-paper track, record shape, pagination, duplicates, sample records, and counts. Agent output is never executed as scraper code. Unknown or unsupported paginated/API formats return `adapter_required`.

The Discover/repair control produces a candidate for inspection. Validation creates a separate report bound to the plan digest, adapter version, and source content fingerprint. Explicit activation uses an optimistic concurrency check. The per-edition collection endpoint can also discover, validate, and activate a repair automatically when its deterministic checks pass; routine content changes or count uncertainty alone do not trigger a model call. Bulk collection uses active plans and reports unresolved scopes without issuing an unbounded series of model calls.

Publisher counts, when present, are compared with parsed records. A valid plan does not imply a complete accepted-paper census: missing counts remain unknown, and a stated-count mismatch stays partial. Severe count drops, wrong editions, mixed tracks, unsupported pagination, and malformed records quarantine the attempted change. Failed or degraded refreshes retain the prior successful R2 object and its original retrieval date; the latest attempt is recorded separately.

Live source discovery uses the server API key and `OPENAI_SOURCE_MODEL`, falling back to `OPENAI_RESEARCH_MODEL`. Known plans, validation, and collection work without a model connection. New formats that cannot be represented by a reviewed adapter are explicitly reported rather than populated with substitute records.

Source plans, checks, active pointers, and cache references persist in Sites D1 (`DB`); paper collection objects persist in Sites R2 (`BUCKET`). These shared source records are independent of the browser-local recruiting workspace. Locally, `npm run dev` applies the checked-in migrations to SQLite and stores development collection objects under ignored `outputs/local/`.

Both collectors process every research-paper entry on their configured official listing, without a paper or candidate cap. USENIX collection attempts every listed paper detail page. UI pagination controls presentation rather than truncating the collection. Browser and Worker resource limits can still affect unusually large requests; failed editions and metadata gaps remain visible.

The dashboard supports source-linked profiles and papers, filters, sortable results, charts, shortlisting, academic evidence entry, and CSV export. Research alignment uses supplied keyword phrases found in publication text. It is an explainable research match, not an assessment of job performance or an automated hiring decision.

## Included source coverage

| Venue | 2024 | 2025 | 2026 | Evidence |
| --- | ---: | ---: | ---: | --- |
| OSDI | 53 | 53 | 136 | Official USENIX technical sessions and paper citation metadata |
| NSDI | 112 | 83 | 150 | Official USENIX technical sessions and paper citation metadata |
| SIGCOMM | 62 | 88 | 109 | Official accepted lists, including full and short papers |
| CoNEXT | 40 | 50 | 60 | Official accepted lists; official program for 2025 |
| IMC | 55 | 72 | 77 | Official accepted-paper lists |

Coverage has two material qualifications:

- [SIGCOMM 2026](https://conferences.sigcomm.org/sigcomm/2026/accepted/) states **110 accepted papers** in its introductory prose, but its published table contains **109 paper rows**. All 109 rows are retained, the expected count remains 110, and the discrepancy is reported. The snapshot does not claim an exhaustive 110-paper census.
- The [NSDI 2025 Kalia paper](https://www.usenix.org/conference/nsdi25/presentation/kalia) has no usable citation-title/author metadata. Its official listing record is retained and marked `publisher_listing_missing_citation`. Across USENIX, 586 paper details have citation metadata and one retained paper has this explicit gap.

CoNEXT 2025's accepted-list endpoint was unavailable during collection. Its accessible [official program](https://conferences2.sigcomm.org/co-next/2025/partials/program.html?updated=191214) supplies all 50 program paper entries, including actual ACM DOI and PDF links. Coverage identifies that source as an official program. IMC accepted lists provide names without institutions; those affiliations remain unknown.

## Academic facts and estimates

Publisher affiliations describe the publication year. They do not establish a person's current affiliation, enrollment, employment status, availability, or degree. The snapshot leaves current status and graduation unknown. Names without corroborating affiliation evidence are not treated as confirmed cross-paper identities.

A graduation estimate requires separately entered academic evidence, such as a source-stated expected graduation year or a confirmed degree and enrollment start year. Duration assumptions and resulting ranges are visible and editable. No precise month is invented. Estimates require recruiter review before targeted sourcing.

## Academic profile agents

Profile research searches university pages, lab directories, personal academic sites, CVs, and public professional pages. LinkedIn is optional. Identity must be connected to an actual publication beyond a matching name. A source-backed proposal records each field's citations, source date, and confidence. Ambiguous identities stay unresolved. Recruiters accept supported fields individually; manually entered evidence retains priority.

The included pilot contains real research for the first four canonical author IDs, selected without demographic criteria. Three profiles matched and one remains unresolved. Two authors explicitly state expected graduation in 2027. These findings start as **unreviewed proposals** and do not silently change candidate filters or graduation counts.

Live agent calls use the OpenAI Responses API with web search and a strict academic schema. The unified mapping run has no author-count cap and processes independent tasks in bounded batches. The advanced, browser-local profile-research control also remains available for up to 25 selected authors at a time. API requests resolve authors against official proceedings, accept no arbitrary research prompt, and never return runtime secrets. Consulted search results and completed opened-page/find actions establish citation provenance.

Runtime configuration uses `OPENAI_API_KEY`, `OPENAI_RESEARCH_MODEL`, and optional `OPENAI_SOURCE_MODEL`. Existing keys can be supplied through an ignored local `.env` and configured as production secrets; the OpenAI Developers setup workflow is available when a new key is needed. Never place a key in browser fields, source control, or the hosting manifest. Missing configuration produces a saved “Connection required” checkpoint with collected paper and author data still available.

No ethnicity or nationality classifier, name-based protected-trait inference, or demographic hiring filter is implemented. Profile research is limited to public academic facts; research alignment remains based on job-related publications.

Unified mapping runs persist on the private Site. The advanced dashboard workspace still stores local selections and manually reviewed evidence in browser IndexedDB/localStorage. Run workbooks reflect the selected saved run; CSV export remains available for the advanced workspace. The app is not an ATS.

## Refresh source snapshots

Collection makes public requests to publisher sites. Publishers may change HTML, remove metadata, or temporarily rate-limit requests. Scripts cache public HTML and retain per-edition provenance; unavailable sources produce warnings rather than substitute records.

```sh
npm run collect:usenix -- --conferences=osdi,nsdi --years=2024,2025,2026 --output=data/usenix.json
npm run collect:networking -- --conferences=sigcomm,conext,imc --years=2024,2025,2026 --output=data/networking.json
npm run verify:sources
```

Both collectors accept `--conferences`, `--years`, `--output`, `--cache` for the public-HTML cache directory, and optional `--listing-cache` for previously downloaded official listings. The USENIX script checks individual paper details automatically. Networking uses configured accepted-list/program pages. Neither accepts an arbitrary publisher URL. Rebuild after updating a snapshot to include it in the deployed Worker.

Rebuild validated registry seeds with `node scripts/seed-source-plans.mjs`. The builder validates every selected official edition and retains existing immutable versions. Generate schema changes with `npm run db:generate`; inspect and commit the resulting SQL and Drizzle metadata. Publishing applies hosted migrations before the Worker update. Never edit a migration after it has been applied.

## Architecture

- `shared/catalog.js`: one curated domain/venue catalog shared by browser and Worker, with connector status, official source mappings, and lifecycle notes.
- `worker/usenix.mjs`: official technical-session and ordered citation-metadata parser; evidence stays attached to authors and papers.
- `worker/networking.mjs`: official SIGCOMM, CoNEXT, and IMC adapters, conservative affiliation parsing, configured program fallback, and coverage.
- `worker/api.mjs`: collection/bootstrap endpoints, source coverage, canonical author resolution, and gated academic research routes.
- `worker/profile-research.mjs`: web-search agent, strict academic schema, citation validation, identity checks, and source freshness handling.
- `worker/source-discovery.mjs`: gated source-discovery agent and restricted declarative HTML extraction.
- `worker/source-plans.mjs`: durable version/check registry, authority and semantic validation, active pointers, and protected collection cache.
- `worker/source-plan-api.mjs`: source discovery, validation, activation, and per-edition collection routes.
- `worker/mapping-plan.mjs`: technical-direction routing, curated conference recommendations, year scopes, and supported professional criteria.
- `worker/mapping-runs.mjs`: persistent task orchestration, independent author agents, leases, retry handling, graduation planning, and aggregation.
- `worker/mapping-api.mjs`: plan/create/list/inspect/advance/pause/resume/retry endpoints.
- `worker/index.js`: Worker asset routing and response security headers.
- `data/usenix.json`, `data/networking.json`: publisher snapshots with counts, retrieval timestamps, methodology, and gaps.
- `data/academic-research.json`: four real, cited, unreviewed academic-profile research proposals.
- `data/source-plans.json`: 29 immutable source-plan seeds with actual publisher fingerprints and validation evidence.
- `ui/`: application markup, styling, interactions, and browser persistence.
- `ui/profile-research.js`: serial research queue, proposal inspection, and field-level review controls.
- `ui/source-plans.js`: shared source-plan registry, validation details, version history, and cache freshness controls.
- `ui/mapping-run.js`: the primary end-to-end workflow, progress, saved runs, outcome filters, source-linked profiles, and result handoff.
- `ui/mapping-export.js`: dependency-free Office Open XML workbook generation and browser download.
- `db/schema.ts`, `drizzle/`: D1 schema and generated migrations.
- `scripts/collect-*.mjs`: repeatable official-source collection.
- `scripts/verify-sources.mjs`: offline provenance, identity, count, and metadata-gap verification.
- `scripts/build.mjs`: embeds UI assets, catalog, parsers, API, and snapshots in `dist/server/index.js`.
- `tests/`: parser fixtures, source handling, API behavior, and Worker checks.
- `.openai/hosting.json`: private Site identity and deployment configuration.
