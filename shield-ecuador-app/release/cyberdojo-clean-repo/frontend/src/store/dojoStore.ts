import { create } from 'zustand'
import type { BeltLevel } from '../data/ciberDojo'

interface DojoState {
  xp: number
  belt: BeltLevel
  activeKataId: string
  setXp: (xp: number) => void
  setBelt: (belt: BeltLevel) => void
  setActiveKataId: (id: string) => void
}

export const useDojoStore = create<DojoState>((set) => ({
  xp: 2840,
  belt: 'verde',
  activeKataId: 'passwords',
  setXp: (xp) => set({ xp }),
  setBelt: (belt) => set({ belt }),
  setActiveKataId: (id) => set({ activeKataId: id }),
}))
