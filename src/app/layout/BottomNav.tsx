import { Menu, UnstyledButton } from '@mantine/core';
import { IconStack2 } from '@tabler/icons-react';
import { useLocation } from 'wouter';
import { collectionPath, routes } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { useDocStore } from '@/store/docStore';
import { NavItem } from './NavItem';
import styles from './BottomNav.module.scss';

const primary = routes.filter((r) => r.primary && !r.hidden);

/** Phone-only tab bar: primary screens as tabs, collections under "Collections". */
export function BottomNav() {
  const [location, navigate] = useLocation();
  const collections = useDocStore((s) => s.doc?.collections);
  const list = Object.values(collections ?? {}).sort((a, b) => a.order - b.order);
  const collectionsActive = location.startsWith('/c/');
  const [home, ...rest] = primary;
  const tab = (route: (typeof primary)[number]) => {
    const Icon = route.icon;
    return (
      <NavItem
        key={route.path}
        href={route.path}
        title={route.title}
        icon={(className) => <Icon className={className} stroke={1.75} aria-hidden />}
        variant="bottom"
      />
    );
  };
  return (
    <nav className={styles.root} aria-label="Main">
      {home && tab(home)}
      {list.length > 0 && (
        <Menu position="top" offset={4}>
          <Menu.Target>
            <UnstyledButton className={styles.more} data-active={collectionsActive || undefined}>
              <IconStack2 className={styles.icon} stroke={1.75} aria-hidden />
              <span>Collections</span>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            {list.map((c) => (
              <Menu.Item
                key={c.id}
                leftSection={<CollectionIcon icon={c.icon} size={16} stroke={1.75} />}
                onClick={() => {
                  navigate(collectionPath(c.id));
                }}
              >
                {c.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
      {rest.map(tab)}
    </nav>
  );
}
