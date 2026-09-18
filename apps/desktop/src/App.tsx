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
  sightFromZoom,
  type AmmoClass,
  type CatalogTank,
} from "@wt_sights_editor/core";
import { SightPreview } from "./SightPreview";

type Written = { count: number; root: string };

export default function App() {
  const [userTanks, setUserTanks] = useState<CatalogTank[]>([]);
  const [root, setRoot] = useState<string>("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string>("");
  const [fontOverride, setFontOverride] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [presetWarning, setPresetWarning] = useState("");
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

  const previewAmmo = selected?.sights[0] ?? "AP";
  const previewModel = useMemo(() => {
    if (!selected) {
      return sightFromZoom("AP", 6, {}, 6);
    }
    return sightFromZoom(
      previewAmmo,
      selected.zoomMax,
      {
        fontSizeMult: fontOverride ?? undefined,
      },
      selected.zoomMin,
    );
  }, [selected, previewAmmo, fontOverride]);

  useEffect(() => {
    invoke<CatalogTank[]>("load_user_extras")
      .then(setUserTanks)
      .catch((err: unknown) => setStatus(String(err)));
  }, []);

  useEffect(() => {
    if (!root) {
      setPresetWarning("");
      return;
    }
    invoke<string | null>("read_preset_crosshair", { usersightsRoot: root })
      .then((name) => {
        if (!name) {
          setPresetWarning("");
          return;
        }
        setPresetWarning(
          `В игре сейчас выбран прицел «${name}». После генерации выбери AP / HEAT / APDS / HE в списке прицелов.`,
        );
      })
      .catch(() => setPresetWarning(""));
  }, [root]);

  async function pickFolder() {
    const dir = await open({ directory: true, title: "Папка UserSights" });
    if (typeof dir === "string") {
      setRoot(dir);
      setStatus(`Папка: ${dir}`);
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
            <p>Снаряды: {selected.sights.join(", ")}</p>
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
            <div className="actions">
              <button type="button" onClick={() => void writeFiles([selected])}>
                Создать этот танк
              </button>
              <button type="button" onClick={() => void writeFiles(visible)}>
                Создать видимые ({visible.length})
              </button>
              <button type="button" onClick={() => void writeFiles(catalog.tanks)}>
                Создать все
              </button>
            </div>
          </>
        ) : (
          <p>Нет танков в фильтре.</p>
        )}

        {presetWarning ? <p className="warn">{presetWarning}</p> : null}
        {status ? <p className="status">{status}</p> : null}

        <h3>Добавить танк вручную</h3>
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
