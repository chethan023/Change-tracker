import { create } from "zustand";
import type { ChangeRecord } from "../lib/types";

interface ShellState {
  // Command palette
  commandOpen: boolean;
  openCommand: () => void;
  closeCommand: () => void;

  // Diff viewer
  diffRecord: ChangeRecord | null;
  diffSiblings: ChangeRecord[];
  openDiff: (r: ChangeRecord, siblings?: ChangeRecord[]) => void;
  closeDiff: () => void;
  stepDiff: (dir: -1 | 1) => void;
}

export const useAppShell = create<ShellState>((set, get) => ({
  commandOpen: false,
  openCommand: () => set({ commandOpen: true }),
  closeCommand: () => set({ commandOpen: false }),

  diffRecord: null,
  diffSiblings: [],
  openDiff: (r, siblings = []) => set({ diffRecord: r, diffSiblings: siblings }),
  closeDiff: () => set({ diffRecord: null, diffSiblings: [] }),
  stepDiff: (dir) => {
    const { diffRecord, diffSiblings } = get();
    if (!diffRecord) return;
    const i = diffSiblings.findIndex((r) => r.id === diffRecord.id);
    const next = diffSiblings[i + dir];
    if (next) set({ diffRecord: next });
  },
}));
