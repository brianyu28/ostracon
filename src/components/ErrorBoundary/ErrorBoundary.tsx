import { Button } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.scss';

interface Props {
  children: ReactNode;
  /** Changing it clears the error (e.g. the current location, so navigating away recovers). */
  resetKey: string;
}

interface State {
  error: Error | null;
  resetKey: string;
}

/**
 * Catches a render error in one screen so the rest of the app (navigation, dialogs, saving)
 * keeps working. Edits are already in the working copy, so reloading loses nothing.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A chunk that no longer exists after an update: only a reload fixes it.
    const stale = /dynamically imported module|Importing a module script failed/i.test(
      error.message,
    );
    return (
      <div className={styles.root} role="alert">
        <p className={styles.title}>
          {stale ? 'A new version is available.' : 'Something went wrong on this screen.'}
        </p>
        <p className={styles.detail}>{stale ? 'Reload to continue.' : error.message}</p>
        <div className={styles.actions}>
          <Button
            size="xs"
            onClick={() => {
              location.reload();
            }}
          >
            Reload
          </Button>
          {!stale && (
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                this.setState({ error: null });
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }
}
