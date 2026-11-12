# Talent Atlas onboarding guide

Talent Atlas deploys only to GitHub Pages. The published website is a static research snapshot for browsing, evidence review, browser-local shortlists, and downloads. Start with the published dashboard or run `npm run build` and `npm run dev` to preview it locally. Publishing updated data refreshes the snapshot; browser-local reviews do not change it.

This guide also explains the optional local research tools used to prepare new data. Sections 1–4 and 8 describe `npm run dev:local`; sections 5–7 distinguish the published snapshot from local saved runs. The local tools turn a technical hiring direction into a source-linked map of research authors. They are for maintainers operating the local server on their own computer.

The workflow starts with official conference papers, creates provisional author records, researches public academic evidence, and groups those records against selected professional criteria. Its output is a research starting point for human review. A matching result can contain unreviewed findings, and a completed run can still have incomplete source coverage.

Read section 5 for evidence interpretation, section 9 for bundled coverage, and sections 10–12 for engineering onboarding. See [GitHub Pages publication](GITHUB_PAGES.md) to publish a selected update. The local workflow is described below for maintainers who need to prepare new research.

## 1 Optional local research at a glance

```text
Technical direction and professional criteria
                    |
                    v
Curated domain catalog -> Conference and year plan
                    |
                    v
Validated source plans -> Official publisher listings -> Paper records
                    |
                    v
Paper deduplication -> Provisional author records -> Publication research fit
                    |
                    v
Independent academic research task for each author
                    |
                    v
Identity and citation validation -> Evidence screening
                    |
                    v
Saved run results -> Human review -> Excel export or dashboard handoff
```

When started with `npm run dev:local`, the browser presents the research workflow and asks the local server to advance it. The retained Worker modules validate requests, collect sources, call the research model, and save progress. The local server uses SQLite for structured records and local files for larger collections, research outputs, and checkpoints, all under ignored `outputs/local/`. A checkpoint is a saved result the local run can resume from. None of this server state is deployed to GitHub Pages.

Two model-assisted jobs sit inside this workflow. The **source-discovery agent** proposes how to read a missing or changed official conference source. The **academic-profile agent** researches one author at a time. Conference recommendation, known-source parsing, provisional identity grouping, research-fit calculation, and outcome categorization run in ordinary application code.

## 2 Your first local mapping run

Start `npm run dev:local` before following this workflow. Use a deliberately small conference/year scope for your first live run. Starting or resuming research can make paid API calls, and the unified run creates a task for every retained author.

1. **Describe the direction.** For example, enter “Datacenter networking and congestion control,” with research phrases `congestion control, RDMA`. The role label gives the run context; the research phrases drive publication matching.
2. **Choose Recommend conferences.** For this example, the catalog recommends SIGCOMM, NSDI, CoNEXT, and IMC. Read the reasons and edit the selection. A recommendation does not guarantee that a source connector is available for every edition.
3. **Set the publication window and criteria.** Choose one to three publication years, academic statuses, and a minimum research-fit percentage. The current-program start-year range is optional and starts blank. Publication years determine which papers to collect; they do not establish enrollment dates. The form defaults to the current year and previous two publication years, with no graduation target.
4. **Start the mapping.** The app saves the run and begins bounded collection and profile-research tasks. Keep the run page open for continued advancement. Watch source notes and progress as results arrive.
5. **Inspect the results.** Start with coverage, then review both “Matches professional criteria” and “Needs evidence review.” Select an author to inspect the identity rationale, academic facts, original source dates, and publication anchors. The saved-run profile is read-only.
6. **Download Excel.** The workbook includes the full saved result, including authors hidden by the current search, outcome filter, or page. “View talent dashboard” opens the result in the advanced browser workspace for further work.

Opening a saved run lets you inspect it without restarting processing. Use Resume to continue it. Closing the page preserves saved progress but does not provide unattended background execution.

## 3 What happens at each stage

### Planning the scope

The planner matches the direction and research phrases against a maintained catalog of CS domains and aliases. It returns relevant venues with reasons. If the direction has no reliable match, choose a domain explicitly. You can select up to eight conferences and a window of up to three years ending no later than the current year. Known biennial venues skip years without an edition.

The result is a finite list of **editions**. An edition means one conference, one year, and the main research track. The catalog is shared by the UI and server so they use the same venue identifiers and connector status.

### Collecting official papers

Starting a run saves its input, plan, initial checkpoint, and a collection task for each edition. Each task resolves an active source plan and parses its official listing. A source plan describes where the records come from and which reviewed parser can read them; section 4 explains its lifecycle.

The collectors preserve paper titles, author bylines, publication years, publisher URLs, available affiliations, and source provenance. Coverage records track parsed counts, publisher-declared counts when available, retrieval dates, metadata gaps, and failures. Missing records are reported rather than filled with generated papers or people.

Runtime listing refreshes may reuse previously verified citation metadata when the paper ID, URL, title, and byline match. They do not individually fetch every USENIX paper detail page. The separate `collect:usenix` snapshot-building script attempts detail-page collection.

### Building provisional author records

The normalization layer deduplicates paper records and groups author occurrences by exact normalized name plus published affiliation. An occurrence without affiliation remains separate across papers. This is conservative grouping, not a verified global people database: a person who changes affiliation can have multiple records, and namesakes with the same affiliation can still be grouped.

Published affiliation describes the paper year. It does not establish current employment, enrollment, degree, availability, or expected graduation. Anonymous or unknown bylines remain on their papers and in coverage accounting without becoming named research profiles.

The same layer calculates research fit from publication text. It does not use a model to assess hiring suitability. See section 5 for the formula.

### Researching each author

The orchestrator prepares one independent research task for each provisional author. Task creation happens in chunks of 25 for bounded processing; that is not a 25-author limit on the unified run. Eligible recent bundled research proposals can be reused.

Each live task sends the author's canonical ID, name, published affiliation, and up to five paper anchors to the academic-profile agent. An anchor is a known paper used to connect the person to the research record. The model uses the Responses API with web search and a strict structured schema to propose six fields:

- Current academic affiliation
- Academic status
- Research interests
- Degree program
- Program start year
- Explicitly stated expected graduation year

The agent searches public institutional profiles, lab pages, personal academic sites, CVs, and public professional pages. LinkedIn is optional. Tasks are bounded by a 90-second request deadline and a maximum of four web-tool calls. They research public information; they do not contact authors.

### Validating and aggregating findings

The server validates the response shape, identity anchors, cited sources, evidence dates, and allowed field values. A matching name is insufficient: a non-publisher academic or profile source must connect a supplied publication to the person. Cited URLs must appear in the provider's reported source consultations or citations. The checks establish a traceable proposal; a reviewer still needs to assess what the sources actually support.

Ambiguous or unresolved identities retain unknown academic facts. Supported proposals feed the run's screening logic and remain marked as requiring human review. Individual task outputs and periodic consolidated checkpoints are saved so an interrupted run can continue without discarding completed work.

## 4 Why source plans exist

Conference websites change structure, move publishers, and sometimes publish incomplete lists. Source plans give each edition a versioned, inspectable extraction recipe instead of relying on an ad hoc scraper chosen during every run.

A plan records the conference/year/main-track scope, official authority and entry URL, deterministic adapter, and restricted selectors where needed. An **adapter** is reviewed parser code for a supported publisher format. The supported adapter families include USENIX, networking conference listings, and restricted single-page HTML extraction.

The lifecycle is:

1. **Resolve an existing plan.** Known validated sources use deterministic collection without a model call.
2. **Discover or repair when needed.** A missing plan or semantic parser drift can invoke the source agent. It proposes declarative settings; its output is never executed as scraper code.
3. **Validate the proposal.** Code checks official authority, edition, accepted-paper track, record structure, pagination, duplicates, samples, and counts. Validation binds the report to the plan digest, adapter version, and source-content fingerprint.
4. **Activate a passing version.** Manual Discover/repair saves a candidate for inspection. Review its validation report, use Validate source to rerun the check when needed, and activate the validated plan explicitly. The mapping run and per-edition collection path can automatically activate a repair after deterministic validation passes. Activation checks that the previously active version has not changed in the meantime.
5. **Protect the last successful collection.** Failed or degraded refreshes retain prior successful records and their retrieval date. The latest attempt is recorded separately, so an attempted refresh does not make old data look newly retrieved.

Routine content changes and count uncertainty alone do not trigger a model call. Unsupported pagination or API formats return `adapter_required`; an engineer must implement an appropriate adapter. A valid plan also does not prove a complete accepted-paper census. When the publisher supplies no expected count, completeness can remain uncertain.

Use **Source plans** to inspect active versions, validation reports, source freshness, and repair candidates.

## 5 How to interpret evidence and outcomes

### Research fit

Research fit is the percentage of distinct supplied research phrases found as whole phrases in an author's collected paper titles or session labels:

```text
research fit = matched supplied phrases / total supplied phrases × 100
```

If you supply two phrases and one appears, the fit is 50 percent. The calculation does not read full PDFs, establish current expertise, or predict job performance. Different wording and missing session metadata can reduce the score. Review the phrases and supporting papers before using a threshold.

### Academic facts and dates

Each proposed field carries its value, source references, evidence date when stated, confidence, and basis. The research retrieval date tells you when the task ran; it is separate from the date of the evidence.

Current affiliation and status supported only by dated evidence older than two years become unknown. Undated sources keep currentness unverified and cap confidence at medium for those fields. Missing evidence stays unknown. A successful model task can therefore finish without resolving the author's identity or current program start year.

### Current degree program and start year

The dashboard and default workbook use the first enrollment year of the person's ongoing current degree program. All author records remain visible by default; a cited start year is an optional filter, not a condition for inclusion. The shared evidence rules require the following:

| Evidence | Display behavior |
| --- | --- |
| Matched author identity, cited current student status, compatible current degree, and explicit start statement | Show the cited current-program start year with its review state |
| Current program established but no supported start statement | Keep the start year Unknown |
| Cited professional role without an established current student program | Show “No current student program established” |
| Unresolved identity or insufficient current-program evidence | Keep current-program facts Unknown |

Historical degrees, range-end years, employment dates, awards, and paper dates cannot supply a current enrollment date. A start year may be recovered only from an explicit, unique current-program statement already present in cited evidence. Displaying or filtering a proposal does not accept it as a reviewed fact. Manually entered and accepted evidence retain their review context and priority.

The local research schema and older saved runs can retain explicitly stated expected graduation years and low-confidence duration-based planning ranges. Those historical fields do not populate the current-program start-year view or default workbook, and graduation estimates do not establish enrollment dates.

### Screening categories

| Run label | Meaning |
| --- | --- |
| Matches professional criteria | Identity is matched and available source-stated findings satisfy the selected criteria; human review is still required |
| Needs evidence review | Identity or requested evidence is unknown or ambiguous |
| Outside current criteria | At least one selected criterion definitely fails, such as research fit below the threshold |

A definite mismatch takes precedence over missing information. All author records remain in the saved result. Unknown inclusion settings and UI filters control visibility, not data retention.

“Matches” does not mean recruiter-approved. The saved run can screen unreviewed source-stated proposals. The run's Completed state describes processing, not evidence approval or complete publisher coverage. No demographic inference or protected-trait hiring filter is implemented.

## 6 Saved runs and the advanced dashboard

The published dashboard stores reviews and shortlists in the current browser. Optional local research adds saved runs and a source registry with different persistence rules:

| Area | What it stores | Where it lives |
| --- | --- | --- |
| Saved mapping run | Input, selected editions, task progress, paper records, research proposals, screening, checkpoints | Local SQLite and object files under `outputs/local/` |
| Source registry | Plan versions, checks, active pointers, collection references and attempt history | Local SQLite and object files under `outputs/local/` |
| Advanced dashboard | Local selections, shortlists, manually entered evidence, accepted profile fields, workspace preferences | Browser IndexedDB and localStorage |

In the advanced dashboard, reviewers can inspect proposals and accept supported academic fields individually. Accepted fields are stored as reviewed `academicProfile` data; manually entered evidence retains priority. With the optional local research server running, the separate advanced profile-research queue supports up to 25 selected authors per batch and runs serially while its page is open. The published website cannot start these research tasks.

The saved mapping-run profile is read-only. Accepting a field in the advanced dashboard does not update the server-saved run or its Excel workbook. The workbook export reloads the selected saved run. Browser-local review data is also not automatically shared with a teammate or another browser.

Talent Atlas supports research and handoff; it is not an applicant tracking system.

## 7 What the Excel workbook contains

In the optional local research workflow, Download Excel creates a real `.xlsx` workbook in the browser from the selected saved run. The published snapshot also offers a prebuilt workbook for its checked-in dataset. It retains all candidate and paper records regardless of the current visible page or filters.

The default workbook includes current degree programs, source-stated current program start years, citations, confidence, and review state. It leaves unsupported dates unknown and does not substitute expected graduation years or estimated graduation ranges for enrollment dates. The published workbook covers all 6,847 author groups and 1,200 papers.

| Sheet | What to use it for |
| --- | --- |
| Summary | Run identity, scope, criteria, counts, progress, assumptions, and limitations |
| Candidates | All provisional author records with evidence and screening fields |
| Matches | Authors currently categorized as matching the selected criteria |
| NeedsReview | Authors with unresolved or uncertain requested evidence |
| Papers | Full collected paper records, author bylines, source URLs, and metadata status |
| Sources | Academic citations, dates, and proposal or reviewed-field context where present |
| Coverage | Per-edition counts, completeness, metadata gaps, retrieval dates, and failures |

Authors outside the criteria remain in Candidates; there is no separate Outside sheet. Source URLs are literal text. The workbook generator writes no formulas, macros, or external workbook relationships. The advanced dashboard's CSV export is a separate output from its local workspace.

For handoff, include the run ID, criteria, source-coverage notes, and which proposals a reviewer has independently checked. Do not describe the Matches sheet as a confirmed shortlist.

## 8 Progress and recovery

The run page drives repeated advance requests. Each request processes a bounded amount of work; the backend accepts one to three tasks. Database leases prevent two requests from claiming the same work simultaneously. Leases expire after three minutes so interrupted work can be recovered.

| State or symptom | Meaning and next action |
| --- | --- |
| Queued or Running | Keep the run page open for advancement; partial results can already be inspected |
| Paused | Resume when ready; pause allows the in-flight request to finish. Provider rate limits can also pause processing |
| Connection required | Configure the server API key and research model, then resume. Existing collected data remains saved |
| Needs retry | A model request may have been processed or billed before interruption. Use explicit retry after reviewing the situation; ordinary resume does not repeat it |
| Failed source or failed run | Inspect the edition error, repair the source or configuration, then explicitly retry. A run can fail when no papers were collected |
| Adapter required | The source format needs reviewed parser support; ask an engineer to add the adapter |
| Completed with source notes | Processing finished; inspect Coverage for missing editions, count mismatches, and retained older collections |
| No progress after closing the tab | Reopen the saved run and resume; there is no assumed unattended task queue |

Transient publisher failures receive bounded retries with backoff. A source-agent attempt that may incur model usage is not treated as an ordinary publisher fetch to repeat indefinitely. Explicit retry can requeue uncertain profile calls and failed source editions while preserving completed author tasks. It does not rerun completed research merely because the author remained unresolved.

## 9 Current collection coverage

The bundled repository snapshot contains **1,200 papers and 8,869 author occurrences across 15 editions** of OSDI, NSDI, SIGCOMM, CoNEXT, and IMC from 2024–2026. Author occurrences are byline entries, not verified unique people. A run's actual counts depend on its selected scope and source results.

The catalog contains 18 CS subdomains and 54 venues. Eight venue connectors are implemented: OSDI, NSDI, FAST, historical USENIX ATC, USENIX Security, SIGCOMM, CoNEXT, and IMC. Other catalog venues are planned connections; recommendation alone does not mean their papers are available. The registry includes 29 validated seed plans. ATC 2026's publisher migration is handled through a validated declarative source plan.

The bundled data includes useful examples of honest coverage limits:

- SIGCOMM 2026 declares 110 papers while its published table has 109 parsed rows. The discrepancy remains visible.
- One NSDI 2025 listing record lacks usable citation-title/author metadata and is retained with an explicit metadata-gap status.
- CoNEXT 2025 uses its official program as a documented fallback source.
- IMC listings provide author names without institutions, so publication affiliations remain unknown.

Research lookups are complete for all 6,847 provisional author groups. The selected public snapshot retains 6,663 research proposals, with 3,799 matched identities, 2,439 cited academic statuses, 521 current degree programs, and 211 current program start years. A completed lookup can still leave an identity or field unknown; all authors remain in the directory. These are source-cited proposals requiring human review, not recruiter-approved facts. The full counts and their definitions are in [`data/published/research-stage-counts.json`](../data/published/research-stage-counts.json).

The original four-profile pilot remains a separate archival download. Eligible recent pilot proposals can be reused by the optional local research workflow; the selected full research publication is explicitly merged into the Pages build. Rebuilding preserves original citation and lookup dates rather than implying new research.

## 10 The codebase and what each piece is for

Paths below are relative to the application directory containing `package.json`. Server and saved-run components are used only by the optional local tools; shared parsers and normalization also prepare the static build.

| Component | Purpose |
| --- | --- |
| `shared/catalog.js` | Shared domains, venues, official mappings, connector status, and lifecycle notes |
| `shared/current-program.js` | Cited current-student program checks and recovery of explicit current-program start years |
| `worker/index.js` | Worker entry point, static assets, API routing, and response security headers |
| `worker/api.mjs` | Main API dispatcher, source bootstrap and collection, paper normalization, provisional authors, and lexical research fit |
| `worker/mapping-plan.mjs` | Deterministic direction matching, conference recommendations, year scope, and criteria validation |
| `worker/mapping-api.mjs` | Saved-run HTTP routes and integration of planner, collectors, and author research |
| `worker/mapping-runs.mjs` | Durable local task orchestration, leases, checkpoints, retry policy, and screening |
| `worker/published-academic.mjs` | Professional-field publication projection, author linking, and academic-fact coverage |
| `worker/usenix.mjs` | USENIX listing and citation-metadata parsing |
| `worker/networking.mjs` | SIGCOMM, CoNEXT, and IMC listing/program parsing and coverage |
| `worker/source-discovery.mjs` | Model-assisted official-source discovery and restricted declarative extraction |
| `worker/source-plans.mjs` | Versioned registry, deterministic validation, activation, and protected collection cache |
| `worker/source-plan-api.mjs` | Source discovery, validation, activation, per-edition collection, and automatic repair integration |
| `worker/profile-research.mjs` | One-author web research, strict academic schema, identity/citation checks, and evidence freshness handling |
| `ui/mapping-run.js` | Local request form, progress driver, saved runs, result search/filters, read-only profiles, and dashboard handoff |
| `ui/app.js` | Advanced dashboard, local workspace persistence, filters, shortlists, evidence, and CSV export |
| `ui/profile-research.js` | Advanced serial research queue and field-level review controls |
| `ui/source-plans.js` | Source registry, plan history, validation details, and freshness controls |
| `ui/mapping-export.js` | Dependency-free Office Open XML workbook creation and browser download |
| `ui/index.html` and CSS files | App shell, script loading, and visual presentation |
| `db/schema.ts` and `drizzle/` | Local SQLite tables and versioned SQL migrations |
| `data/` | Publisher snapshots, source-plan seeds, original pilot, selected academic publication, and research-stage counts |
| `scripts/` | Local development, collection, verification, seeding, build, and artifact validation |
| `tests/` | Parser fixtures, evidence checks, source lifecycle, orchestration, API, UI contracts, and export checks |
| `.github/workflows/pages.yml` | GitHub Pages verification, static build, tests, and deployment |
| `scripts/build-pages.mjs` and `ui/runtime.js` | Static snapshot generation and browser-side snapshot requests |

The UI and optional local research modules live together in this application directory. GitHub Pages deploys only the generated `dist-pages/` files; it does not deploy the local server or its database.

### Server storage tables

`source_plan_versions` holds immutable extraction versions. `source_plan_checks` holds validation reports. `source_plan_heads` identifies the active version for each edition. `source_collection_cache` points to the last successful local collection object and records the latest attempt separately.

`mapping_runs` holds input, plan, state, progress, revision, lease, and result-object reference. `mapping_tasks` holds edition/profile tasks, attempts, state, leases, and individual output references. Local object files hold the larger JSON objects those records reference.

## 11 Local setup and routine maintenance

Use Node 22.13 or newer and run commands from the directory containing `package.json`.

### Static dashboard preview

```sh
npm run build
npm run dev
```

`build` generates `dist-pages/`. `dev` previews the static dashboard at `http://localhost:4173`. The snapshot build makes no model calls and requires no API key. It preserves original source dates, citation evidence, uncertainty, and proposal review state.

Use these checks for a Pages update:

```sh
npm run verify:sources
npm run validate
```

`verify:sources` checks saved provenance, counts, identity grouping, and metadata gaps without fetching publishers. `validate` runs the Pages build and static UI checks. GitHub Actions publishes the generated output after intended source and data changes are pushed to `main`; see [the publication guide](GITHUB_PAGES.md).

### Optional local research server

```sh
npm ci
npm run dev:local
```

Stop the static preview before using the local research server on the same port. This separate server loads the ignored app `.env`, applies checked-in migrations to local SQLite, and stores database and object data under ignored `outputs/local/`. Its saved runs and source registry stay on your computer and are not automatically published.

For live profile research, configure `OPENAI_API_KEY` and `OPENAI_RESEARCH_MODEL` in `.env`. `OPENAI_SOURCE_MODEL` is optional and falls back to the research model for discovery. The model name is configuration; there is no hardcoded runtime default. Keep keys out of browser fields, source control, and public downloads. Model calls can incur API charges. Known source plans and offline snapshot verification do not require model calls. Missing model configuration is recorded as Connection required when a local task needs it.

For local Worker tooling and the full suite:

```sh
npm run build:worker
npm test
npm run validate:worker
```

`build:worker` creates `dist/server/index.js` for local checks. Build it before running the complete suite because Worker tests read that artifact. `validate:worker` checks its ESM export. These commands do not deploy a server.

### Refreshing research data

These explicit commands contact official publisher sites:

```sh
npm run collect:usenix -- --conferences=osdi,nsdi --years=2024,2025,2026 --output=data/usenix.json
npm run collect:networking -- --conferences=sigcomm,conext,imc --years=2024,2025,2026 --output=data/networking.json
```

Inspect coverage and warnings after a refresh, verify sources, and rebuild the static snapshot. `node scripts/seed-source-plans.mjs` rebuilds validated registry seeds from previously downloaded official HTML, using `/tmp` by default or a directory supplied with `--html-cache`. It makes no publisher or model calls and is a maintenance action, not a first-run requirement.

For local schema changes, update `db/schema.ts`, run `npm run db:generate`, and review generated SQL and metadata. Do not edit migrations already applied to a local database. GitHub Pages deployment does not use the research database or apply migrations. Only source snapshots and selected publication artifacts enter the public build; raw run data stays local until intentionally prepared for publication.

## 12 Where to start as a maintainer

| If you need to change | Start with | Relevant tests |
| --- | --- | --- |
| Direction matching or venue recommendations | `shared/catalog.js`, `worker/mapping-plan.mjs` | `mapping-plan.test.mjs` |
| Publisher parsing or a new supported format | Publisher adapter, source discovery and source plans | `usenix`, `networking`, `source-discovery`, `source-plans`, and source-plan API tests |
| Identity evidence, citations, or academic fields | `worker/profile-research.mjs` | `profile-research.test.mjs`, `academic-sources.test.mjs` |
| Run progression, recovery, or screening | `worker/mapping-runs.mjs`, `worker/mapping-api.mjs` | `mapping-runs.test.mjs`, `mapping-api.test.mjs` |
| Primary workflow or profile display | `ui/mapping-run.js` | `mapping-run-ui.test.mjs` |
| Advanced evidence review | `ui/app.js`, `ui/profile-research.js` | `ui.test.mjs`, `profile-ui.test.mjs` |
| Workbook contents or serialization | `ui/mapping-export.js` | `mapping-export.test.mjs` |
| Static publication and deployment | `scripts/build-pages.mjs`, `ui/runtime.js`, `.github/workflows/pages.yml` | `pages-build.test.mjs`, `static-ui.test.mjs`, and `npm run validate` |
| Optional local Worker artifact | `scripts/build.mjs`, Worker entry | `worker.test.mjs` and `npm run validate:worker` |

Keep the product's distinctions visible when making changes: collected versus complete, provisional versus verified identity, publication affiliation versus current affiliation, proposed versus reviewed facts, and source-stated dates versus duration estimates. Preserve unknown and nonmatching records so a reviewer can audit how the map was produced.

A new teammate is ready for independent use when they can explain one author's route from paper to profile, inspect the sources behind a proposed fact, identify a coverage gap, resume a saved run safely, and explain why a matching result still requires human review.

## Implementation references

For the implementation behind this guide, read the [project overview](../README.md), [planner](../worker/mapping-plan.mjs), [run service](../worker/mapping-runs.mjs), [collection and normalization API](../worker/api.mjs), [profile research](../worker/profile-research.mjs), [source-plan service](../worker/source-plans.mjs), [source-plan routes](../worker/source-plan-api.mjs), [mapping UI](../ui/mapping-run.js), [advanced profile review](../ui/profile-research.js), [workbook generator](../ui/mapping-export.js), and [database schema](../db/schema.ts).

Update this guide when workflow behavior, storage boundaries, criteria, adapters, or recovery semantics change. Snapshot counts describe the bundled data and should be updated with verified snapshot refreshes.
