import { IconStack2, type IconProps } from '@tabler/icons-react';
import type { Color } from '@/domain/schema/types';
import { COLLECTION_ICONS, isEmojiIcon } from './icons';
import styles from './CollectionIcon.module.scss';

interface CollectionIconProps extends IconProps {
  icon: string | undefined;
  /** The collection's color tints the icon (otherwise it inherits the text color). */
  color?: Color | undefined;
}

/** A collection's icon or emoji (a generic stack when it has none or an unknown one). */
export function CollectionIcon({
  icon,
  color,
  style,
  size = 24,
  className,
  ...props
}: CollectionIconProps) {
  if (icon && isEmojiIcon(icon)) {
    return (
      <span
        className={className ? `${styles.emoji} ${className}` : styles.emoji}
        style={{ fontSize: Number(size) * 0.9, width: size, height: size, ...style }}
        aria-hidden
      >
        {icon}
      </span>
    );
  }
  const Component = (icon && COLLECTION_ICONS[icon]) || IconStack2;
  return (
    <Component
      {...props}
      size={size}
      className={className}
      style={color ? { color: `var(--os-${color})`, ...style } : style}
    />
  );
}
