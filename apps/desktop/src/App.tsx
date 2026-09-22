import { useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import bundledCatalog from "@catalog";
import {
  AMMO_CLASSES,
  COUNTRY_ORDER,
  countryFromUnitId,
  countryFlag,
  emptySightModel,
  generateTankSights,
  mergeCatalogs,
  parseTankCrosshairs,
  setTankCrosshair,
  sightFromZoom,
  type AmmoClass,
  type CatalogTank,
} from "@wt_sights_editor/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Toaster, toast } from "sonner";
import { SightPreview } from "./SightPreview";
import {
  catalogStamp,
  ENABLED_LOCALES,
  parseLocale,
  tankDisplayName,
  translate,
  type LocaleId,
  useT,
} from "./i18n";

type Written = { count: number; root: string };

type AppSettings = {
  version: number;
  userSightsPath?: string | null;
  locale?: LocaleId | null;
};

type LoadedAppSettings = AppSettings & {
  userSightsPathExists: boolean;
};

function isAmmoClass(value: string | undefined): value is AmmoClass {
  return AMMO_CLASSES.includes(value as AmmoClass);
}

type WriteScope = "selected" | "filter" | "all";

const RELEASES_URL = "https://github.com/ath31st/wt_sights_editor/releases";

const HINT_VISIBLE_MS = 8000;
const HINT_EXIT_MS = 300;

function useTimedHint() {
  const [token, setToken] = useState(0);
  const [phase, setPhase] = useState<"off" | "in" | "out">("off");

  function show() {
    setToken((n) => n + 1);
    setPhase("in");
  }

  useEffect(() => {
    if (token === 0) {
      return;
    }
    const hideTimer = window.setTimeout(() => setPhase("out"), HINT_VISIBLE_MS);
    const offTimer = window.setTimeout(() => setPhase("off"), HINT_VISIBLE_MS + HINT_EXIT_MS);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(offTimer);
    };
  }, [token]);

  return { show, token, open: phase !== "off", leaving: phase === "out" };
}

export default function App() {
  const { locale, setLocale, t, tp, countryLabel } = useT();
  const [userTanks, setUserTanks] = useState<CatalogTank[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ version: 1, locale });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const settingsLoadedRef = useRef(false);
  const pendingPatchRef = useRef<Partial<AppSettings>>({});
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
  const applyHint = useTimedHint();
  const generateHint = useTimedHint();
  const [appVersion, setAppVersion] = useState("");

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
  const hasSights = Boolean(selected && selected.sights.length > 0);
  const resolvedPreview: AmmoClass | null = !selected || !hasSights
    ? null
    : (previewTankId === selected.id &&
      previewAmmo &&
      selected.sights.includes(previewAmmo)
        ? previewAmmo
        : undefined) ??
      (isAmmoClass(assigned) && selected.sights.includes(assigned) ? assigned : undefined) ??
      selected.sights[0] ??
      null;

  const previewModel = useMemo(() => {
    if (!selected || !resolvedPreview) {
      return emptySightModel();
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
    void getVersion()
      .then(setAppVersion)
      .catch(() => {
        setAppVersion("");
      });
  }, []);

  useEffect(() => {
    void (async () => {
      let currentLocale = locale;
      try {
        const loaded = await invoke<LoadedAppSettings>("load_app_settings");
        const pending = pendingPatchRef.current;
        currentLocale = parseLocale(pending.locale) ?? parseLocale(loaded.locale) ?? currentLocale;
        if (currentLocale !== locale) {
          setLocale(currentLocale);
        }
        const next: AppSettings = {
          version: loaded.version || 1,
          userSightsPath: pending.userSightsPath ?? loaded.userSightsPath,
          locale: currentLocale,
        };
        settingsRef.current = next;
        setSettings(next);
        settingsLoadedRef.current = true;
        pendingPatchRef.current = {};
        if (pending.locale || pending.userSightsPath || !parseLocale(loaded.locale)) {
          await invoke("save_app_settings", { settings: next });
        }
        const saved = next.userSightsPath;
        if (saved && !pending.userSightsPath) {
          if (!loaded.userSightsPathExists) {
            toast.warning(translate(currentLocale, "savedUserSightsMissing"), {
              description: translate(currentLocale, "pickFolderAgain"),
            });
          } else {
            setRoot(saved);
            try {
              const found = await loadGlobalFromUserSights(saved);
              if (!found) {
                toast.warning(translate(currentLocale, "globalBlkNotFound"));
              }
            } catch (err: unknown) {
              toast.error(translate(currentLocale, "openUserSightsFailed"), {
                description: String(err),
              });
            }
          }
        }
      } catch (err: unknown) {
        settingsLoadedRef.current = true;
        toast.error(translate(currentLocale, "loadSettingsFailed"), {
          description: String(err),
        });
      }

      try {
        setUserTanks(await invoke<CatalogTank[]>("load_user_extras"));
      } catch (err: unknown) {
        toast.error(translate(currentLocale, "loadUserTanksFailed"), {
          description: String(err),
        });
      }
    })();
    // Detected locale and setLocale are stable for the first paint; settings own the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistSettings(patch: Partial<AppSettings>) {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    if (!settingsLoadedRef.current) {
      return;
    }
    pendingPatchRef.current = {};
    await invoke("save_app_settings", { settings: next });
  }

  function changeLocale(next: LocaleId) {
    setLocale(next);
    void persistSettings({ locale: next });
  }

  async function pickFolder() {
    const dir = await open({
      directory: true,
      defaultPath: root || undefined,
      title: t("pickUserSightsTitle"),
    });
    if (typeof dir === "string") {
      setRoot(dir);
      try {
        await persistSettings({ userSightsPath: dir });
        const found = await loadGlobalFromUserSights(dir);
        if (found) {
          toast.success(t("userSightsPicked"), { description: dir });
        } else {
          toast.warning(t("folderPickedNoGlobal"), { description: dir });
        }
      } catch (err: unknown) {
        toast.error(t("openUserSightsFailed"), { description: String(err) });
      }
    }
  }

  async function persistExtras(next: CatalogTank[]) {
    setUserTanks(next);
    await invoke("save_user_extras", { tanks: next });
  }

  async function writeFiles(tanks: CatalogTank[], scope: WriteScope) {
    if (!root) {
      toast.warning(t("pickUserSightsFirst"));
      return;
    }
    if (tanks.length === 0) {
      toast.warning(t("noTanksToGenerate"));
      return;
    }
    const generatable = tanks.filter((tank) => tank.sights.length > 0);
    if (generatable.length === 0) {
      toast.warning(scope === "selected" ? t("noSights") : t("noTanksWithSights"));
      return;
    }
    const files = generatable.flatMap((tank) =>
      generateTankSights(tank, tank.sights, fontOverride ?? undefined),
    );
    const loading =
      scope === "selected"
        ? t("writingSightsForTank", { name: tankDisplayName(tanks[0], locale) })
        : scope === "filter"
          ? t("writingSightsForFilter")
          : t("writingSightsForAll");
    const toastId = toast.loading(loading);
    try {
      const result = await invoke<Written>("write_sight_files", {
        root,
        files,
      });
      generateHint.show();
      const fileCount = tp("filesCount", result.count);
      const vehicleCount = tp("vehiclesCount", generatable.length);
      if (scope === "selected") {
        toast.success(t("sightsWritten"), {
          id: toastId,
          description: `${tankDisplayName(tanks[0], locale)} · ${fileCount}`,
        });
        return;
      }
      if (scope === "filter") {
        const parts: string[] = [];
        if (country !== "all") {
          parts.push(countryLabel(country));
        }
        const q = query.trim();
        if (q) {
          parts.push(t("quotedQuery", { query: q }));
        }
        parts.push(vehicleCount, fileCount);
        toast.success(t("sightsWrittenFilter"), {
          id: toastId,
          description: parts.join(" · "),
        });
        return;
      }
      toast.success(t("sightsWrittenAll"), {
        id: toastId,
        description: `${vehicleCount} · ${fileCount}`,
      });
    } catch (err: unknown) {
      toast.error(t("writeSightsFailed"), {
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
      toast.warning(t("pickUserSightsFirst"));
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
        toast.warning(t("globalBlkNotFound"), {
          description: created
            ? t("globalBlkWrittenCannotAssign", {
                name: tankDisplayName(tank, locale),
                ammo,
              })
            : t("cannotAssignSight"),
        });
        return;
      }
      const text = await invoke<string>("read_text_file", { path: globalBlkPath });
      const next = setTankCrosshair(text, tank.id, ammo);
      await invoke("write_global_blk", { path: globalBlkPath, contents: next });
      setCrosshairs(Object.fromEntries(parseTankCrosshairs(next)));
      applyHint.show();
      toast.success(created ? t("sightWrittenAndAssigned") : t("sightAssigned"), {
        description: t("sightAssignedTo", { name: tankDisplayName(tank, locale), ammo }),
      });
    } catch (err: unknown) {
      toast.error(t("assignSightFailed"), { description: String(err) });
    }
  }

  function addManualTank() {
    const id = newId.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]+$/.test(id)) {
      toast.warning(t("invalidId"), {
        description: t("invalidIdHint"),
      });
      return;
    }
    const zoomMin = Number(newZoomMin);
    const zoomMax = Number(newZoomMax);
    if (!Number.isFinite(zoomMin) || !Number.isFinite(zoomMax)) {
      toast.warning(t("zoomMustBeNumber"));
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
        toast.success(t("tankAdded"), {
          description: t("tankAddedHint", { name: tankDisplayName(tank, locale), id }),
        });
      })
      .catch((err: unknown) =>
        toast.error(t("saveTankFailed"), { description: String(err) }),
      );
  }

  function toggleNewSight(ammo: AmmoClass) {
    setNewSights((current) =>
      current.includes(ammo) ? current.filter((item) => item !== ammo) : [...current, ammo],
    );
  }

  const catalogLine = catalogStamp(catalog, locale);

  return (
    <>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
      <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-row">
            <strong>WT Sights Editor</strong>
            <div className="lang-switch" role="group" aria-label={t("language")}>
              {ENABLED_LOCALES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={locale === item.id ? "active" : ""}
                  aria-pressed={locale === item.id}
                  onClick={() => changeLocale(item.id)}
                >
                  {item.nativeLabel}
                </button>
              ))}
            </div>
          </div>
          <div className="brand-row">
            <p className="brand-patch">
              {appVersion ? (
                <a
                  className="brand-version"
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    void openUrl(RELEASES_URL);
                  }}
                >
                  {appVersion}
                </a>
              ) : null}
              {appVersion && catalogLine ? " · " : null}
              {catalogLine}
            </p>
            <span className="brand-count">{tp("catalogTankCount", catalog.tanks.length)}</span>
          </div>
        </header>
        <button type="button" onClick={() => void pickFolder()}>
          {t("pickUserSights")}
        </button>
        <p className="path">{root || t("folderNotPicked")}</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <div className="countries">
          <button
            type="button"
            className={country === "all" ? "active" : ""}
            onClick={() => setCountry("all")}
          >
            <span className="flag">🌍</span> {t("countryAll")}
          </button>
          {countries.map((code) => (
            <button
              key={code}
              type="button"
              className={country === code ? "active" : ""}
              onClick={() => setCountry(code)}
            >
              <span className="flag">{countryFlag(code)}</span> {countryLabel(code)}
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
                <span>{tankDisplayName(tank, locale)}</span>
                <small>{tank.id}</small>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="preview-pane">
        <SightPreview model={previewModel} t={t} />
        {generateHint.open || applyHint.open ? (
          <div className="preview-hints">
            {generateHint.open ? (
              <p
                key={generateHint.token}
                className={`preview-hint warn${generateHint.leaving ? " leaving" : ""}`}
              >
                {t("generateHint")}
              </p>
            ) : null}
            {applyHint.open ? (
              <p
                key={applyHint.token}
                className={`preview-hint warn${applyHint.leaving ? " leaving" : ""}`}
              >
                {t("applyHint")}
              </p>
            ) : null}
          </div>
        ) : null}
      </main>

      <section className="inspector">
        {selected ? (
          <>
            <h2>{tankDisplayName(selected, locale)}</h2>
            <p className="muted">
              {selected.id} · {countryLabel(selected.country)} · {selected.zoomMin}x–
              {selected.zoomMax}x
            </p>
            <p className="muted">{t("ammo")}</p>
            {selected.sights.length === 0 ? (
              <p className="muted">{t("noSights")}</p>
            ) : (
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
            )}
            {globalBlkPath ? (
              <p className="muted">
                {assigned
                  ? t("globalBlkAssigned", { id: selected.id, ammo: assigned })
                  : t("globalBlkNoEntry", { id: selected.id })}
              </p>
            ) : null}
            {previewModel.layout !== "none" ? (
            <label>
              {t("font")}
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
            ) : null}
            <h3>{t("generateSights")}</h3>
            <div className="actions">
              <button
                type="button"
                disabled={selected.sights.length === 0}
                onClick={() => void writeFiles([selected], "selected")}
              >
                {t("generateForThisTank")}
              </button>
              <button type="button" onClick={() => void writeFiles(visible, "filter")}>
                {t("generateForFilter", { n: visible.length })}
              </button>
              <button type="button" onClick={() => void writeFiles(catalog.tanks, "all")}>
                {t("generateForAll")}
              </button>
            </div>
          </>
        ) : (
          <p>{t("noTanksInFilter")}</p>
        )}

        <h3>{t("addTankManually")}</h3>
        <label>
          {t("unitId")}
          <input value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="ussr_t_72b3_arena" />
        </label>
        <label>
          {t("name")}
          <input value={newName} onChange={(event) => setNewName(event.target.value)} />
        </label>
        <div className="row">
          <label>
            {t("zoomMin")}
            <input value={newZoomMin} onChange={(event) => setNewZoomMin(event.target.value)} />
          </label>
          <label>
            {t("zoomMax")}
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
          {t("save")}
        </button>
      </section>
      </div>
    </>
  );
}
