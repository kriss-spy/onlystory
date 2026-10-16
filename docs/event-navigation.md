# Event and story navigation

The library opens a game's event list. Selecting an event opens its stories at
`/games/:game/events/:event`; each story retains its existing reader URL and
saved passage IDs. Main-story volumes and other named collections use the same
navigation level as events.

`collectionId` identifies event membership. The existing `story` label supplies
the event title. An imported story without explicit placement belongs to the
main route. Its `order` is the source order within that route.

A side story supplies explicit placement metadata, for example:

```json
{
  "collectionId": "an-event",
  "placement": {
    "kind": "side",
    "branch": "memories",
    "title": "Memories",
    "after": "a-main-story-id"
  }
}
```

Stories in the same branch and with the same anchor form their own ordered
sequence. They appear indented after the anchor, while the main route's line
continues past them. Next-story navigation and fast-forward follow either the
main route or the current branch. A side branch ends without forcing a
transition into the main route. The reader's return link leads back to the
event or the page from which the story was opened.

Omitting `after` places a branch under “Outside the main timeline.” An anchor
that is not present in the import also leaves the branch there, keeping its
stories accessible without guessing their chronology. Search retains the main
anchor when a side story matches. The reader's chapter panel uses the same
ordering and indentation.

Large events stay on this same page. Optional `chapter: { id, title, order }`
metadata groups their stories into collapsible sections, such as 上篇, 中篇 and
下篇 for 伊利昂之围. Side branches remain inside their chapter. The initial open
section contains the most recently saved story, or the first chapter for a new
reader. Explicit fold choices persist locally across reloads. Search expands
matching sections without replacing those choices. Main-route continuation
crosses chapter boundaries; it never enters an optional branch automatically.

The current 金翅雀与橄榄枝 export supplies 24 catalog entries in source order,
without confirmed side-story placement metadata. All 24 remain on the source
route. No side-story classification was inferred from titles or numeric IDs.
Fictional design checks exercise anchored sequences and independent branches;
they remain outside the normal imported library.

Event and story links support direct entry, reload and new tabs. Returning from
reading restores event scroll position and the game catalog's search context.
Large event lists and story lists are virtualized above 80 entries. Small lists
remain ordinary semantic lists with selectable, searchable text. Layouts use
the existing light/dark tokens and compact download controls.
