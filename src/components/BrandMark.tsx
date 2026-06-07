// The Mend brand mark: a rounded rust square with three "stitch" strokes.
// Rendered inline (self-hosted, crisp) and sized by prop. Callers wrap it in a
// `.brand__mark` span where the design does.

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="#c4502c" />
      <path d="M7 18.5 H27" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <path d="M10.5 14.5 l3.5 8" />
        <path d="M16.5 14.5 l3.5 8" />
        <path d="M22.5 14.5 l3.5 8" />
      </g>
    </svg>
  );
}
