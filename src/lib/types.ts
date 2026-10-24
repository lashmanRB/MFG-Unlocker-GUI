export interface SteamLibrary {
  path: string;
  label: string;
}

export interface ExeCandidate {
  path: string;
  name: string;
  sizeBytes: number;
}

export type CompatState = "supported" | "likely" | "unknown" | "no-frame-gen";

export interface CompatReport {
  state: CompatState;
  hasFrameGen: boolean;
  hasStreamline: boolean;
  hasSuperRes: boolean;
  hasVulkan: boolean;
  hasOptiScaler: boolean;
  nvidiaTier: number;
  nvidiaName: string | null;
  notes: string[];
}

export interface GpuInfo {
  name: string;
  family: "ada" | "ampere" | "turing" | "blackwell" | "other" | "unknown";
  maxMultiplier: number;
}

export interface PreviousInstall {
  version: string | null;
  sha256: string;
  path: string;
}

export interface ProxyOption {
  name: string;
  state: "free" | "ours" | "bink";
}

export interface InstallInfo {
  dllName: string;
  version: string | null;
  sha256: string;
  binkBackup: string | null;
  installedAt: number;
  previous: PreviousInstall | null;
}

export interface GameEntry {
  id: string;
  name: string;
  source: "steam" | "manual";
  appId: number | null;
  installDir: string;
  workDir: string;
  exePath: string | null;
  exeCandidates: ExeCandidate[];
  compat: CompatReport;
  install: InstallInfo | null;
  headerUrl: string | null;
  sizeOnDisk: number | null;
  libraryPath: string | null;
}

export interface SteamScan {
  steamPath: string | null;
  libraries: SteamLibrary[];
  games: GameEntry[];
  errors: string[];
}

export interface ScanResult {
  scan: SteamScan;
  manual: GameEntry[];
  gpu: GpuInfo;
  nvidiaFetchedAt: number | null;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  assetName: string;
  sizeBytes: number;
  sha256: string | null;
  downloadUrl: string;
  pageUrl: string;
  cachedVersion: string | null;
  cachedDllPath: string | null;
}

export interface UpdatedGame {
  gameId: string;
  name: string;
  from: string | null;
  to: string;
}

export interface AutoUpdateReport {
  release: ReleaseInfo | null;
  downloaded: boolean;
  updated: UpdatedGame[];
  failed: string[];
}

export type MfgMode = "follow" | "fixed" | "dynamic";

export interface GameSettings {
  mode: MfgMode;
  multiplier: number;
  dynamicTargetFrameRate: number;
  dynamicLockToRefreshRate: boolean;
  dynamicCustomTargetFrameRate: number;
  dlssgPreset: number;
  dlssSrPreset: number;
  dlssRrPreset: number;
  vsyncMode: number;
  reflexFrameLimitFps: number;
  generatedOnlyDebug: boolean;
  intervalLogging: boolean;

  language: string;
  toggleKey: string;
  pinnedFps: boolean;
  layoutScale: string;
  rtx30FlipMetering: boolean | null;
  gpuNameOverride: boolean;

  hasControlFile: boolean;
  hasIniFile: boolean;
}

export interface StatusSummary {
  ageSeconds: number;
  pid: number;
  protocolVersion: number;
  gpuFamily: number;
  graphicsApi: number;
  bridgeReady: boolean;
  gameFrameGenerationOn: boolean;
  appliedFrameGenerationOn: boolean;
  desiredMultiplier: number;
  appliedMultiplier: number;
  dynamicMode: boolean;
  safeMaximumMultiplier: number;
  nvidiaProfileName: string;
  nvidiaTier: number;
  realFps: number;
  dlssFps: number;
  lastSetOptionsResult: number;
  patchRoute: string;
}

export interface LogFile {
  path: string;
  name: string;
  sizeBytes: number;
  modified: number;
}

export interface ApplyResult {
  ok: boolean;
  warnings: string[];
}
