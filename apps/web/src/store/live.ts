// Live connection state for the top bar, and the per-viewer "show live toasts" switch.
import { create } from 'zustand';

export type LiveStatus = 'connecting' | 'live' | 'offline';

const TOASTS_KEY = 'nural.liveToasts';

function readToastsPref(): boolean {
  try {
    return localStorage.getItem(TOASTS_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface LiveState {
  status: LiveStatus;
  /** Time of the last change received from Bitrix24 (ISO string). */
  lastChangeAt: string | null;
  toastsEnabled: boolean;
  setStatus: (s: LiveStatus) => void;
  changed: (at: string) => void;
  setToastsEnabled: (on: boolean) => void;
}

export const useLive = create<LiveState>((set) => ({
  status: 'connecting',
  lastChangeAt: null,
  toastsEnabled: readToastsPref(),
  setStatus: (status) => set({ status }),
  changed: (at) => set({ lastChangeAt: at }),
  setToastsEnabled: (on) => {
    try {
      localStorage.setItem(TOASTS_KEY, on ? 'on' : 'off');
    } catch {
      // Storage blocked: the switch still works for this visit.
    }
    set({ toastsEnabled: on });
  },
}));
