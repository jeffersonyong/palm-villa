/**
 * Instagram and TikTok marks, drawn inline because lucide v1 dropped its brand
 * icons. Both follow lucide's geometry — 24x24 box, 2px round strokes, no fill
 * — so they sit consistently beside the lucide icons used elsewhere on the
 * page, and they inherit size and colour from the button that holds them.
 */

const sharedProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function InstagramIcon() {
  return (
    <svg {...sharedProps}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

export function TikTokIcon() {
  return (
    <svg {...sharedProps}>
      {/* Note head, stem, and the hook off the top right. */}
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  )
}
