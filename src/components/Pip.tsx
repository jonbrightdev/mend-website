// Pip, the Mend inspector mascot. Inline SVG so it stays crisp and self-hosted.
// title/desc text and their ids are passed in so each instance is uniquely
// labelled without needing client-side hooks (keeps marketing pages zero-JS).

export function Pip({
  className,
  titleId,
  descId,
  title,
  desc,
  variant = "full",
}: {
  className?: string;
  titleId: string;
  descId: string;
  title: string;
  desc: string;
  // "full" includes the clipboard and arms; "face" is just the head (used on
  // the signup pitch, where Pip appears small beside a quote).
  variant?: "full" | "face";
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 260 280"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
    >
      <title id={titleId}>{title}</title>
      <desc id={descId}>{desc}</desc>
      <g fill="#f8f1e3" stroke="#c4502c" strokeWidth="5" strokeLinejoin="round">
        <ellipse cx="106" cy="252" rx="21" ry="13" />
        <ellipse cx="156" cy="252" rx="21" ry="13" />
      </g>
      <path
        d="M130 56 C 196 56 218 104 218 152 C 218 214 182 252 130 252 C 78 252 42 214 42 152 C 42 104 64 56 130 56 Z"
        fill="#f8f1e3"
        stroke="#c4502c"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <g fill="none" stroke="#c4502c" strokeWidth="5" strokeLinecap="round">
        <path d="M126 60 q 4 -20 22 -16" />
        <path d="M138 58 q 14 -10 26 -2" />
      </g>
      <g fill="#c4502c" opacity=".18">
        <circle cx="80" cy="148" r="12" />
        <circle cx="180" cy="148" r="12" />
      </g>
      <g fill="#ffffff" stroke="#c4502c" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="101" cy="120" r="30" />
        <circle cx="159" cy="120" r="30" />
      </g>
      <g fill="none" stroke="#c4502c" strokeWidth="5" strokeLinecap="round">
        <path d="M128 116 q 2 -7 4 0" />
        <path d="M72 116 L 56 110" />
        <path d="M188 116 L 204 110" />
      </g>
      <g fill="#1d1a14">
        <circle cx="103" cy="124" r="7.5" />
        <circle cx="157" cy="124" r="7.5" />
      </g>
      <g fill="#ffffff">
        <circle cx="106" cy="121" r="2.4" />
        <circle cx="160" cy="121" r="2.4" />
      </g>
      <path d="M112 158 q 18 18 36 0" fill="none" stroke="#1d1a14" strokeWidth="4.5" strokeLinecap="round" />
      {variant === "full" && (
        <>
          <path d="M52 178 q -16 16 -6 34" fill="none" stroke="#c4502c" strokeWidth="5" strokeLinecap="round" />
          <g transform="rotate(9 192 168)">
            <rect x="152" y="116" width="80" height="104" rx="11" fill="#ffffff" stroke="#c4502c" strokeWidth="5" />
            <rect x="178" y="108" width="28" height="16" rx="5" fill="#f8f1e3" stroke="#c4502c" strokeWidth="5" />
            <g strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M163 146 l 6 6 l 11 -13" stroke="#c4502c" strokeWidth="4" />
              <path d="M163 172 l 6 6 l 11 -13" stroke="#c4502c" strokeWidth="4" />
              <path d="M163 198 l 6 6 l 11 -13" stroke="#c4502c" strokeWidth="4" />
            </g>
            <g stroke="#d6cdb6" strokeWidth="5" strokeLinecap="round">
              <path d="M188 148 L 218 148" />
              <path d="M188 174 L 218 174" />
              <path d="M188 200 L 214 200" />
            </g>
          </g>
        </>
      )}
    </svg>
  );
}
