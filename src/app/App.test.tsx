import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { routes } from './routes';

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.localStorage.clear();
  });

  it('renders the home screen by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });

  it('lists every route in the sidebar', () => {
    render(<App />);
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    for (const route of routes.filter((r) => !r.hidden)) {
      expect(nav).toHaveTextContent(route.title);
    }
  });

  it('navigates via hash routes', async () => {
    render(<App />);
    const [link] = screen.getAllByRole('link', { name: 'Settings' });
    if (!link) throw new Error('Settings link not found');
    await userEvent.click(link);
    expect(window.location.hash).toBe('#/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('collapses the sidebar and remembers the choice', async () => {
    const { unmount } = render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const sidebar = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(sidebar).toHaveAttribute('data-collapsed');
    unmount();

    render(<App />);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });
});
