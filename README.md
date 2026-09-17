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

Пользовательские танки хранятся в data-каталоге приложения (`user-catalog.json`) и не затираются обновлением.
