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
import { Toaster, toast } from "sonner";
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

type WriteScope = "selected" | "filter" | "all";

function ruCount(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${n} ${many}`;
  }
  if (mod10 === 1) {
    return `${n} ${one}`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${n} ${few}`;
  }
  return `${n} ${many}`;
}

function tankLabel(tank: CatalogTank): string {
  return tank.nameRu || tank.nameEn || tank.id;
}

function notifyError(err: unknown, title = "Ошибка") {
  toast.error(title, { description: String(err) });
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
      .catch((err: unknown) => notifyError(err, "Не удалось загрузить свою технику"));

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
          toast.warning("Сохранённая папка UserSights не найдена", {
            description: "Выбери папку заново.",
          });
          return;
        }
        setRoot(saved);
        try {
          const found = await loadGlobalFromUserSights(saved);
          if (!found) {
            toast.warning("global.blk не найден рядом с UserSights");
          }
        } catch (err: unknown) {
          notifyError(err, "Не удалось открыть UserSights");
        }
      })
      .catch((err: unknown) => notifyError(err, "Не удалось загрузить настройки"));
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
        if (found) {
          toast.success("Папка UserSights выбрана", { description: dir });
        } else {
          toast.warning("Папка выбрана, но global.blk не найден", { description: dir });
        }
      } catch (err: unknown) {
        notifyError(err, "Не удалось открыть UserSights");
      }
    }
  }

  async function persistExtras(next: CatalogTank[]) {
    setUserTanks(next);
    await invoke("save_user_extras", { tanks: next });
  }

  async function writeFiles(tanks: CatalogTank[], scope: WriteScope) {
    if (!root) {
      toast.warning("Сначала выбери папку UserSights");
      return;
    }
    if (tanks.length === 0) {
      toast.warning("Нет техники для генерации");
      return;
    }
    const files = tanks.flatMap((tank) =>
      generateTankSights(tank, tank.sights, fontOverride ?? undefined),
    );
    const loading =
      scope === "selected"
        ? `Записываю прицелы для ${tankLabel(tanks[0])}…`
        : scope === "filter"
          ? "Записываю прицелы по фильтру…"
          : "Записываю прицелы для всей техники…";
    const toastId = toast.loading(loading);
    try {
      const result = await invoke<Written>("write_sight_files", {
        root,
        files,
      });
      const fileCount = ruCount(result.count, "файл", "файла", "файлов");
      const vehicleCount = ruCount(tanks.length, "машина", "машины", "машин");
      if (scope === "selected") {
        toast.success("Прицелы записаны", {
          id: toastId,
          description: `${tankLabel(tanks[0])} · ${fileCount}`,
        });
        return;
      }
      if (scope === "filter") {
        const parts: string[] = [];
        if (country !== "all") {
          parts.push(countryLabelRu(country));
        }
        const q = query.trim();
        if (q) {
          parts.push(`«${q}»`);
        }
        parts.push(vehicleCount, fileCount);
        toast.success("Прицелы по фильтру записаны", {
          id: toastId,
          description: parts.join(" · "),
        });
        return;
      }
      toast.success("Прицелы для всей техники записаны", {
        id: toastId,
        description: `${vehicleCount} · ${fileCount}`,
      });
    } catch (err: unknown) {
      toast.error("Не удалось записать прицелы", {
        id: toastId,
        description: String(err),
      });
    }
  }

  async function applyAmmo(tank: CatalogTank, ammo: AmmoClass) {
    setSelectedId(tank.id);
    setPreviewTankId(tank.id);
    setPreviewAmmo(ammo);
    if (!root) {
      toast.warning("Сначала выбери папку UserSights");
      return;
    }
    try {
      const existing = await invoke<string[]>("list_tank_sights", {
        root,
        tankId: tank.id,
      });
      let created = false;
      if (!existing.includes(ammo)) {
        await invoke<Written>("write_sight_files", {
          root,
          files: generateTankSights(tank, [ammo], fontOverride ?? undefined),
        });
        created = true;
      }
      if (!globalBlkPath) {
        toast.warning("global.blk не найден рядом с UserSights", {
          description: created
            ? `${tankLabel(tank)}: ${ammo}.blk записан, но назначить прицел нельзя.`
            : "Назначить прицел нельзя.",
        });
        return;
      }
      const text = await invoke<string>("read_text_file", { path: globalBlkPath });
      const next = setTankCrosshair(text, tank.id, ammo);
      await invoke("write_global_blk", { path: globalBlkPath, contents: next });
      setCrosshairs(Object.fromEntries(parseTankCrosshairs(next)));
      toast.success(created ? "Прицел записан и назначен" : "Прицел назначен", {
        description: `${tankLabel(tank)} → ${ammo}`,
      });
    } catch (err: unknown) {
      notifyError(err, "Не удалось назначить прицел");
    }
  }

  function addManualTank() {
    const id = newId.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]+$/.test(id)) {
      toast.warning("Некорректный id", {
        description: "Только латиница, цифры и _.",
      });
      return;
    }
    const zoomMin = Number(newZoomMin);
    const zoomMax = Number(newZoomMax);
    if (!Number.isFinite(zoomMin) || !Number.isFinite(zoomMax)) {
      toast.warning("Кратность должна быть числом");
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
    void persistExtras(next)
      .then(() => {
        setSelectedId(id);
        toast.success("Техника добавлена", {
          description: `${tankLabel(tank)} (${id}) останется после обновления программы.`,
        });
      })
      .catch((err: unknown) => notifyError(err, "Не удалось сохранить технику"));
  }

  function toggleNewSight(ammo: AmmoClass) {
    setNewSights((current) =>
      current.includes(ammo) ? current.filter((item) => item !== ammo) : [...current, ammo],
    );
  }

  return (
    <>
      <Toaster theme="dark" position="top-center" richColors closeButton />
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
              <button type="button" onClick={() => void writeFiles([selected], "selected")}>
                Для этой техники
              </button>
              <button type="button" onClick={() => void writeFiles(visible, "filter")}>
                По фильтру ({visible.length})
              </button>
              <button type="button" onClick={() => void writeFiles(catalog.tanks, "all")}>
                Для всей техники
              </button>
            </div>
          </>
        ) : (
          <p>Нет техники в фильтре.</p>
        )}

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
    </>
  );
}
