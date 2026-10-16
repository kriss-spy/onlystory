# Library cover artwork

Game and event artwork is catalog metadata, separate from story scene backgrounds.
`src/cover-art.json` records each local URL, original dimensions, display position,
source image URL, source page and SHA-256. Images are stored unchanged under
`public/private/covers/`; rendering uses CSS cropping and reserved dimensions.
The application makes no external requests to load covers.

- GFL1 and GFL2 use their publisher's Steam store artwork.
- Project SEKAI uses its Japanese official website's share artwork.
- Blue Archive uses the Chinese game's 512-pixel App Store artwork, retrieved
  through Apple's lookup for app `6447541184`.
- 金翅雀与橄榄枝 uses the event announcement published by the official GFL2 account
  on TapTap. The portrait announcement is displayed from its top artwork area.
- 伊利昂之围 uses its version feedback announcement artwork from TapTap.

The source pages are linked in the JSON manifest. Matching uses game IDs and event
collection IDs, so chapter grouping and story order cannot change a cover's identity.
Collections without verified artwork retain their numbered fallback. Design fixtures
do not borrow real event artwork.
