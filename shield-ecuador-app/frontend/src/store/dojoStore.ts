import { create } from 'zustand'
import type { BeltLevel } from '../data/ciberDojo'

interface DojoState {
  xp: number
  belt: BeltLevel
  activeKataId: string
  setXp: (xp: number) => void
  setBelt: (belt: string) => void
  setActiveKataId: (id: string) => void
}

export const useDojoStore = create<DojoState>((set) => ({
  xp: 0,
  belt: 'blanco',
  activeKataId: 'passwords',
  setXp: (xp) => set({ xp }),
  setBelt: (value) => {
    const names: Record<string, BeltLevel> = {
      white: 'blanco', yellow: 'amarillo', orange: 'naranja', green: 'verde', blue: 'azul', brown: 'marron', black: 'negro',
      blanco: 'blanco', amarillo: 'amarillo', naranja: 'naranja', verde: 'verde', azul: 'azul', marron: 'marron', negro: 'negro',
    }
    set({ belt: names[value] ?? 'blanco' })
  },
  setActiveKataId: (id) => set({ activeKataId: id }),
}))
