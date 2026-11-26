import { clsx } from 'clsx';
import styles from './CellValue.module.scss';

const GLYPHS = { star: '★', heart: '♥', circle: '●' } as const;

interface RatingIconsProps {
  value: number;
  max: number;
  icon: keyof typeof GLYPHS;
  /** Clicking the n-th icon sets n (clicking the current rating clears it). */
  onSet?: (value: number | undefined) => void;
}

/** A rating as a row of icons. */
export function RatingIcons({ value, max, icon, onSet }: RatingIconsProps) {
  const glyph = GLYPHS[icon];
  return (
    <span className={styles.rating} aria-label={`${String(value)} of ${String(max)}`} role="img">
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        return (
          <span
            key={n}
            className={clsx(
              styles.ratingIcon,
              n <= value && styles.ratingOn,
              onSet && styles.ratingClickable,
            )}
            onMouseDown={
              onSet
                ? (e) => {
                    e.stopPropagation();
                    onSet(n === value ? undefined : n);
                  }
                : undefined
            }
          >
            {glyph}
          </span>
        );
      })}
    </span>
  );
}
