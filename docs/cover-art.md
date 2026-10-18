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
- Blue Archive group-story collections use a representative original story
  background and the school identified by the official `GroupStory` emblem
  category. The same emblem association supplies the visible school badge.
- Blue Archive event collections use the original JP event lobby background
  with the official event title logo overlaid. `scripts/ba-catalog-art.py`
  resolves each event's banner and `MainBgImagePath` from the official season
  table, so events that reuse another event's lobby art keep that art. Every
  exported image's source texture and pack are recorded in
  `public/private/ba-jp/catalog/art.json`.
- 金翅雀与橄榄枝 uses the event announcement published by the official GFL2 account
  on TapTap. The portrait announcement is displayed from its top artwork area.
- 伊利昂之围 uses its version feedback announcement artwork from TapTap.

The source pages are linked in the JSON manifest. Matching uses game IDs and event
collection IDs, so chapter grouping and story order cannot change a cover's identity.
Collections without verified artwork retain their numbered fallback. Design fixtures
do not borrow real event artwork.
