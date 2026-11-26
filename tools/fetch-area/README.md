# tools/fetch-area

Saves the configured area (or any bbox) from Overpass to disk. See SPEC §6.2.

```sh
pnpm fetch-area                 # data/<areaId>.osm.json, skipped if cached
pnpm fetch-area --force         # re-download
pnpm fetch-area --bbox s,w,n,e --out path.json
```

Runs directly on Node (>= 22.18 / 23.6) via native TypeScript type stripping; no build step.
