/**
 * The app's mark, drawn inline (no image request): the clay shard from `assets/icon.svg` on its
 * dark tile. Keep the two in step.
 */
export function AppLogo({
  size = 20,
  className,
}: {
  size?: number;
  className?: string | undefined;
}) {
  const shard = 'M150 132 L312 104 L404 176 L388 318 L300 410 L170 392 L108 286 L122 196 Z';
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="512" height="512" rx="114" fill="#1f2933" />
      <path d={shard} transform="translate(0 22)" fill="#7a3519" />
      <path d={shard} fill="#c4643a" />
      <path d="M170 150 L300 128 L372 186 L232 200 Z" fill="#d97d50" opacity="0.7" />
      <g fill="none" stroke="#5e2812" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <path d="M170 236 L206 236 M226 236 L262 220 L262 252 M284 236 L340 236" />
        <path d="M160 290 L230 290 M252 274 L252 306 M276 290 L350 290" />
        <path d="M196 344 L292 344" />
      </g>
    </svg>
  );
}
