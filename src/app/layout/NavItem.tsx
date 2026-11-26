import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import styles from './NavItem.module.scss';

interface NavItemProps {
  href: string;
  title: string;
  /** Rendered with the `icon` class name. */
  icon: (className: string) => ReactNode;
  variant: 'sidebar' | 'bottom';
}

export function NavItem({ href, title, icon, variant }: NavItemProps) {
  const [location] = useLocation();
  const active = location === href || (href !== '/' && location.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={clsx(styles.item, styles[variant], active && styles.active)}
      aria-current={active ? 'page' : undefined}
      title={title}
    >
      {icon(styles.icon ?? '')}
      <span className={styles.label}>{title}</span>
    </Link>
  );
}
