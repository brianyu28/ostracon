import { Loader } from '@mantine/core';
import styles from './PageLoading.module.scss';

/**
 * Placeholder while a screen's code loads. It fades in after a short delay, so a fast load
 * shows nothing rather than a flash.
 */
export function PageLoading() {
  return (
    <div className={styles.root} role="status" aria-label="Loading">
      <Loader size="sm" color="var(--os-text-dim)" />
    </div>
  );
}
