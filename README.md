# Onlystory

Read stories from **Blue Archive, Project SEKAI, and Girls' Frontline 1 & 2** in one app, with original visuals, audio, choices, bookmarks, and offline reading.

## Download

[**Get the latest preview**](https://github.com/kriss-spy/onlystory/releases/tag/v0.2.0-pre.1)

| Platform    | Download                                                                                                                | Open                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Windows x64 | [Portable .exe](https://github.com/kriss-spy/onlystory/releases/download/v0.2.0-pre.1/Onlystory-0.2.0-portable-x64.exe) | Run it. No installation needed.          |
| Windows x64 | [Installer .exe](https://github.com/kriss-spy/onlystory/releases/download/v0.2.0-pre.1/Onlystory-0.2.0-Setup-x64.exe)   | Install, then open Onlystory.            |
| Linux x64   | [tar.gz](https://github.com/kriss-spy/onlystory/releases/download/v0.2.0-pre.1/Onlystory-0.2.0-linux-x64.tar.gz)        | Extract, then run `./onlystory-desktop`. |

Preview builds: Windows apps are unsigned; Linux desktop launch is not yet verified. Checksums are on the release page.

## Start reading

1. Open a game and find a story.
2. Download it, then choose **Read story**.
3. Downloaded stories stay available offline. Progress saves automatically.

**Blue Archive and Project SEKAI** download from the desktop app. **Girls' Frontline 1 & 2** currently need a separately prepared local library; their stories are not bundled.

Event badges **JP / CN / EN** show supported dialogue languages. Availability varies by story.

Using a browser instead? See [web setup and BA file imports](docs/standalone-app.md).

## Development

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173>. Run `npm run check` before committing.

## More

- [Available stories, languages, and voices](docs/content-inventory.md)
- [Setup, downloads, and offline reading](docs/standalone-app.md)
- [Build and hosting](docs/deployment.md)
- [Technical reference and known limits](docs/project-reference.md)
