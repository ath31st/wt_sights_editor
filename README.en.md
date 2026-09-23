English · [Русский](README.md)

# WT Sights Editor

![Logo](images/logo.jpeg)

A portable app for generating custom War Thunder sights. The vehicle catalog is already inside: point it at your `UserSights` folder, and it writes sight files to disk and can assign them to a vehicle.

The interface is in Russian and English. The version number is shown in the left sidebar and on the [releases page](https://github.com/ath31st/wt_sights_editor/releases).

## Contents

- [Credits](#credits)
- [Disclaimer](#disclaimer)
- [Download and run](#download-and-run)
- [How to use](#how-to-use)
  - [Where to find the UserSights folder](#where-to-find-the-usersights-folder)
- [Build from source](#build-from-source)
- [Possible problems](#possible-problems)
- [Catalog updates and releases](#catalog-updates-and-releases)
- [License](#license)

## Credits

The sights in this app are based on the custom sights by [Minedeployder](https://live.warthunder.com/user/25154302/). I played for a long time with Minedeployder's minimalist sights, but the older ones are no longer updated (Tiger sights still have that junk "Death Star", for example), and some older vehicles simply do not have them (the SAV 20.18, for example). That is what pushed me to write this program.

## Disclaimer

WT Sights Editor is an unofficial app for personal sights. It is not affiliated with Gaijin Entertainment and is not part of War Thunder. War Thunder and related names belong to their respective owners.

The app writes only local files of your account: sights in `UserSights` and the assignment in `global.blk`. It does not touch game files, and the anticheat will not block you even if the app is running alongside the game. Before the first write, a copy named `global.blk.wtse.bak` is saved next to `global.blk`. You are responsible for your game files and for how you use the app.

## Download and run

1. Download the file for your system from the [releases page](https://github.com/ath31st/wt_sights_editor/releases).
2. Run it.

- **Linux, AppImage** (about 80 MB, portable): `wt-sights-editor-<version>-linux-x86_64.AppImage`.
- **Linux, small binary**: `wt-sights-editor-<version>-linux-x86_64`. Needs the system WebKitGTK package: `webkit2gtk-4.1` on Arch and CachyOS, `libwebkit2gtk-4.1-0` on Debian and Ubuntu.
- **Windows**: `wt-sights-editor-<version>-windows-x86_64.exe`. Needs WebView2; on Windows 10 and 11 it is usually already installed.

**Linux.** Double-click the downloaded file and confirm that you want to run it. This works for both the AppImage and the binary without an extension.

If you prefer a terminal, add the `.AppImage` suffix to the name for the AppImage:

```bash
chmod +x wt-sights-editor-<version>-linux-x86_64
./wt-sights-editor-<version>-linux-x86_64
```

**Windows.** Double-click `wt-sights-editor-<version>-windows-x86_64.exe`.

![Main window](images/main.jpeg)

On the left is the catalog, country filters, and search. In the center is the sight diagram preview. On the right is the selected vehicle and the block for adding a vehicle by hand, in case it is missing from the catalog.

## How to use

### Where to find the UserSights folder

Since update 2.53 "Line of Contact", this folder has been moved into the account saves. In the same `production` folder, next to `UserSights`, lies `global.blk`: the app reads it in order to assign a sight to a vehicle.

**Windows**

```text
C:\Users\<name>\Documents\My Games\WarThunder\Saves\<account ID>\production\UserSights
```

In Explorer: Documents → My Games → WarThunder → Saves → the folder with the ID → production → UserSights.

**Linux**

```text
~/.config/WarThunder/Saves/<account ID>/production/UserSights
```

The ID is the name of the numeric folder inside `Saves`. You can see it on your profile on the store website. If there are several such folders, the last login is recorded in `Saves/lastlogin.blk`.

The `UserSights` folder might not exist yet. Create it inside `production` and select it in the app.

1. Click **Select UserSights** and point it at this folder. The chosen path is remembered.
2. Find a vehicle with search (`Abrams`, `t72`, `ussr_`) or the country filter.
3. The center shows the diagram in milliradians. In the game, the shell places the marks.
4. The **Font** slider changes the size of the labels in the generated files.
5. **Generate sights** writes files into `UserSights`:
   - **For this vehicle** — only the selected vehicle;
   - **For filter** — whatever is currently in the list;
   - **For all vehicles** — the whole catalog.

   Each vehicle gets a folder named with its unit id and the ammo files it has in the catalog: `AP.blk`, `AP_Fast.blk`, `HEAT.blk`, `APDS.blk`, `HE.blk`, `AA.blk`, `SAM.blk`.
6. The ammo button on the right assigns that sight to the vehicle. If the file does not exist yet, the app creates it and writes the name into `global.blk`. Before the first write, a copy named `global.blk.wtse.bak` appears next to it.
7. If War Thunder is closed at that moment, the next launch rereads the settings and the generated files, and the sights show up immediately. The assigned sight is applied on launch as well. If the game was already open while you were creating the files, the new sights have to be reread with the **Reload custom sight** button: first check the assigned key in the control settings, or set your own, and press it in the hangar, in battle, or in a test drive. Assigned sights, if the game is already running, become visible after you restart the client.
8. If a vehicle is missing from the catalog, use **Add vehicle manually**: unit id (Latin letters, digits, and `_`), a name, zoom magnification, and a set of ammo types. That vehicle is stored separately and stays after the app is updated.

## Build from source

You need [Node.js](https://nodejs.org/) and [Rust](https://www.rust-lang.org/tools/install). On Linux the window also needs WebKit: `libwebkit2gtk-4.1-dev` on Debian and Ubuntu, `webkit2gtk-4.1` on Arch and CachyOS.

```bash
git clone https://github.com/ath31st/wt_sights_editor.git
cd wt_sights_editor
npm install
npm test
npm run tauri:dev
```

## Possible problems

- The window does not open on Linux. For the small binary and for a build from source, install WebKitGTK (`webkit2gtk-4.1`, or `libwebkit2gtk-4.1-0` / `libwebkit2gtk-4.1-dev`). The AppImage does not need this package.
- WebView2 is missing on Windows. Install the [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
- After you pick a folder, a warning says that `global.blk` was not found. You need the `UserSights` folder inside `production`: `global.blk` sits next to it. Without that file the sights can still be written, but they cannot be assigned to a vehicle.
- The files are on disk, but they are not visible in the game. If the client was open during generation, press **Reload custom sight** in the hangar, in battle, or in a test drive. If the game was closed, the sights should already be there after launch. A change to the assignment in `global.blk` while the game is running becomes visible after you restart the client.
- If you cannot sort the problem out on your own, contact the developer via [Issues](https://github.com/ath31st/wt_sights_editor/issues) or [Telegram](https://t.me/feedback_genie_bot).

## Catalog updates and releases

The vehicle catalog lives in `data/catalog.json` and is shipped in the release together with the app.

Update the vehicle catalog from the datamine:

```bash
# git clone --filter=blob:none --sparse --depth 1 \
#   https://github.com/gszabi99/War-Thunder-Datamine.git .cache/datamine
# cd .cache/datamine && git sparse-checkout set \
#   aces.vromfs.bin_u/gamedata/units/tankmodels \
#   lang.vromfs.bin_u/lang \
#   aces.vromfs.bin_u/gamedata/weapons/groundmodels_weapons
npm run catalog:build
```

The Russian and English names of the current patch and the catalog date are set in `data/patch.json` (`nameRu`, `nameEn`, `date`). The script copies them into `data/catalog.json` and does not overwrite `patch.json` itself. In the editor, the Russian locale uses `nameRu`; the others use `nameEn`. The patch wallpaper is `data/bg.jpg`; the editor uses it as the window background. Change the date when new vehicles appear in the catalog, then run `catalog:build` and make a release. Bump the app version when you change the editor itself; leave the catalog date alone in that case.

Vehicles added by hand are stored in `user-catalog.json` in the app data directory and are not wiped by an update. The selected `UserSights` folder is remembered in `settings.json` in the config directory (`~/.config/wt-sights-editor` on Linux).

Tests (`npm test`) run in GitHub Actions on every push and pull request to `master`. Builds appear on [Releases](https://github.com/ath31st/wt_sights_editor/releases) only for a git tag `v*`. `libwayland` built on the Ubuntu runner is stripped out of the AppImage: the user's machine supplies the system library, so Mesa on Arch and CachyOS does not conflict with it.

Bump the version in the files with this command (a number without `v`, or with `v` — the script strips the letter itself):

```bash
npm run version:set -- 0.1.1
```

The command writes `0.1.1` into `tauri.conf.json` (the interface sees it after a build), `Cargo.toml`, and `package.json`.

The tag and the label in the sidebar include `v`: `v0.1.1`. When the commit already exists and the working tree is clean:

```bash
npm run release
```

The script reads the version from `tauri.conf.json`, pushes `master`, creates the tag `v0.1.1`, and pushes the tag. The binary build starts on GitHub.

## License

[MIT License](LICENSE)
