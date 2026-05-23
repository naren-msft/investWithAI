import { promises as fs } from "node:fs";
import path from "node:path";

// Tiny persisted store for regime hysteresis state. One JSON object on disk;
// rewritten on every pipeline run when the raw regime is computed. Lives
// alongside data/executions.json (gitignored).

export interface RegimeHysteresisState {
  currentRegime: string;
  pendingRegime: string | null;
  pendingDays: number;
  lastUpdatedDate: string; // YYYY-MM-DD — used to detect missing days
}

const FILE = path.join(process.cwd(), "data", "regime-state.json");

const DEFAULT: RegimeHysteresisState = {
  currentRegime: "neutral",
  pendingRegime: null,
  pendingDays: 0,
  lastUpdatedDate: "",
};

async function ensureFile(): Promise<void> {
  try {
    await fs.access(FILE);
  } catch {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(DEFAULT, null, 2), "utf8");
  }
}

export async function readHysteresis(): Promise<RegimeHysteresisState> {
  await ensureFile();
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const j = JSON.parse(raw);
    return {
      currentRegime: typeof j.currentRegime === "string" ? j.currentRegime : DEFAULT.currentRegime,
      pendingRegime: typeof j.pendingRegime === "string" ? j.pendingRegime : null,
      pendingDays: Number.isFinite(j.pendingDays) ? j.pendingDays : 0,
      lastUpdatedDate: typeof j.lastUpdatedDate === "string" ? j.lastUpdatedDate : "",
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function writeHysteresis(state: RegimeHysteresisState): Promise<void> {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
}

// Pure update function. Returns next state + the effective regime.
//   - rawRegime:    today's raw classification (no smoothing)
//   - todayDate:    today's date YYYY-MM-DD
//   - entryDwell:   confirming days required to enter Rally / Neutral (default 3)
//   - exitStressDwell: confirming days required to exit Pullback / Correction (default 5)
//   - stressEnterDwell: confirming days required to enter Pullback / Correction (default 2; fast into protection)
//
// Logic:
//   - If rawRegime equals currentRegime: reset pending, no change.
//   - Else if rawRegime equals pendingRegime: increment pending; if it crosses
//     the dwell threshold, accept the new regime.
//   - Else: rawRegime becomes the new pending with 1 day count.
export function applyHysteresis(
  prev: RegimeHysteresisState,
  rawRegime: string,
  todayDate: string,
  opts: { entryDwell?: number; exitStressDwell?: number; stressEnterDwell?: number } = {},
): { state: RegimeHysteresisState; effective: string } {
  const entryDwell = opts.entryDwell ?? 3;
  const exitStressDwell = opts.exitStressDwell ?? 5;
  const stressEnterDwell = opts.stressEnterDwell ?? 2;

  const isStress = (r: string) => r === "pullback" || r === "correction";

  // Determine the dwell required for THIS proposed transition
  const dwellRequired = (() => {
    const exitingStress = isStress(prev.currentRegime) && !isStress(rawRegime);
    const enteringStress = !isStress(prev.currentRegime) && isStress(rawRegime);
    if (exitingStress) return exitStressDwell;
    if (enteringStress) return stressEnterDwell;
    return entryDwell;
  })();

  if (rawRegime === prev.currentRegime) {
    return {
      state: {
        ...prev,
        pendingRegime: null,
        pendingDays: 0,
        lastUpdatedDate: todayDate,
      },
      effective: prev.currentRegime,
    };
  }

  if (rawRegime === prev.pendingRegime) {
    const newPending = prev.pendingDays + 1;
    if (newPending >= dwellRequired) {
      return {
        state: {
          currentRegime: rawRegime,
          pendingRegime: null,
          pendingDays: 0,
          lastUpdatedDate: todayDate,
        },
        effective: rawRegime,
      };
    }
    return {
      state: {
        ...prev,
        pendingDays: newPending,
        lastUpdatedDate: todayDate,
      },
      effective: prev.currentRegime,
    };
  }

  return {
    state: {
      ...prev,
      pendingRegime: rawRegime,
      pendingDays: 1,
      lastUpdatedDate: todayDate,
    },
    effective: prev.currentRegime,
  };
}
