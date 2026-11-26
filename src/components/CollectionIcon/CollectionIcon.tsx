import { IconStack2, type IconProps } from '@tabler/icons-react';
import type { Color } from '@/domain/schema/types';
import { COLLECTION_ICONS } from './icons';

interface CollectionIconProps extends IconProps {
  icon: string | undefined;
  /** The collection's color tints the icon (otherwise it inherits the text color). */
  color?: Color | undefined;
}

/** A collection's icon (a generic stack when it has none or an unknown one). */
export function CollectionIcon({ icon, color, style, ...props }: CollectionIconProps) {
  const Component = (icon && COLLECTION_ICONS[icon]) || IconStack2;
  return <Component {...props} style={color ? { color: `var(--os-${color})`, ...style } : style} />;
}
