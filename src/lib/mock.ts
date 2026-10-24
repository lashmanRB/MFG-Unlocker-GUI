import type {
  ApplyResult,
  AutoUpdateReport,
  CompatReport,
  ExeCandidate,
  GameEntry,
  GameSettings,
  InstallInfo,
  LogFile,
  ReleaseInfo,
  ScanResult,
  StatusSummary,
  UpdatedGame,
} from "./types";

const now = Math.floor(Date.now() / 1000);

// flip these while checking the empty, error and warning states in a browser
interface MockFlags {
  hideSteam: boolean;
  hideGames: boolean;
  scanDelayMs: number;
  scanErrors: string[];
  settingsWarnings: string[];
  writeFails: boolean;
  autoUpdateGames: string[];
  autoUpdateFailed: string[];
  autoUpdateDownloaded: boolean;
}

export const mockFlags: MockFlags = {
  hideSteam: false,
  hideGames: false,
  scanDelayMs: 0,
  scanErrors: [],
  settingsWarnings: [],
  writeFails: false,
  autoUpdateGames: [],
  autoUpdateFailed: [],
  autoUpdateDownloaded: false,
};

const baseCompat: CompatReport = {
  state: "supported",
  hasFrameGen: true,
  hasStreamline: true,
  hasSuperRes: true,
  hasVulkan: false,
  hasOptiScaler: false,
  notes: [],
};

function exeCandidate(dir: string, name: string, sizeBytes = 84_000_000): ExeCandidate {
  return { path: `${dir}\\${name}.exe`, name: `${name}.exe`, sizeBytes };
}

interface GameSeed {
  appId: number | null;
  name: string;
  source?: "steam" | "manual";
  installDir: string;
  workDir?: string;
  exeCandidates?: ExeCandidate[];
  headerUrl?: string | null;
  libraryPath?: string | null;
  sizeOnDisk?: number | null;
  compat?: Partial<CompatReport>;
  install?: InstallInfo | null;
}

function makeGame(seed: GameSeed): GameEntry {
  const workDir = seed.workDir ?? seed.installDir;
  const candidates = seed.exeCandidates ?? [exeCandidate(workDir, seed.name)];
  return {
    id: `game:${seed.installDir.toLowerCase()}`,
    name: seed.name,
    source: seed.source ?? "steam",
    appId: seed.appId,
    installDir: seed.installDir,
    workDir,
    exePath: candidates[0]?.path ?? null,
    exeCandidates: candidates,
    compat: { ...baseCompat, ...seed.compat },
    install: seed.install ?? null,
    headerUrl:
      seed.headerUrl === undefined
        ? seed.appId === null
          ? null
          : `https://cdn.akamai.steamstatic.com/steam/apps/${seed.appId}/header.jpg`
        : seed.headerUrl,
    sizeOnDisk: seed.sizeOnDisk === undefined ? 74_000_000_000 : seed.sizeOnDisk,
    libraryPath: seed.libraryPath === undefined ? "D:\\SteamLibrary" : seed.libraryPath,
  };
}

const cyberpunkDir = "D:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077";
const liesDir = "D:\\SteamLibrary\\steamapps\\common\\Lies of P";
const liesWorkDir = `${liesDir}\\LiesofP\\Binaries\\Win64`;
const re4Dir = "D:\\SteamLibrary\\steamapps\\common\\Resident Evil 4";
const clairDir = "D:\\SteamLibrary\\steamapps\\common\\Clair Obscur Expedition 33";
const mhwDir = "D:\\SteamLibrary\\steamapps\\common\\Monster Hunter Wilds";

const cyberpunk = makeGame({
  appId: 1091500,
  name: "Cyberpunk 2077",
  installDir: cyberpunkDir,
  exeCandidates: [exeCandidate(cyberpunkDir, "Cyberpunk2077"), exeCandidate(cyberpunkDir, "REDprelauncher", 21_400_000)],
  compat: {
    notes: ["Frame generation files came from the 2.3 patch, DLSS-G 310.9.16 detected"],
  },
  install: {
    dllName: "winmm.dll",
    version: "v1.6.1",
    sha256: "abe4d6ae7eab1ea4cacc4775b05521c459516ed72f434784e4420080571e87c5",
    binkBackup: null,
    installedAt: now - 86_400,
    previous: null,
  },
});

const liesOfP = makeGame({
  appId: 1627720,
  name: "Lies of P",
  installDir: liesDir,
  workDir: liesWorkDir,
  exeCandidates: [
    exeCandidate(liesWorkDir, "LiesOfP-Win64-Shipping", 128_400_000),
    exeCandidate(liesWorkDir, "LiesOfP", 96_200_000),
  ],
  install: {
    dllName: "bink2w64.dll",
    version: "v1.5.4",
    sha256: "3c9b1f0e58a2d4477ae1b90c2f7d5e8a6b4c1d2e3f405162738495a6b7c8d9e0",
    binkBackup: "bink2w64Hooked.dll",
    installedAt: now - 6 * 86_400,
    previous: {
      version: "v1.5.2",
      sha256: "8d2f4a6c0e1b3579adf8c2e4b6d80123456789abcdef0123456789abcdef01234",
      path: `${liesWorkDir}\\bink2w64.previous.dll`,
    },
  },
});

const games: GameEntry[] = [
  cyberpunk,
  liesOfP,
  makeGame({
    appId: 1086940,
    name: "Baldur's Gate 3",
    installDir: "D:\\SteamLibrary\\steamapps\\common\\Baldurs Gate 3",
    compat: { state: "no-frame-gen", hasFrameGen: false, hasStreamline: false },
  }),
  makeGame({
    appId: 2050650,
    name: "Resident Evil 4",
    installDir: re4Dir,
    exeCandidates: [exeCandidate(re4Dir, "re4", 66_000_000), exeCandidate(re4Dir, "re_chunk_000", 310_000_000)],
    compat: { state: "likely", hasStreamline: false },
  }),
  makeGame({
    appId: 1903340,
    name: "Clair Obscur: Expedition 33",
    installDir: clairDir,
    compat: { state: "unknown", hasFrameGen: false, hasStreamline: false },
  }),
  makeGame({
    appId: 2246340,
    name: "Monster Hunter Wilds",
    installDir: mhwDir,
    compat: { hasOptiScaler: true, notes: ["OptiScaler present in the game folder"] },
  }),
];

const manualGames: GameEntry[] = [
  makeGame({
    appId: null,
    name: "Trepang2",
    source: "manual",
    installDir: "E:\\Games\\Trepang2",
    libraryPath: null,
    sizeOnDisk: null,
    headerUrl: null,
    compat: { state: "likely", hasFrameGen: true, hasStreamline: false },
  }),
];

function allGames(): GameEntry[] {
  return [...games, ...manualGames];
}

function findGame(gameId: string): GameEntry | undefined {
  return allGames().find((item) => item.id === gameId);
}

const baseSettings: GameSettings = {
  mode: "fixed",
  multiplier: 4,
  dynamicTargetFrameRate: 0,
  dynamicLockToRefreshRate: true,
  dynamicCustomTargetFrameRate: 120,
  dlssgPreset: 2,
  dlssSrPreset: 0,
  dlssRrPreset: 0,
  vsyncMode: 0,
  reflexFrameLimitFps: 0,
  generatedOnlyDebug: false,
  intervalLogging: false,
  language: "auto",
  toggleKey: "",
  pinnedFps: false,
  layoutScale: "",
  rtx30FlipMetering: null,
  gpuNameOverride: false,
  hasControlFile: true,
  hasIniFile: true,
};

const storedSettings = new Map<string, GameSettings>();
const seededSettings = new Map<string, Partial<GameSettings>>([
  [liesOfP.id, { mode: "dynamic", multiplier: 5, toggleKey: "F8", pinnedFps: true }],
]);

const cyberpunkStatus: StatusSummary = {
  ageSeconds: 4,
  pid: 8812,
  protocolVersion: 40,
  gpuFamily: 1,
  graphicsApi: 1,
  bridgeReady: true,
  gameFrameGenerationOn: true,
  appliedFrameGenerationOn: true,
  desiredMultiplier: 4,
  appliedMultiplier: 4,
  dynamicMode: false,
  safeMaximumMultiplier: 6,
  nvidiaProfileName: "Cyberpunk 2077",
  nvidiaTier: 6,
  realFps: 58.4,
  dlssFps: 233.6,
  lastSetOptionsResult: 0,
  patchRoute: "dx12",
};

const liesStatus: StatusSummary = {
  ageSeconds: 260,
  pid: 11920,
  protocolVersion: 40,
  gpuFamily: 1,
  graphicsApi: 1,
  bridgeReady: false,
  gameFrameGenerationOn: true,
  appliedFrameGenerationOn: true,
  desiredMultiplier: 6,
  appliedMultiplier: 5,
  dynamicMode: true,
  safeMaximumMultiplier: 6,
  nvidiaProfileName: "Lies of P",
  nvidiaTier: 2,
  realFps: 71.2,
  dlssFps: 284.8,
  lastSetOptionsResult: 5,
  patchRoute: "dx12",
};

const statusByGame = new Map<string, StatusSummary>([
  [cyberpunk.id, cyberpunkStatus],
  [liesOfP.id, liesStatus],
]);

const release: ReleaseInfo = {
  tag: "v1.6.1",
  name: "Universal MFG Unlocker - V1.6.1",
  publishedAt: "2026-10-20T00:55:17Z",
  assetName: "MFGUnlocker-v1.6.1.zip",
  sizeBytes: 2_713_094,
  sha256: "abe4d6ae7eab1ea4cacc4775b05521c459516ed72f434784e4420080571e87c5",
  downloadUrl:
    "https://github.com/dashdogy/MFG-Unlocker/releases/download/v1.6.1/MFGUnlocker-v1.6.1.zip",
  pageUrl: "https://github.com/dashdogy/MFG-Unlocker/releases/tag/v1.6.1",
  cachedVersion: "v1.6.1",
  cachedDllPath: "C:\\Users\\lashm\\AppData\\Roaming\\MFG Unlocker GUI\\release\\v1.6.1\\MFGUnlocker.dll",
};

const fallbackLog = "[RTXMFG] log text is not available\n";
const logContents = new Map<string, string>();

function logsFor(game: GameEntry): LogFile[] {
  if (!game.install) return [];
  const install = game.install;
  const runtime = storedSettings.get(game.id) ?? { ...baseSettings, ...seededSettings.get(game.id) };
  const stem = game.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "game";
  const hash = "9A3F2C5D1B4E6A80";
  const files: LogFile[] = [
    {
      path: `${game.workDir}\\RTXMFG-${stem}-${hash}.log`,
      name: `RTXMFG-${stem}-${hash}.log`,
      sizeBytes: 48_210,
      modified: now - 300,
    },
    {
      path: `${game.workDir}\\RTXMFG-${stem}-${hash}.previous.log`,
      name: `RTXMFG-${stem}-${hash}.previous.log`,
      sizeBytes: 91_554,
      modified: now - 90_000,
    },
  ];

  const current = [
    `[RTXMFG universal] ${install.version ?? "unknown"} starting`,
    `route=dx12 proxy=${install.dllName}`,
    "streamline host 2.9.1 found beside game executable",
    "provider nvngx_dlssg.dll 310.9.16 certified",
    `control file read: mode=${runtime.mode} multiplier=${runtime.multiplier} preset=${runtime.dlssgPreset}`,
    `setOptions ${runtime.multiplier}x accepted, frames to generate max=${runtime.multiplier}`,
    "present interval 1, flip metering on",
    ...(install.binkBackup === null ? [] : [`bink backup kept as ${install.binkBackup}`]),
    "status heartbeat written, protocol 40",
  ].join("\n");

  const previous = [
    `[RTXMFG universal] ${install.version ?? "unknown"} starting`,
    `route=dx12 proxy=${install.dllName}`,
    "streamline host 2.9.1 found beside game executable",
    "provider nvngx_dlssg.dll 310.9.16 certified",
    "control file read: mode=fixed multiplier=3 preset=B",
    "setOptions error: provider refused 3x, falling back to 4x",
    "present interval 1, flip metering on",
    "status heartbeat written, protocol 40",
  ].join("\n");

  logContents.set(files[0].path, current);
  logContents.set(files[1].path, previous);
  return files;
}

export const mock = {
  scanAll: async (): Promise<ScanResult> => {
    if (mockFlags.scanDelayMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, mockFlags.scanDelayMs);
      });
    }
    return {
      scan: {
        steamPath: mockFlags.hideSteam ? null : "C:\\Program Files (x86)\\Steam",
        libraries: mockFlags.hideSteam
          ? []
          : [
              { path: "C:\\Program Files (x86)\\Steam", label: "Steam" },
              { path: "D:\\SteamLibrary", label: "D:\\SteamLibrary" },
            ],
        games: mockFlags.hideGames ? [] : games.map((game) => ({ ...game })),
        errors: [...mockFlags.scanErrors],
      },
      manual: mockFlags.hideGames ? [] : manualGames.map((game) => ({ ...game })),
      gpu: { name: "NVIDIA GeForce RTX 4080", family: "ada", maxMultiplier: 6 },
    };
  },

  rescanGame: (gameId: string): Promise<GameEntry> => {
    const found = findGame(gameId);
    return found ? Promise.resolve({ ...found }) : Promise.reject(new Error("Unknown game"));
  },

  addManualGame: (path: string): Promise<GameEntry> => {
    const id = `game:${path.toLowerCase()}`;
    const existing = findGame(id);
    if (existing) return Promise.resolve({ ...existing });
    const trimmed = path.replace(/[\\/]+$/, "");
    const name = trimmed.split(/[\\/]/).pop() ?? "Manual game";
    const entry = makeGame({
      appId: null,
      name,
      source: "manual",
      installDir: trimmed,
      libraryPath: null,
      sizeOnDisk: null,
      headerUrl: null,
      compat: { state: "likely", hasFrameGen: true, hasStreamline: false },
    });
    manualGames.push(entry);
    return Promise.resolve({ ...entry });
  },

  forgetGame: (gameId: string): Promise<void> => {
    const index = manualGames.findIndex((game) => game.id === gameId);
    if (index >= 0) manualGames.splice(index, 1);
    return Promise.resolve();
  },

  setGameExe: (gameId: string, exePath: string): Promise<GameEntry> => {
    const found = findGame(gameId);
    if (!found) return Promise.reject(new Error("Unknown game"));
    const cut = exePath.lastIndexOf("\\");
    found.exePath = exePath;
    if (cut > 0) found.workDir = exePath.slice(0, cut);
    return Promise.resolve({ ...found });
  },

  installMod: (gameId: string, dllName: string, bink: boolean): Promise<InstallInfo> => {
    const found = findGame(gameId);
    if (!found) return Promise.reject(new Error("Unknown game"));
    const prior = found.install;
    const info: InstallInfo = {
      dllName,
      version: release.tag,
      sha256: release.sha256 ?? "",
      binkBackup: bink ? `${dllName.replace(/\.dll$/i, "")}Hooked.dll` : null,
      installedAt: Math.floor(Date.now() / 1000),
      previous:
        prior === null
          ? null
          : {
              version: prior.version,
              sha256: prior.sha256,
              path: `${found.workDir}\\${prior.dllName.replace(/\.dll$/i, "")}.previous.dll`,
            },
    };
    found.install = info;
    return Promise.resolve({ ...info });
  },

  uninstallMod: (gameId: string): Promise<void> => {
    const found = findGame(gameId);
    if (!found) return Promise.reject(new Error("Unknown game"));
    const prior = found.install;
    if (prior === null) return Promise.resolve();
    found.install =
      prior.previous === null
        ? null
        : {
            dllName: prior.dllName,
            version: prior.previous.version,
            sha256: prior.previous.sha256,
            binkBackup: null,
            installedAt: Math.floor(Date.now() / 1000),
            previous: null,
          };
    return Promise.resolve();
  },

  releaseInfo: (_refresh: boolean): Promise<ReleaseInfo> => Promise.resolve({ ...release }),

  autoUpdate: (_refresh: boolean): Promise<AutoUpdateReport> => {
    const updated: UpdatedGame[] = [];
    for (const name of mockFlags.autoUpdateGames) {
      const found = allGames().find((game) => game.name === name);
      if (!found || found.install === null) continue;
      const prior = found.install;
      if (prior.version === release.tag) continue;
      found.install = {
        dllName: prior.dllName,
        version: release.tag,
        sha256: release.sha256 ?? "",
        binkBackup: prior.binkBackup,
        installedAt: Math.floor(Date.now() / 1000),
        previous: {
          version: prior.version,
          sha256: prior.sha256,
          path: `${found.workDir}\\${prior.dllName.replace(/\.dll$/i, "")}.previous.dll`,
        },
      };
      updated.push({ gameId: found.id, name: found.name, from: prior.version, to: release.tag });
    }
    return Promise.resolve({
      release: { ...release },
      downloaded: mockFlags.autoUpdateDownloaded,
      updated,
      failed: [...mockFlags.autoUpdateFailed],
    });
  },

  readSettings: (gameId: string): Promise<GameSettings> => {
    const stored = storedSettings.get(gameId);
    if (stored) return Promise.resolve({ ...stored });
    return Promise.resolve({ ...baseSettings, ...seededSettings.get(gameId) });
  },

  writeSettings: (gameId: string, next: GameSettings): Promise<ApplyResult> => {
    if (mockFlags.writeFails) {
      return Promise.reject(new Error("The mod folder is not writable"));
    }
    storedSettings.set(gameId, { ...next });
    return Promise.resolve({ ok: true, warnings: [...mockFlags.settingsWarnings] });
  },

  readStatus: (gameId: string): Promise<StatusSummary | null> => {
    const found = findGame(gameId);
    if (!found?.install) return Promise.resolve(null);
    const status = statusByGame.get(gameId) ?? cyberpunkStatus;
    return Promise.resolve({ ...status });
  },

  listLogs: (gameId: string): Promise<LogFile[]> => {
    const found = findGame(gameId);
    return Promise.resolve(found ? logsFor(found) : []);
  },

  readLog: (path: string): Promise<string> => Promise.resolve(logContents.get(path) ?? fallbackLog),

  launchGame: (gameId: string): Promise<void> => {
    const found = findGame(gameId);
    if (!found?.exePath) return Promise.reject(new Error("No executable selected for this game"));
    return Promise.resolve();
  },

  openPath: (path: string): Promise<void> => {
    if (path.length === 0) return Promise.reject(new Error("Empty path"));
    return Promise.resolve();
  },
};
