import { create } from 'zustand';
import type { Snapshot, DateInfo, ApiStatus, DayData } from '@/types/api';
import { fetchStatus, fetchDates, fetchLatest, fetchDay } from '@/lib/api';

interface AppState {
  // Global data
  currentDate: string;
  availableDates: DateInfo[];
  latestSnapshot: Snapshot | null;
  apiStatus: ApiStatus | null;

  // Day data (full snapshots for replay)
  currentDayData: DayData | null;

  // Replay state
  replayMode: 'replay' | 'live';
  replayIndex: number;
  isPlaying: boolean;
  playSpeed: number;
  currentSnapshot: Snapshot | null;

  // Loading state
  loading: boolean;
  error: string | null;

  // Navigation
  currentPage: string;
  isMobileMenuOpen: boolean;

  // Actions
  setCurrentDate: (date: string) => void;
  setAvailableDates: (dates: DateInfo[]) => void;
  setLatestSnapshot: (snapshot: Snapshot | null) => void;
  setApiStatus: (status: ApiStatus | null) => void;
  togglePlay: () => void;
  setPlaySpeed: (speed: number) => void;
  setReplayIndex: (index: number) => void;
  setCurrentSnapshot: (snapshot: Snapshot | null) => void;
  switchMode: (mode: 'replay' | 'live') => void;
  setCurrentPage: (page: string) => void;
  setIsMobileMenuOpen: (open: boolean) => void;

  // API actions
  init: () => Promise<void>;
  loadDate: (date: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  currentDate: '',
  availableDates: [],
  latestSnapshot: null,
  apiStatus: null,
  currentDayData: null,

  replayMode: 'live',
  replayIndex: 0,
  isPlaying: false,
  playSpeed: 1,
  currentSnapshot: null,

  loading: false,
  error: null,

  currentPage: 'dashboard',
  isMobileMenuOpen: false,

  setCurrentDate: (date: string) => set({ currentDate: date }),
  setAvailableDates: (dates: DateInfo[]) => set({ availableDates: dates }),
  setLatestSnapshot: (snapshot: Snapshot | null) => set({ latestSnapshot: snapshot }),
  setApiStatus: (status: ApiStatus | null) => set({ apiStatus: status }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaySpeed: (speed: number) => set({ playSpeed: speed }),
  setReplayIndex: (index: number) => {
    const { currentDayData } = get();
    const snapshots = currentDayData?.snapshots ?? [];
    const snapshot = snapshots[index] ?? null;
    set({ replayIndex: index, currentSnapshot: snapshot });
  },
  setCurrentSnapshot: (snapshot: Snapshot | null) => set({ currentSnapshot: snapshot }),

  switchMode: (mode: 'replay' | 'live') =>
    set({ replayMode: mode, isPlaying: false, replayIndex: 0 }),

  setCurrentPage: (page: string) => set({ currentPage: page }),
  setIsMobileMenuOpen: (open: boolean) => set({ isMobileMenuOpen: open }),

  // Initialize: fetch status, dates, and latest snapshot
  init: async () => {
    set({ loading: true, error: null });
    try {
      const [status, dates, latest] = await Promise.all([
        fetchStatus(),
        fetchDates(),
        fetchLatest().catch(() => null),
      ]);

      const latestDate = status.current_date || (dates.length > 0 ? dates[0].date : '');

      set({
        apiStatus: status,
        availableDates: dates,
        latestSnapshot: latest,
        currentSnapshot: latest,
        currentDate: latestDate,
        loading: false,
      });

      // Load the latest date's full data if available
      if (latestDate) {
        await get().loadDate(latestDate);
      }
    } catch (err) {
      console.error('Failed to initialize:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to load data',
        loading: false,
      });
    }
  },

  // Load a specific date's full day data
  loadDate: async (date: string) => {
    set({ loading: true, error: null, currentDate: date });
    try {
      const dayData = await fetchDay(date);
      const lastSnapshot = dayData.snapshots[dayData.snapshots.length - 1] ?? null;
      const { latestSnapshot } = get();
      set({
        currentDayData: dayData,
        currentSnapshot: lastSnapshot ?? latestSnapshot,
        replayIndex: dayData.snapshots.length - 1,
        loading: false,
      });
    } catch (err) {
      console.error('Failed to load date:', err);
      const { latestSnapshot } = get();
      set({
        error: err instanceof Error ? err.message : 'Failed to load date',
        currentSnapshot: latestSnapshot,
        loading: false,
      });
    }
  },

  // Refresh latest snapshot (for live mode)
  refreshData: async () => {
    try {
      const [status, latest] = await Promise.all([
        fetchStatus().catch(() => get().apiStatus),
        fetchLatest().catch(() => get().latestSnapshot),
      ]);
      set({
        apiStatus: status,
        latestSnapshot: latest,
      });
      // In live mode, also update current snapshot
      if (get().replayMode === 'live') {
        set({ currentSnapshot: latest });
      }
    } catch (err) {
      console.error('Failed to refresh:', err);
    }
  },
}));
