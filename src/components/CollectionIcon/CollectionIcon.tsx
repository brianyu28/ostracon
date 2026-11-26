import { IconStack2, type IconProps } from '@tabler/icons-react';
import { COLLECTION_ICONS } from './icons';

interface CollectionIconProps extends IconProps {
  icon: string | undefined;
}

/** A collection's icon (a generic stack when it has none or an unknown one). */
export function CollectionIcon({ icon, ...props }: CollectionIconProps) {
  const Component = (icon && COLLECTION_ICONS[icon]) || IconStack2;
  return <Component {...props} />;
}
