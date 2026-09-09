import React from 'react'

export function SenseiPortraitSVG() {
  return (
    <svg viewBox="0 0 300 440" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%', height: '100%' }}>
      <defs>
        <radialGradient id="sp-bg" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#1a2535" />
          <stop offset="100%" stopColor="#04060d" />
        </radialGradient>
        <radialGradient id="sp-skin" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stopColor="#c8894a" />
          <stop offset="50%" stopColor="#8a5420" />
          <stop offset="100%" stopColor="#2e1500" />
        </radialGradient>
        <radialGradient id="sp-skin2" cx="25%" cy="20%" r="70%">
          <stop offset="0%" stopColor="#b87a3a" />
          <stop offset="55%" stopColor="#7a4818" />
          <stop offset="100%" stopColor="#200e00" />
        </radialGradient>
        <linearGradient id="sp-kimono" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#16182a" />
          <stop offset="40%" stopColor="#0b0c16" />
          <stop offset="100%" stopColor="#040408" />
        </linearGradient>
        <linearGradient id="sp-rim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(0,180,216,0.55)" />
          <stop offset="100%" stopColor="rgba(0,180,216,0)" />
        </linearGradient>
        <radialGradient id="sp-floor" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="rgba(0,180,216,0.08)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <filter id="sp-blur-bg">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="sp-soft">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id="sp-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
          <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend" />
          <feComponentTransfer in="blend">
            <feFuncA type="linear" slope="0.04" />
          </feComponentTransfer>
        </filter>
      </defs>

      {/* Background */}
      <rect width="300" height="440" fill="url(#sp-bg)" />

      {/* Bokeh circles — depth of field suggestion */}
      <circle cx="30" cy="60" r="28" fill="rgba(0,180,216,0.04)" filter="url(#sp-blur-bg)" />
      <circle cx="255" cy="120" r="22" fill="rgba(200,136,40,0.05)" filter="url(#sp-blur-bg)" />
      <circle cx="60" cy="350" r="18" fill="rgba(0,180,216,0.04)" filter="url(#sp-blur-bg)" />
      <circle cx="270" cy="380" r="25" fill="rgba(0,100,150,0.04)" filter="url(#sp-blur-bg)" />

      {/* Floor light pool */}
      <ellipse cx="150" cy="430" rx="120" ry="25" fill="url(#sp-floor)" />

      {/* Kimono body — wide, traditional */}
      <path d="M 20 440 L 50 255 Q 70 230 150 218 Q 230 230 250 255 L 280 440 Z"
        fill="url(#sp-kimono)" />

      {/* Kimono left panel (overlapping) */}
      <path d="M 150 218 L 118 285 L 125 440 L 155 440 Z"
        fill="#0e0f1c" />

      {/* Kimono right panel */}
      <path d="M 150 218 L 182 285 L 175 440 L 145 440 Z"
        fill="#12131f" />

      {/* White inner collar */}
      <path d="M 150 218 L 134 268 L 150 274 L 166 268 Z"
        fill="#d8dde8" opacity="0.88" />

      {/* Collar shadow */}
      <path d="M 150 250 L 140 272 L 150 274 L 160 272 Z"
        fill="rgba(0,0,0,0.35)" />

      {/* Shoulders shading — rim lit left */}
      <path d="M 50 255 Q 90 240 150 234 Q 210 240 250 255 Q 220 248 150 242 Q 80 248 50 255 Z"
        fill="rgba(0,180,216,0.08)" />

      {/* Neck */}
      <path d="M 138 198 Q 138 182 143 175 Q 150 170 157 175 Q 162 182 162 198 Q 158 204 150 206 Q 142 204 138 198 Z"
        fill="url(#sp-skin2)" />

      {/* Head — slightly asymmetric for realism */}
      <ellipse cx="150" cy="148" rx="54" ry="62" fill="url(#sp-skin)" />

      {/* Skull/brow shadow — more volume */}
      <ellipse cx="168" cy="138" rx="30" ry="38" fill="rgba(0,0,0,0.18)" filter="url(#sp-soft)" />

      {/* White hair — flat top, short sides of an elderly man */}
      <path d="M 97 145 Q 94 110 104 90 Q 116 70 150 66 Q 184 70 196 90 Q 206 110 203 145"
        fill="#c2c8d4" />
      <path d="M 99 145 Q 97 118 106 96 Q 118 75 150 71 Q 182 75 194 96 Q 203 118 201 145"
        fill="#d0d5df" />
      {/* Hair top highlight */}
      <path d="M 130 80 Q 150 74 170 80 Q 160 70 150 68 Q 140 70 130 80 Z"
        fill="rgba(255,255,255,0.15)" />

      {/* Wrinkle lines — forehead */}
      <path d="M 126 118 Q 150 113 174 118" stroke="rgba(40,20,0,0.4)" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M 130 126 Q 150 122 170 126" stroke="rgba(40,20,0,0.3)" strokeWidth="0.8" fill="none" strokeLinecap="round" />

      {/* Eyebrows — white/grey, heavy */}
      <path d="M 114 138 Q 122 130 139 134" stroke="#9da3ae" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 161 134 Q 178 130 186 138" stroke="#9da3ae" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Brow shadow */}
      <path d="M 114 140 Q 122 133 139 137" stroke="rgba(0,0,0,0.3)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 161 137 Q 178 133 186 140" stroke="rgba(0,0,0,0.3)" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Eyes — deep set, intense */}
      <ellipse cx="128" cy="150" rx="11" ry="7" fill="#120800" />
      <ellipse cx="172" cy="150" rx="11" ry="7" fill="#120800" />
      <ellipse cx="128" cy="149" rx="5" ry="5" fill="#060200" />
      <ellipse cx="172" cy="149" rx="5" ry="5" fill="#060200" />
      {/* Iris catch light */}
      <ellipse cx="126" cy="147" rx="2.5" ry="2" fill="rgba(200,225,255,0.45)" />
      <ellipse cx="170" cy="147" rx="2.5" ry="2" fill="rgba(200,225,255,0.45)" />
      {/* Under-eye bags */}
      <path d="M 117 155 Q 128 159 139 155" stroke="rgba(80,40,0,0.35)" strokeWidth="1.2" fill="none" />
      <path d="M 161 155 Q 172 159 183 155" stroke="rgba(80,40,0,0.35)" strokeWidth="1.2" fill="none" />

      {/* Nose — broad, shadowed right side */}
      <path d="M 150 158 L 143 175 Q 150 180 157 175 Z"
        fill="rgba(80,40,0,0.45)" />
      <path d="M 150 158 L 152 175 Q 157 179 162 174" stroke="rgba(40,20,0,0.3)" strokeWidth="1" fill="none" />

      {/* Nasolabial folds */}
      <path d="M 140 172 Q 138 183 140 190" stroke="rgba(60,30,0,0.4)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M 160 172 Q 162 183 160 190" stroke="rgba(60,30,0,0.4)" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* Lips — thin, stern */}
      <path d="M 137 185 Q 145 190 150 188 Q 155 190 163 185"
        stroke="rgba(100,55,20,0.8)" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* White mustache */}
      <path d="M 136 183 Q 143 188 150 185 Q 157 188 164 183"
        stroke="#c8cdd8" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.92" />

      {/* White beard */}
      <path d="M 118 188 Q 115 205 122 218 Q 135 228 150 230 Q 165 228 178 218 Q 185 205 182 188 Q 168 200 150 202 Q 132 200 118 188 Z"
        fill="#cdd2dc" opacity="0.88" />
      {/* Beard hair texture */}
      <line x1="136" y1="196" x2="134" y2="218" stroke="#a8adb8" strokeWidth="0.9" opacity="0.6" />
      <line x1="143" y1="200" x2="142" y2="222" stroke="#a8adb8" strokeWidth="0.9" opacity="0.6" />
      <line x1="150" y1="202" x2="150" y2="224" stroke="#a8adb8" strokeWidth="0.9" opacity="0.6" />
      <line x1="157" y1="200" x2="158" y2="222" stroke="#a8adb8" strokeWidth="0.9" opacity="0.6" />
      <line x1="164" y1="196" x2="166" y2="218" stroke="#a8adb8" strokeWidth="0.9" opacity="0.6" />

      {/* CYAN RIM LIGHT — left side of face and body (photographic key light) */}
      <path d="M 97 90 Q 89 148 97 210" stroke="rgba(0,180,216,0.55)" strokeWidth="5" fill="none" strokeLinecap="round" filter="url(#sp-soft)" />
      <ellipse cx="90" cy="148" rx="20" ry="68" fill="rgba(0,180,216,0.10)" filter="url(#sp-soft)" />
      {/* Rim on shoulder */}
      <path d="M 50 240 Q 60 255 75 265" stroke="rgba(0,180,216,0.40)" strokeWidth="6" fill="none" strokeLinecap="round" filter="url(#sp-soft)" />

      {/* RIGHT SIDE SHADOW — opposite rim, deep shadow */}
      <ellipse cx="210" cy="148" rx="28" ry="68" fill="rgba(0,0,0,0.30)" filter="url(#sp-soft)" />

      {/* Belt — black with subtle sheen */}
      <path d="M 72 318 Q 150 312 228 318 L 232 335 Q 150 330 68 335 Z"
        fill="#0d0d14" />
      <path d="M 72 319 Q 150 314 228 319"
        stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" />

      {/* Belt knot */}
      <path d="M 138 312 L 162 312 L 168 355 L 152 358 L 148 358 L 132 355 Z"
        fill="#0a0a12" />
      <rect x="140" y="330" width="20" height="4" rx="2" fill="rgba(255,255,255,0.04)" />

      {/* Ground shadow */}
      <ellipse cx="150" cy="436" rx="100" ry="10" fill="rgba(0,0,0,0.7)" />

      {/* Subtle grain overlay for photographic feel */}
      <rect width="300" height="440" fill="rgba(100,120,140,0.025)" filter="url(#sp-grain)" />
    </svg>
  )
}
