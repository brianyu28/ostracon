/**
 * The app's mark, drawn inline (no image request): the shard pile from `assets/icon.svg` on its
 * rounded tile. Keep the two in step.
 */
export function AppLogo({
  size = 20,
  className,
}: {
  size?: number;
  className?: string | undefined;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="512" height="512" rx="114" fill="#f3ebe0" />
      <path d="M103 116 L415 105 L426 141 L408 192 L99 205 L90 151 Z" fill="#a94f2a" />
      <path
        d="M111 217 L238 210 L257 224 L429 217 L416 298 L289 303 L270 291 L117 298 Z"
        fill="#c4643a"
      />
      <path d="M100 312 L436 326 L419 404 L76 390 Z" fill="#dc8a62" />
    </svg>
  );
}
