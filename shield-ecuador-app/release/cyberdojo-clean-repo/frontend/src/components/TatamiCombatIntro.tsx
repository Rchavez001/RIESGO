import React from 'react'

/** Decorative background SVG of two karate silhouettes on a tatami.
 *  Purely visual — aria-hidden, no pointer events. */
export function TatamiCombatIntro() {
  return (
    <div className="tatami-intro" aria-hidden="true">
      <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Tatami floor line */}
        <line x1="0" y1="250" x2="400" y2="250" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="0" y1="255" x2="400" y2="255" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />

        {/* Fighter A — attacker on left, executing high kick */}
        <g className="fighter-a" fill="white">
          {/* head */}
          <circle cx="90" cy="60" r="13" />
          {/* torso */}
          <rect x="84" y="73" width="12" height="52" rx="4" />
          {/* belt */}
          <rect x="80" y="108" width="20" height="5" rx="2" fill="rgba(0,180,216,0.8)" />
          {/* left arm — guard up */}
          <rect x="68" y="82" width="14" height="6" rx="3" transform="rotate(-30 68 82)" />
          {/* right arm — extended punch */}
          <rect x="96" y="78" width="28" height="6" rx="3" transform="rotate(8 96 78)" />
          {/* standing right leg */}
          <rect x="87" y="125" width="10" height="55" rx="4" transform="rotate(4 87 125)" />
          {/* kicking left leg — animated separately */}
          <g className="kick-leg">
            <rect x="70" y="125" width="10" height="45" rx="4" transform="rotate(-12 80 160)" />
            <rect x="60" y="162" width="10" height="32" rx="4" transform="rotate(40 70 162)" />
          </g>
          {/* foot */}
          <ellipse cx="152" cy="102" rx="10" ry="5" transform="rotate(-20 152 102)" />
        </g>

        {/* Fighter B — defender on right, in low blocking stance */}
        <g className="fighter-b" fill="white">
          {/* head */}
          <circle cx="290" cy="80" r="13" />
          {/* torso — leaning back */}
          <rect x="284" y="93" width="12" height="48" rx="4" transform="rotate(10 290 120)" />
          {/* belt */}
          <rect x="278" y="126" width="20" height="5" rx="2" fill="rgba(212,160,23,0.8)" />
          {/* left arm — blocking forearm raised */}
          <g className="block-arm">
            <rect x="265" y="95" width="16" height="6" rx="3" transform="rotate(-55 265 95)" />
            <rect x="254" y="79" width="16" height="6" rx="3" transform="rotate(-20 254 79)" />
          </g>
          {/* right arm — low guard */}
          <rect x="296" y="105" width="22" height="6" rx="3" transform="rotate(35 296 105)" />
          {/* wide stance legs */}
          <rect x="278" y="138" width="10" height="55" rx="4" transform="rotate(-14 278 138)" />
          <rect x="296" y="138" width="10" height="50" rx="4" transform="rotate(8 296 138)" />
        </g>

        {/* Energy flash between fighters */}
        <ellipse cx="195" cy="115" rx="18" ry="8" fill="white" opacity="0.06" />
        <line x1="155" y1="110" x2="235" y2="118" stroke="white" strokeWidth="1" strokeOpacity="0.12" strokeDasharray="4 3" />
      </svg>
    </div>
  )
}
