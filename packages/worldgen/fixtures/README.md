# Test fixtures

`back-bay-mini.osm.json` is a raw Overpass response for a roughly 180 m × 200 m patch of Back Bay, Boston
(bbox `42.3496,-71.0805,42.3512,-71.078`, around Commonwealth Ave Mall at Dartmouth St), saved with:

```sh
pnpm fetch-area --bbox 42.3496,-71.0805,42.3512,-71.078 --out packages/worldgen/fixtures/back-bay-mini.osm.json
```

Data © OpenStreetMap contributors, licensed under the [ODbL](https://opendatacommons.org/licenses/odbl/).

Don't refresh it casually: the golden hash in `test/generate.test.ts` is computed from this exact file.
