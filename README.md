# WT Sights Editor

Десктоп-генератор прицелов War Thunder. Каталог машин (`data/catalog.json`) кладётся в релиз; игрок выбирает свою папку `UserSights` и создаёт `AP.blk` / `HEAT.blk` / `APDS.blk` / `HE.blk` локально.

## Запуск

```bash
npm install
npm test
npm run tauri:dev
```

Обновить каталог из datamine (не нужно игроку):

```bash
# git clone --filter=blob:none --sparse --depth 1 \
#   https://github.com/gszabi99/War-Thunder-Datamine.git .cache/datamine
# cd .cache/datamine && git sparse-checkout set \
#   aces.vromfs.bin_u/gamedata/units/tankmodels \
#   lang.vromfs.bin_u/lang \
#   aces.vromfs.bin_u/gamedata/weapons/groundmodels_weapons
npm run catalog:build
```

Русское и английское имя текущего патча и дату каталога править в `data/patch.json`. Скрипт копирует их в `data/catalog.json` (файл `patch.json` не затирает). В редакторе русская локаль берёт `nameRu`, остальные — `nameEn`. Обои патча — `data/bg.jpg`, редактор ставит их фоном окна. Дату менять только когда в каталоге появилась новая техника, потом `catalog:build` и релиз. Версию программы поднимать при правках самого редактора (`npm run version:set -- 0.1.1`); дату каталога при этом не трогать.

Пользовательские танки хранятся в data-каталоге приложения (`user-catalog.json`) и не затираются обновлением.

Выбранная папка `UserSights` запоминается в `settings.json` в config-каталоге (`~/.config/wt-sights-editor` на Linux).

## Релиз

Тесты (`npm test`) гоняются GitHub Actions на каждый пуш и PR в `master`. Сборки только по git-тегу `v*` появляются на [Releases](https://github.com/ath31st/wt_sights_editor/releases):

- Linux AppImage (~80 MB, портабл): `wt-sights-editor-<version>-linux-amd64.AppImage`
- Linux ELF (маленький, как Windows exe): `wt-sights-editor-<version>-linux-x86_64` — нужен системный WebKitGTK (`webkit2gtk-4.1` в Arch/CachyOS, `libwebkit2gtk-4.1-0` в Debian/Ubuntu)
- Windows: `wt-sights-editor-<version>-windows-x64.exe` (нужен WebView2, на Win10/11 обычно уже есть)

AppImage не тащит `libwayland` из Ubuntu-раннера: берётся системный, чтобы окно открывалось и на Wayland (CachyOS/Arch), и на X11. ELF линкуется к WebKit на машине — поэтому он лёгкий, но без пакета `webkit2gtk` не стартует.

Версию в файлах поднимает одна команда (число без `v`, или с `v` — скрипт сам снимет букву):

```bash
npm run version:set -- 0.1.1
```

Она пишет `0.1.1` в `tauri.conf.json` (это видит UI после сборки), `Cargo.toml` и `package.json`. Игроку npm не нужен. Не путать с `npm version` — тот трогает git сам по себе.

Тег и подпись в сайдбаре — с `v`: `v0.1.1`. Когда коммит уже есть и рабочее дерево чистое:

```bash
npm run release
```

Скрипт читает версию из `tauri.conf.json`, пушит `master`, ставит тег `v0.1.1` и пушит его. Сборка бинарников стартует на GitHub.
