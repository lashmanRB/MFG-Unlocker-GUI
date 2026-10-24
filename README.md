# MFG Unlocker GUI

A Windows front end for [MFG Unlocker](https://github.com/dashdogy/MFG-Unlocker), the mod that
unlocks DLSS Multi Frame Generation in games and adds controls the game itself does not expose.

The mod is a proxy DLL. Without a front end you pick a filename, copy files into the right folder
by hand, and edit a JSON file to change a preset. This app does that part:

- Finds Steam and every library folder added to it, lists the installed games, and shows which ones
  ship the files the mod needs: DLSS Frame Generation and Streamline next to the game executable.
  NVIDIA's published per title list is matched on top of that (6X MFG, 4X MFG, Frame Generation
  without an MFG override, or not listed), so a game whose Frame Generation plug-in comes from the
  NVIDIA app still shows up as a candidate.
- Installs the mod DLL into the folder that holds the game executable, under a proxy name you pick
  from the ones that are actually usable: a name the game already ships is not offered, its own Bink
  DLL is moved aside to `<name>Hooked.dll` when that route is the only one left, and an earlier mod
  build is kept aside when it is replaced.
- Undoes an install: removes the DLL, gives the game's own Bink DLL its name back, and puts the
  replaced mod build back if there was one. Settings files and logs are left alone.
- Checks the mod's releases on startup, downloads a new build, and moves every installed game to it.
  A game that is running keeps its old DLL until the next start, and each update keeps the replaced
  build so undo still works.
- Edits the mod's settings from outside the game: follow, fixed or dynamic mode, the multiplier, the
  dynamic target, the DLSS Frame Generation, Super Resolution and Ray Reconstruction presets,
  V-Sync, the Reflex FPS cap, the menu language and key, and the two compatibility switches.
- Shows the status file and the logs the mod wrote during the last launch.
- Games that are not on Steam can be added as a folder. The window remembers its size and position,
  and the UI has a zoom control, since the layout is dense by design.

## Requirements

- Windows 10 or 11 with the WebView2 runtime (already present on current Windows).
- For DLSS MFG: an RTX 20, 30, 40 or 50 card. RTX 20 and 30 are experimental in the mod itself.
- The game has to have a Streamline DLSS Frame Generation integration, or receive one from the
  NVIDIA app. The mod's README covers the details and the per game caveats.

## Portable

Everything the app keeps lives in a `data` folder next to the executable: the game list, the
downloaded release, the builds kept for undo, the window position, and the WebView2 profile. Copy
the `.exe` together with that folder and the whole state moves with it. Nothing is written to
AppData, and nothing is written to the registry: Steam libraries and the graphics card are only read
from there.

Put the executable somewhere you can write to. A Program Files folder needs administrator rights,
which the app does not ask for.

## Build

Node 20 or newer with pnpm, Rust 1.82 or newer with the `x86_64-pc-windows-msvc` target, and the
Visual Studio C++ build tools for the linker.

```text
pnpm install
pnpm tauri dev      # development, opens the app window
pnpm tauri build    # release build, the exe lands in src-tauri/target/release
```

Bundling is off on purpose so the output is a single portable executable rather than an installer
that writes to Program Files and the registry. `pnpm dev` alone runs the interface in a browser
against fixture data, which is handy for design work but does nothing to your games.

## What it writes, and where

Next to the game executable that you selected:

| File | Who owns it |
| --- | --- |
| the proxy DLL you picked | this app copies and removes it |
| `<name>Hooked.dll` | only on the Bink route: the game's own DLL, renamed, restored on undo |
| `RTXMFG-Universal.json` | the mod reads it at startup; this app edits it |
| `RTX40MFG-UI.ini` | menu preferences; this app edits the keys it exposes |
| `RTXMFG-Universal.status.json` | written by the mod while a game runs; this app only reads it |
| `RTXMFG-*.log` | written by the mod; this app only reads it |

Next to this app's own executable:

| File | Contents |
| --- | --- |
| `data\store.json` | the game list, chosen executables, install and undo metadata |
| `data\window.json` | last window position, size and maximized state |
| `data\release\` | the downloaded mod builds and the release check cache |
| `data\nvidia-overrides.json` | NVIDIA's per title list, refreshed weekly, used for the match column |
| `data\backups\` | mod builds kept aside so an update or reinstall can be undone |
| `data\webview\` | the WebView2 profile, which also holds the UI zoom level |

The mod DLL itself is downloaded from the GitHub release and checked against the published SHA-256
before it is copied anywhere.

## Notes

- This app does not ship the mod. `MFGUnlocker.dll` embeds Intel XeSS program data under Intel's
  terms, so it is fetched at run time rather than redistributed here.
- The NVIDIA column is NVIDIA's own published data, fetched from their site and kept for a week. Not
  listed does not mean the mod cannot work: it means NVIDIA publishes no override for that title, so
  the multiplier comes from the game's own integration.
- Settings saved here take effect the next time the game starts. Presets are the exception: the mod
  can switch them while a DirectX 12 game runs on RTX 20/30/40/50, which is why they are in the
  settings screen at all.
- Any DLL dropped into a game folder can look like a cheat to anti cheat software. Online games are
  a risk, and that is true of the mod with or without this app.
- Not affiliated with the mod author, NVIDIA or Intel.

## Licence

CC0 1.0 Universal. To the extent possible under law, lashman has waived all copyright and related
or neighbouring rights to this work, so it is public domain: use it, change it, ship it, no
attribution needed. The full text is in [LICENSE](LICENSE).

MFG Unlocker itself is MIT and is not included here. Its DLL embeds Intel XeSS program data under
Intel's terms, which is why the app downloads it at run time. Dependencies keep their own licences
(MIT and Apache-2.0).
