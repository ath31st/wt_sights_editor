import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import bundledCatalog from "@catalog";
import {
  AMMO_CLASSES,
  COUNTRY_ORDER,
  countryFromUnitId,
  countryLabelRu,
  generateTankSights,
  mergeCatalogs,
  parseTankCrosshairs,
  setTankCrosshair,
  sightFromZoom,
  type AmmoClass,
  type CatalogTank,
} from "@wt_sights_editor/core";
import { SightPreview } from "./SightPreview";

type Written = { count: number; root: string };

type AppSettings = {
  version: number;
  userSightsPath?: string | null;
};

type LoadedAppSettings = AppSettings & {
  userSightsPathExists: boolean;
};

function isAmmoClass(value: string | undefined): value is AmmoClass {
  return AMMO_CLASSES.includes(value as AmmoClass);
}

export default function App() {
  const [userTanks, setUserTanks] = useState<CatalogTank[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ version: 1 });
  const [root, setRoot] = useState<string>("");
  const [globalBlkPath, setGlobalBlkPath] = useState<string | null>(null);
  const [crosshairs, setCrosshairs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string>("");
  const [previewAmmo, setPreviewAmmo] = useState<AmmoClass | null>(null);
  const [previewTankId, setPreviewTankId] = useState<string>("");
  const [fontOverride, setFontOverride] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [newId, setNewId] = useState("");
  const [newZoomMin, setNewZoomMin] = useState("4");
  const [newZoomMax, setNewZoomMax] = useState("8");
  const [newSights, setNewSights] = useState<AmmoClass[]>(["AP"]);
  const [newName, setNewName] = useState("");

  const catalog = useMemo(
    () => mergeCatalogs(bundledCatalog, userTanks),
    [userTanks],
  );

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tank of catalog.tanks) {
      counts.set(tank.country, (counts.get(tank.country) ?? 0) + 1);
    }
    const known = COUNTRY_ORDER.filter((code) => counts.has(code));
    const rest = [...counts.keys()]
      .filter((code) => !(COUNTRY_ORDER as readonly string[]).includes(code))
      .sort();
    return [...known, ...rest];
  }, [catalog.tanks]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.tanks.filter((tank) => {
      if (country !== "all" && tank.country !== country) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        tank.id.includes(q) ||
        tank.nameEn.toLowerCase().includes(q) ||
        tank.nameRu.toLowerCase().includes(q)
      );
    });
  }, [catalog.tanks, country, query]);

  const selected = catalog.tanks.find((tank) => tank.id === selectedId) ?? visible[0];
  const assigned = selected ? crosshairs[selected.id] : undefined;
  const resolvedPreview: AmmoClass =
    (previewTankId === selected?.id &&
    previewAmmo &&
    selected.sights.includes(previewAmmo)
      ? previewAmmo
      : undefined) ??
    (isAmmoClass(assigned) && selected?.sights.includes(assigned) ? assigned : undefined) ??
    selected?.sights[0] ??
    "AP";

  const previewModel = useMemo(() => {
    if (!selected) {
      return sightFromZoom("AP", 6, {}, 6);
    }
    return sightFromZoom(
      resolvedPreview,
      selected.zoomMax,
      {
        fontSizeMult: fontOverride ?? undefined,
      },
      selected.zoomMin,
    );
  }, [selected, resolvedPreview, fontOverride]);

  async function loadGlobalFromUserSights(userSights: string): Promise<boolean> {
    try {
      const path = await invoke<string | null>("resolve_global_blk", { userSights });
      setGlobalBlkPath(path);
      if (!path) {
        setCrosshairs({});
        return false;
      }
      const text = await invoke<string>("read_text_file", { path });
      setCrosshairs(Object.fromEntries(parseTankCrosshairs(text)));
      return true;
    } catch (err: unknown) {
      setGlobalBlkPath(null);
      setCrosshairs({});
      throw err;
    }
  }

  useEffect(() => {
    invoke<CatalogTank[]>("load_user_extras")
      .then(setUserTanks)
      .catch((err: unknown) => setStatus(String(err)));

    invoke<LoadedAppSettings>("load_app_settings")
      .then(async (loaded) => {
        const next: AppSettings = {
          version: loaded.version || 1,
          userSightsPath: loaded.userSightsPath,
        };
        setSettings(next);
        const saved = loaded.userSightsPath;
        if (!saved) {
          return;
        }
        if (!loaded.userSightsPathExists) {
          setStatus("Сохранённая папка UserSights не найдена, выбери заново.");
          return;
        }
        setRoot(saved);
        try {
          const found = await loadGlobalFromUserSights(saved);
          setStatus(
            found ? `Папка: ${saved}` : `Папка: ${saved}. global.blk не найден рядом с UserSights.`,
          );
        } catch (err: unknown) {
          setStatus(String(err));
        }
      })
      .catch((err: unknown) => setStatus(String(err)));
  }, []);

  async function persistSettings(next: AppSettings) {
    setSettings(next);
    await invoke("save_app_settings", { settings: next });
  }

  async function pickFolder() {
    const dir = await open({
      directory: true,
      defaultPath: root || undefined,
      title: "Папка UserSights",
    });
    if (typeof dir === "string") {
      setRoot(dir);
      try {
        await persistSettings({ ...settings, userSightsPath: dir });
        const found = await loadGlobalFromUserSights(dir);
        setStatus(
          found ? `Папка: ${dir}` : `Папка: ${dir}. global.blk не найден рядом с UserSights.`,
        );
      } catch (err: unknown) {
        setStatus(String(err));
      }
    }
  }

  async function persistExtras(next: CatalogTank[]) {
    setUserTanks(next);
    await invoke("save_user_extras", { tanks: next });
  }

  async function writeFiles(tanks: CatalogTank[]) {
    if (!root) {
      setStatus("Сначала выбери папку UserSights.");
      return;
    }
    const files = tanks.flatMap((tank) =>
      generateTankSights(tank, tank.sights, fontOverride ?? undefined),
    );
    const result = await invoke<Written>("write_sight_files", {
      root,
      files,
    });
    setStatus(`Записано файлов: ${result.count}`);
  }

  async function applyAmmo(tank: CatalogTank, ammo: AmmoClass) {
    setSelectedId(tank.id);
    setPreviewTankId(tank.id);
    setPreviewAmmo(ammo);
    if (!root) {
      setStatus("Сначала выбери папку UserSights.");
      return;
    }
    try {
      const existing = await invoke<string[]>("list_tank_sights", {
        root,
        tankId: tank.id,
      });
      if (!existing.includes(ammo)) {
        await invoke<Written>("write_sight_files", {
          root,
          files: generateTankSights(tank, [ammo], fontOverride ?? undefined),
        });
      }
      if (!globalBlkPath) {
        setStatus("global.blk не найден рядом с UserSights.");
        return;
      }
      const text = await invoke<string>("read_text_file", { path: globalBlkPath });
      const next = setTankCrosshair(text, tank.id, ammo);
      await invoke("write_global_blk", { path: globalBlkPath, contents: next });
      setCrosshairs(Object.fromEntries(parseTankCrosshairs(next)));
    } catch (err: unknown) {
      setStatus(String(err));
    }
  }

  function addManualTank() {
    const id = newId.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]+$/.test(id)) {
      setStatus("Id: только латиница, цифры и _.");
      return;
    }
    const zoomMin = Number(newZoomMin);
    const zoomMax = Number(newZoomMax);
    if (!Number.isFinite(zoomMin) || !Number.isFinite(zoomMax)) {
      setStatus("Кратность должна быть числом.");
      return;
    }
    const tank: CatalogTank = {
      id,
      country: countryFromUnitId(id),
      nameEn: newName.trim() || id,
      nameRu: newName.trim() || id,
      zoomMin,
      zoomMax: Math.max(zoomMin, zoomMax),
      sights: newSights.length > 0 ? newSights : ["AP"],
    };
    const next = userTanks.filter((item) => item.id !== id).concat(tank);
    void persistExtras(next);
    setSelectedId(id);
    setStatus(`Добавлен ${id}. Останется после обновления программы.`);
  }

  function toggleNewSight(ammo: AmmoClass) {
    setNewSights((current) =>
      current.includes(ammo) ? current.filter((item) => item !== ammo) : [...current, ammo],
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <strong>WT Sights Editor</strong>
          <span>{catalog.tanks.length} машин</span>
        </header>
        <button type="button" onClick={() => void pickFolder()}>
          Выбрать UserSights
        </button>
        <p className="path">{root || "папка не выбрана"}</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск: Abrams, t72, ussr_"
        />
        <div className="countries">
          <button
            type="button"
            className={country === "all" ? "active" : ""}
            onClick={() => setCountry("all")}
          >
            Все
          </button>
          {countries.map((code) => (
            <button
              key={code}
              type="button"
              className={country === code ? "active" : ""}
              onClick={() => setCountry(code)}
            >
              {countryLabelRu(code)}
            </button>
          ))}
        </div>
        <ul className="tank-list">
          {visible.slice(0, 400).map((tank) => (
            <li key={tank.id}>
              <button
                type="button"
                className={selected?.id === tank.id ? "active" : ""}
                onClick={() => {
                  setSelectedId(tank.id);
                  setFontOverride(null);
                  setStatus("");
                }}
              >
                <span>{tank.nameRu || tank.nameEn}</span>
                <small>{tank.id}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="preview-pane">
        <SightPreview model={previewModel} />
      </main>

      <section className="inspector">
        {selected ? (
          <>
            <h2>{selected.nameRu}</h2>
            <p className="muted">
              {selected.id} · {countryLabelRu(selected.country)} · {selected.zoomMin}x–
              {selected.zoomMax}x
            </p>
            <p className="muted">Снаряды</p>
            <div className="ammo-pick">
              {selected.sights.map((ammo) => {
                const speed = selected.ammoSpeeds?.[ammo];
                const label = speed != null ? `${ammo} (${speed})` : ammo;
                return (
                  <button
                    key={ammo}
                    type="button"
                    className={assigned === ammo ? "active" : ""}
                    onClick={() => void applyAmmo(selected, ammo)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {globalBlkPath ? (
              <p className="muted">
                {assigned
                  ? `global.blk: ${selected.id} → ${assigned}`
                  : `global.blk: ${selected.id} — нет записи`}
              </p>
            ) : null}
            <label>
              Шрифт
              <input
                type="range"
                min={0.2}
                max={1.2}
                step={0.01}
                value={fontOverride ?? previewModel.fontSizeMult}
                onChange={(event) => setFontOverride(Number(event.target.value))}
              />
              <span>{(fontOverride ?? previewModel.fontSizeMult).toFixed(2)}</span>
            </label>
            <h3>Сгенерировать прицелы</h3>
            <div className="actions">
              <button type="button" onClick={() => void writeFiles([selected])}>
                Для этой техники
              </button>
              <button type="button" onClick={() => void writeFiles(visible)}>
                По фильтру ({visible.length})
              </button>
              <button type="button" onClick={() => void writeFiles(catalog.tanks)}>
                Для всей техники
              </button>
            </div>
          </>
        ) : (
          <p>Нет техники в фильтре.</p>
        )}

        {status ? <p className="status">{status}</p> : null}

        <h3>Добавить технику вручную</h3>
        <label>
          unit id
          <input value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="ussr_t_72b3_arena" />
        </label>
        <label>
          Название
          <input value={newName} onChange={(event) => setNewName(event.target.value)} />
        </label>
        <div className="row">
          <label>
            zoom min
            <input value={newZoomMin} onChange={(event) => setNewZoomMin(event.target.value)} />
          </label>
          <label>
            zoom max
            <input value={newZoomMax} onChange={(event) => setNewZoomMax(event.target.value)} />
          </label>
        </div>
        <div className="sights">
          {AMMO_CLASSES.map((ammo) => (
            <label key={ammo}>
              <input
                type="checkbox"
                checked={newSights.includes(ammo)}
                onChange={() => toggleNewSight(ammo)}
              />
              {ammo}
            </label>
          ))}
        </div>
        <button type="button" onClick={addManualTank}>
          Сохранить у себя
        </button>
      </section>
    </div>
  );
}
