import { ActionIcon } from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { routes, type AppRoute } from '@/app/routes';
import { AppLogo } from '@/components/AppLogo/AppLogo';
import { usePrefs } from '@/store/prefsStore';
import { NavItem } from './NavItem';
import { SidebarCollections } from './SidebarCollections';
import styles from './Sidebar.module.scss';

const visible = routes.filter((r) => !r.hidden);
/** Help and Settings sit at the bottom of the sidebar. */
const BOTTOM = ['/help', '/settings'];
const top = visible.filter((r) => !BOTTOM.includes(r.path));
const bottom = visible.filter((r) => BOTTOM.includes(r.path));

function RouteItem({ route }: { route: AppRoute }) {
  const Icon = route.icon;
  return (
    <NavItem
      href={route.path}
      title={route.title}
      icon={(className) => <Icon className={className} stroke={1.75} aria-hidden />}
      variant="sidebar"
    />
  );
}

/**
 * Desktop sidebar. Can be collapsed to an icon rail to give content more room;
 * on tablet it is always a rail, and on phone it's replaced by the bottom nav.
 */
export function Sidebar() {
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const setPref = usePrefs((s) => s.setPref);
  const setCollapsed = (value: boolean) => {
    setPref('sidebarCollapsed', value);
  };
  const ToggleIcon = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse;
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <nav className={styles.root} aria-label="Main" data-collapsed={collapsed || undefined}>
      <div className={styles.brand}>
        <AppLogo size={22} className={styles.logo} />
        <span className={styles.name}>Ostraca</span>
      </div>
      <div className={styles.items}>
        {top.map((route) => (
          <RouteItem key={route.path} route={route} />
        ))}
      </div>
      <SidebarCollections />
      <div className={styles.items}>
        {bottom.map((route) => (
          <RouteItem key={route.path} route={route} />
        ))}
      </div>
      <div className={styles.footer}>
        <ActionIcon
          className={styles.toggle}
          color="gray"
          onClick={() => {
            setCollapsed(!collapsed);
          }}
          aria-label={toggleLabel}
          aria-pressed={collapsed}
          title={toggleLabel}
        >
          <ToggleIcon size={16} stroke={1.75} />
        </ActionIcon>
      </div>
    </nav>
  );
}
