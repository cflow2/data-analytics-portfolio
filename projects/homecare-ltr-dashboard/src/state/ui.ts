import { create } from 'zustand';

interface UiState {
  presentation: boolean;
  paletteOpen: boolean;
  setPresentation: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  presentation: false,
  paletteOpen: false,
  setPresentation: (presentation) => set({ presentation }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
