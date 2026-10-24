# MFG Unlocker GUI

A Windows front end for [MFG Unlocker](https://github.com/dashdogy/MFG-Unlocker), the mod that
unlocks DLSS Multi Frame Generation in games and adds controls the game itself does not expose.

The mod is a proxy DLL. Without a front end you pick a filename, copy files into the right folder
by hand, and edit a JSON file to change a preset. This app does that part:

- Finds Steam and every library folder added to it, lists the installed games, and shows which ones
  ship the files the mod needs: DLSS Frame Generation and Streamline next to the game executable.
- Installs the mod DLL into the folder that holds the game executable, under a proxy name you pick.
  It refuses to overwrite a DLL that belongs to the game, keeps an earlier mod build aside when it
  is replaced, and handles the Bink rename on its own.
- Undoes an install: removes the DLL, gives the game's own Bink DLL its name back, and puts the
  replaced mod build back if there was one. Settings files and logs are left alone.
- Edits the mod's settings from outside the game: follow, fixed or dynamic mode, the multiplier, the
  dynamic target, the DLSS Frame Generation, Super Resolution and Ray Reconstruction presets,
  V-Sync, the Reflex FPS cap, the menu language and key, and the two compatibility switches.
- Shows the status file and the logs the mod wrote during the last launch.
- Games that are not on Steam can be added as a folder. The UI has a zoom control, since the window
  is dense by design.

## Requirements

- Windows 10 or 11 with the WebView2 runtime (already present on current Windows).
- For DLSS MFG: an RTX 20, 30, 40 or 50 card. RTX 20 and 30 are experimental in the mod itself.
- The game has to have a Streamline DLSS Frame Generation integration, or receive one from the
  NVIDIA app. The mod's README covers the details and the per game caveats.

## Build

Node 20 or newer with pnpm, Rust 1.82 or newer with the `x86_64-pc-windows-msvc` target, and the
Visual Studio C++ build tools for the linker.

```text
pnpm install
pnpm tauri dev      # development, opens the app window
pnpm tauri build    # release build, installer under src-tauri/target/release/bundle/nsis
```

`pnpm dev` alone runs the interface in a browser against fixture data, which is handy for design
work but does nothing to your games.

## What it writes, and where

Next to the game executable that you selected:

| File | Who owns it |
| --- | --- |
| the proxy DLL you picked | this app copies and removes it |
| `RTXMFG-Universal.json` | the mod reads it at startup; this app edits it |
| `RTX40MFG-UI.ini` | menu preferences; this app edits the keys it exposes |
| `RTXMFG-Universal.status.json` | written by the mod while a game runs; this app only reads it |
| `RTXMFG-*.log` | written by the mod; this app only reads it |

App state lives in `%APPDATA%\com.lashman.mfgunlockergui`: the game list with install metadata, the
downloaded release, and the builds kept aside for undo. The mod DLL itself is downloaded from the
GitHub release and checked against the published SHA-256 before it is copied anywhere.

## Notes

- This app does not ship the mod. `MFGUnlocker.dll` embeds Intel XeSS program data under Intel's
  terms, so it is fetched at run time rather than redistributed here.
- Settings saved here take effect the next time the game starts. Presets are the exception: the mod
  can switch them while a DirectX 12 game runs on RTX 20/30/40/50, which is why they are in the
  settings screen at all.
- Any DLL dropped into a game folder can look like a cheat to anti cheat software. Online games are
  a risk, and that is true of the mod with or without this app.
- Not affiliated with the mod author, NVIDIA or Intel.

## Licence

MIT for this app. MFG Unlocker is MIT as well; see its repository for the third party notices.
