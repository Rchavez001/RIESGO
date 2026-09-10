import React, { useId } from 'react'
export function KarateBelt({ color, width = 90 }: { color: string; width?: number }) {
  const id = useId().replace(/:/g, '')
  return <svg className="real-karate-belt" style={{width}} viewBox="0 0 160 116" aria-hidden="true"><defs>
    <linearGradient id={`${id}-cloth`} x2=".2" y2="1"><stop stopColor="#fff" stopOpacity=".38"/><stop offset=".22" stopColor="#fff" stopOpacity=".08"/><stop offset=".48" stopColor="#000" stopOpacity=".18"/><stop offset=".72" stopColor="#fff" stopOpacity=".16"/><stop offset="1" stopColor="#000" stopOpacity=".5"/></linearGradient>
    <pattern id={`${id}-weave`} width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 .5H3" stroke="#fff" strokeOpacity=".17" strokeWidth=".5"/><path d="M.5 0V3" stroke="#000" strokeOpacity=".23" strokeWidth=".6"/></pattern>
    <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity=".65"/></filter></defs>
    <g filter={`url(#${id}-shadow)`} fill={color}>{['M12 28 Q77 13 148 28 L147 48 Q81 37 13 49Z','M70 38 Q59 65 35 93 L57 107 Q80 76 86 48Z','M84 38 Q96 62 128 82 L113 101 Q84 80 72 51Z','M65 27 Q80 22 94 29 L91 53 Q78 58 65 49 Q70 38 65 27Z'].map(d => <g key={d}><path d={d}/><path d={d} fill={`url(#${id}-cloth)`}/><path d={d} fill={`url(#${id}-weave)`}/><path d={d} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth=".7"/></g>)}
      <g fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth=".7" strokeDasharray="1.4 1.6"><path d="M16 32 Q78 18 144 32M16 44 Q78 32 144 43M70 55Q58 79 42 93M77 61Q67 86 56 101M91 56Q106 77 122 84M87 66Q98 83 113 94M70 29Q77 38 70 49M88 30L86 50"/></g><path d="M69 30Q78 39 91 31M70 49Q80 41 89 50" fill="none" stroke="#000" strokeOpacity=".28" strokeWidth="2"/><path d="m111 83 9 7-4 5-9-7Z" fill="#161b18"/><path d="m110 87 5 4" stroke="#d9ba74" strokeWidth="1"/>
    </g></svg>
}
