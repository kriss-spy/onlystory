# Bundled catalog artwork

`src/cover-art.json` and `src/ba-catalog.json` retain the original artwork
metadata and source URLs. `src/catalog-assets.json` maps each catalog image to a
committed WebP file in `public/catalog-art/`, with original and bundled SHA-256
hashes, dimensions and byte lengths. The reader uses these small images for game
covers, event covers and logos, group logos, and school emblems.

The build copies this directory into `dist`. Both desktop packaging and the web
ZIP consume that output. The service worker precaches the artwork as part of
the app shell, so an unvisited collection still has its artwork offline. This
does not require a prepared `/private/` library or a network image host.

To refresh the bundle after importing new catalog artwork, install Pillow and
run the generator against the local libraries containing the verified original
images:

```sh
python scripts/bundle-catalog-art.py --library public --library .cache/pjsk/library
npx prettier --write src/catalog-assets.json
npm run check
```

The generator performs no downloads. It rejects missing originals and checksum
mismatches where the original catalog records a hash. It preserves transparency
and bounds catalog thumbnails to 960 × 640. Full-size originals remain in the
local story libraries. Commit the generated manifest and images together.
