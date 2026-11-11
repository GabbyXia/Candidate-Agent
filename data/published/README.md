# Selected publication artifacts

The Pages build already generates downloads for the complete paper/author snapshot,
academic research pilot, source plans, and Excel workbook from the checked-in data.

To publish an additional completed research artifact, copy only that reviewed export
into this directory and add `manifest.json`:

```json
{
  "artifacts": [
    {
      "file": "networking-research.xlsx",
      "title": "Networking research workbook",
      "description": "Research scope and original collection date."
    }
  ]
}
```

Use explicit selected exports rather than raw working directories. Saved local runs,
SQLite state, caches, credentials, and temporary exports belong in ignored `outputs/`,
`local-runs/`, `run-results/`, or `exports/`. Published files become downloadable by
site visitors. Push the selected artifacts and source snapshots to `main` to rebuild
the site; the build does not start research or make model calls.
