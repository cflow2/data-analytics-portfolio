import { create } from 'zustand';
import type { Answer } from '@/ask/ask';

export interface Turn { id: number; q: string; fw: number; a: Answer; at: string }

/** Conversation history for this browser session (cleared on reload). */
export const useAsk = create<{ turns: Turn[]; add: (t: Omit<Turn, 'id' | 'at'>) => void; clear: () => void }>((set) => ({
  turns: [],
  add: (t) => set((s) => ({ turns: [...s.turns, { ...t, id: s.turns.length + 1, at: new Date().toISOString() }] })),
  clear: () => set({ turns: [] }),
}));
