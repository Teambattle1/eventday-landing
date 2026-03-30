import { ICONS } from './icons'

export default function SVGIcon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  style,
  ...rest
}) {
  const d = ICONS[name]
  if (!d) return null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}
