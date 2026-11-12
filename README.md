# Talent Atlas

A research sourcing dashboard built from official conference proceedings. **GitHub Pages is the only deployment target.** The [published dashboard](https://gabbyxia.github.io/Candidate-Agent/) is a static snapshot: visitors can browse papers and provisional author profiles, filter results, review cited proposals, keep browser-local shortlists and evidence, and download JSON or Excel files.

New collection, model research, and saved mapping runs are optional **local tools**. They run on your computer and are not available on the published website. Publishing a refresh requires selecting the intended data and pushing it to the Pages repository.

## Preview and verify

Use Node 22.13 or newer and run commands from this directory, which contains `package.json`.

```sh
npm run build
npm run dev
```

`build` creates `dist-pages/`; `dev` previews the static dashboard at `http://localhost:4173`. Building and browsing the snapshot require no API key or model calls.

```sh
npm run verify:sources
npm run validate
```

`verify:sources` checks the saved provenance, counts, identity grouping, and metadata gaps without contacting publishers. `validate` runs the Pages build and static UI checks. See [GitHub Pages publication](docs/GITHUB_PAGES.md) for updates and [the onboarding guide](docs/ONBOARDING.md) for evidence rules and optional local research.

## Included research and its limits

The checked-in 2024–2026 snapshot contains **1,200 real papers and 8,869 author occurrences across 15 conference editions**, yielding 6,847 provisional author profiles. A byline occurrence is not a verified person. Publication affiliations do not establish current enrollment, employment, degree, availability, or graduation.

| Venue | 2024 | 2025 | 2026 |
| --- | ---: | ---: | ---: |
| OSDI | 53 | 53 | 136 |
| NSDI | 112 | 83 | 150 |
| SIGCOMM | 62 | 88 | 109 |
| CoNEXT | 40 | 50 | 60 |
| IMC | 55 | 72 | 77 |

SIGCOMM 2026 declares 110 accepted papers but its published table contains 109 rows; the discrepancy remains recorded. One NSDI 2025 paper lacks usable citation-title/author metadata and is retained with an explicit gap. CoNEXT 2025 uses its official program as a documented fallback. IMC affiliations remain unknown when the publisher supplies names only.

Research lookups are complete for all **6,847 provisional author groups**. The selected publication retains 6,663 academic research proposals, including **2,439 cited academic statuses, 521 current degree programs, and 211 current program start years**. A completed lookup does not guarantee a resolved identity or supported facts. The original four-profile pilot remains a separate archival download. Counts and coverage are recorded in [`data/published/research-stage-counts.json`](data/published/research-stage-counts.json).

The directory shows every collected author by default, including faculty, unresearched records, and unknown academic status. The date view uses the first enrollment year of the person's **current degree program**. It requires cited current student status, a compatible degree, and an explicit start statement; historical credentials and paper dates do not establish it. Missing dates stay Unknown, while cited professional roles without an established current student program are labeled separately. Proposals remain unreviewed, and rebuilding does not refresh their evidence dates.

The downloadable workbook includes Summary, Candidates, Matches, NeedsReview, Papers, Sources, and Coverage sheets. It retains all records, current-program start years, source citations, and review states. The default date view and workbook do not substitute graduation estimates for enrollment dates. Exported text cannot execute as an Excel formula. Browser-local edits do not change the published files; export your work to retain or share it. No demographic classifier or protected-trait hiring filter is implemented. Publication research fit is an explainable sourcing signal, not an assessment of job performance.

## Publish updates

The repository [GabbyXia/Candidate-Agent](https://github.com/GabbyXia/Candidate-Agent) uses `.github/workflows/pages.yml` to verify, build, test, and deploy `dist-pages/` on pushes to `main`. Generated output is not committed. Only checked-in source snapshots and artifacts explicitly selected in `data/published/manifest.json` enter the public output. Local databases, run results, caches, and credentials are excluded.

See [publication instructions](docs/GITHUB_PAGES.md) before updating research data or adding a download.

## Optional local collection and research

Start the local research server separately when maintaining data or running new academic research:

```sh
npm ci
npm run dev:local
```

The local server loads the ignored app `.env`, applies checked-in migrations to SQLite, and stores database/object data under ignored `outputs/local/`. Configure `OPENAI_API_KEY`, `OPENAI_RESEARCH_MODEL`, and optional `OPENAI_SOURCE_MODEL` in `.env` for live model research. Model calls use the configured OpenAI account and can incur charges. Keep keys out of browser fields and source control.

The local mapping workflow recommends conferences, collects official papers, creates provisional author records, runs independent cited academic research tasks, and exports results. Progress advances in bounded requests while the run page is open. Closing the page preserves local saved progress but does not provide unattended processing. Uncertain interrupted model calls require explicit retry. Completed research remains available when failed editions are retried.

The catalog covers 18 subdomains and 54 venues; eight adapters are implemented: OSDI, NSDI, FAST, historical USENIX ATC, USENIX Security, SIGCOMM, CoNEXT, and IMC. Other venues are marked as planned connectors. Twenty-nine validated source-plan seeds retain official authority, edition, adapter, validation evidence, and content fingerprints. Source discovery proposes declarative plans; validation checks authority, track, shape, counts, duplicates, and pagination before activation. Unsupported formats return `adapter_required`. Failed refreshes retain the last successful records and their original retrieval date.

Refresh the bundled source snapshots explicitly:

```sh
npm run collect:usenix -- --conferences=osdi,nsdi --years=2024,2025,2026 --output=data/usenix.json
npm run collect:networking -- --conferences=sigcomm,conext,imc --years=2024,2025,2026 --output=data/networking.json
npm run verify:sources
```

These collectors contact configured official publisher sources and preserve coverage gaps rather than inventing substitute records. Review changed data before rebuilding and publishing. `node scripts/seed-source-plans.mjs` rebuilds seeds from saved official HTML. For local schema changes, use `npm run db:generate` and review the migrations; migrations are not part of Pages deployment.

For local Worker tooling and the complete test suite:

```sh
npm run build:worker
npm test
npm run validate:worker
```

These commands build and check a local artifact only.

## Project folders

| Path | Purpose |
| --- | --- |
| `ui/` | Dashboard, static snapshot mode, browser persistence, evidence review, and workbook export |
| `shared/` | Curated domain/venue catalog and cited current-program evidence rules shared by the browser and data tooling |
| `data/` | Official paper snapshots, selected academic research and counts, original pilot proposals, and source-plan seeds |
| `worker/` | Shared parsing/normalization plus optional local research, source registry, and saved-run APIs |
| `scripts/` | Pages build and preview, optional local server, collectors, verification, and local Worker tooling |
| `db/`, `drizzle/` | Local research database schema and versioned migrations |
| `tests/` | Static publication, parser, evidence, local API, UI, and export checks |
| `docs/` | Publication instructions and detailed onboarding |
| `.github/workflows/` | GitHub Pages build and deployment |
| `dist-pages/` | Generated static website; ignored by Git |
