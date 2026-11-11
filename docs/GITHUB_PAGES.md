# GitHub Pages publication

Repository: https://github.com/GabbyXia/Candidate-Agent

Site: https://gabbyxia.github.io/Candidate-Agent/

GitHub Pages publishes the static snapshot on the normal `github.io` domain.

## What the site contains

The static site publishes the checked-in official paper snapshots, provisional
author profiles, original source coverage, and dated academic research proposals.
The Downloads screen includes the complete JSON snapshot, Excel workbook, academic
research pilot, and validated source plans. Proposals retain their original source
dates and review state; rebuilding does not imply fresh research.

The directory opens with all collected author records. The publication separately
reports how many records have academic profile research; missing profile evidence
does not remove an author from the directory. Optional filters narrow the display.

The interface and default Excel export use the first enrollment year of the
current degree program. Cited proposal dates remain labeled unreviewed; missing
or unsupported dates remain Unknown. Historical graduation fields can remain in
the archived source JSON, but do not populate the start-year view. This public
snapshot is separate from local research runs. Only explicitly selected academic
fact exports are imported; raw run state is never copied automatically.

Visitors can search, filter, browse publication evidence, review proposals, keep
browser-local shortlists/evidence, and download exports. Local edits do not update
the published snapshot. Browser storage from the previous host does not transfer
automatically. The static site cannot start live collection, model calls, or saved
server runs.

## Automatic publication

`.github/workflows/pages.yml` runs on pushes to `main` and manual workflow dispatch.
It verifies the saved source records, builds with Node 22, checks the static build,
and deploys the generated `dist-pages/` through GitHub Pages. No API key, npm package
installation, server, or model connection is required to build the static version.

The builder adds content versions to scripts, styles, snapshot requests, and
downloads so browsers load matching files after publication.

The repository's Settings → Pages → Source must be **GitHub Actions**. The source
repository can remain private with an eligible GitHub plan; the Pages publication
is accessible to visitors at its site URL.

## Publish updated research

1. Run collection or research in the full local/server application.
2. Update the intended checked-in source snapshots in `data/`. Keep citation dates,
   uncertainty, and review status attached to the results.
3. For a selected additional downloadable research artifact, follow
   [`data/published/README.md`](../data/published/README.md).

   To publish a saved academic checkpoint, first generate a professional-field
   projection:

   ```sh
   node scripts/export-academic-publication.mjs --input local-runs/network-continuation/run/cohorts/network.json --output data/published/network-academic-profiles.json
   ```

   A manifest entry with `"kind": "academic_profiles"` links those results to
   existing author IDs and publication anchors. The same projection is used for
   the downloadable JSON. Notes, raw errors, model diagnostics, screening
   decisions, demographic checks and completion forecasts are excluded. Partial
   lookup coverage and unsupported facts stay explicit. The original four-profile
   pilot remains a separate archival download.
4. Verify and build:

   ```sh
   npm run verify:sources
   npm run build:pages
   node --test tests/pages-build.test.mjs tests/static-ui.test.mjs
   ```

5. Commit the intended source/data/artifact changes and push to `main`. Watch
   **Actions → Publish research snapshot** for the deployment status.

The builder reads only checked-in source data and explicitly selected publication
files. It does not automatically publish files from a live database, local run,
browser cache, or the private hosted application's saved runs.

## Keep local files out of Git

`.gitignore` excludes `.env` secrets, `node_modules/`, `dist/`, `dist-pages/`,
`outputs/`, `local-runs/`, `run-results/`, `research-results/`, `exports/`,
`artifacts/`, caches, SQLite/database state, logs, temporary files, and machine
credential/tool directories. Keep a sanitized `.env.example` in source control.

Place raw run/checkpoint files in `outputs/` or `local-runs/`. Only move a selected
export to `data/published/` when it is meant for site visitors. Do not put secrets
or local working directories in that publication directory.

## Local preview

```sh
npm run build:pages
python3 -m http.server 4174 --directory dist-pages
```

Open http://localhost:4174. Assets and snapshot requests use relative URLs so the
same build also works at the GitHub project subpath `/Candidate-Agent/`.
