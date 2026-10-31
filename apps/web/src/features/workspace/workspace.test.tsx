// @vitest-environment jsdom
import { selectValue } from '../../test/select-value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { WorkspaceProvider } from './workspace-context';
import { ChannelSettings } from './settings';
import { Team } from './team';
import { Overview } from './overview';
import { Account } from './account';
import { LoginScreen } from '../auth/login-screen';
import { LandingStory } from '../../components/landing-story';
import {
  previewChannels,
  previewPeople,
  previewSession,
} from '../../lib/preview-data';
import { AppShell } from './app-shell';
import { Providers } from '../../components/providers';
import { ThemeChoices } from '../../components/theme-control';
import type { Channel } from '@lore/shared';
const { replace, push } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));
// Retention worker status has its own request/permission tests.
vi.mock('./retention-status', () => ({ RetentionStatus: () => null }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/settings',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
}));
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }) => <img src={src} alt={alt} width={width} height={height} />,
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fetchMock = vi.fn<typeof fetch>();
function workspace(
  children: ReactNode,
  channels: Channel[] = [previewChannels[0]],
  preview = false,
) {
  return render(
    <WorkspaceProvider
      session={previewSession}
      initialChannels={channels}
      preview={preview}
    >
      {children}
    </WorkspaceProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  replace.mockReset();
  push.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Lore interface behavior', () => {
  it('lets a visitor step through the illustrative community story', async () => {
    render(<LandingStory />);
    const user = userEvent.setup();
    expect(screen.getByText('Confirmed promise')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: /02 The follow-through/ }),
    );
    expect(screen.getByText('Promise fulfilled')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /03 The lore/ }));
    expect(screen.getByText('Approved community story')).toBeTruthy();
    expect(screen.getByText('Illustrative story')).toBeTruthy();
  });
  it('offers one demo entry point when Twitch login is not configured', async () => {
    fetchMock.mockResolvedValue(response({ twitchConfigured: false }));
    render(<LoginScreen />);
    expect(
      await screen.findByText(/Our Twitch connection isn’t ready/),
    ).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Continue with Twitch',
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole('link', { name: /Try the demo/ }).getAttribute('href'),
    ).toBe('/demo');
    expect(
      screen.queryByRole('link', { name: /Take a look around first/ }),
    ).toBeNull();
  });
  it('links ready sign-in to NestJS and explains an expired session', async () => {
    fetchMock.mockResolvedValue(response({ twitchConfigured: true }));
    render(<LoginScreen expired />);
    expect(
      (
        await screen.findByRole('link', { name: /Continue with Twitch/ })
      ).getAttribute('href'),
    ).toBe('/api/auth/twitch');
    expect(screen.getByText(/Your session ended/)).toBeTruthy();
  });
  it('saves retention through the real API contract with a CSRF header', async () => {
    fetchMock.mockResolvedValue(
      response({ ...previewChannels[0], chatRetentionDays: 3 }),
    );
    workspace(<ChannelSettings />);
    const user = userEvent.setup();
    await selectValue(
      user,
      screen.getByLabelText('Ordinary chat retention'),
      '3',
    );
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect(await screen.findByText('Preferences saved')).toBeTruthy();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/channels/${previewChannels[0].id}/settings`);
    expect(options).toMatchObject({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': previewSession.csrfToken },
      body: JSON.stringify({ chatRetentionDays: 3 }),
    });
  });
  it('shows mutation failures without claiming the preferences were saved', async () => {
    fetchMock.mockResolvedValue(response({ message: 'unavailable' }, 503));
    workspace(<ChannelSettings />);
    const user = userEvent.setup();
    await selectValue(
      user,
      screen.getByLabelText('Ordinary chat retention'),
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Please try again shortly',
    );
    expect(screen.queryByText('Preferences saved')).toBeNull();
  });
  it('turns unexpected API response shapes into a readable failure', async () => {
    fetchMock.mockResolvedValue(response({ unexpected: true }));
    workspace(<ChannelSettings />);
    const user = userEvent.setup();
    await selectValue(
      user,
      screen.getByLabelText('Ordinary chat retention'),
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'response we couldn’t read',
    );
    expect(screen.queryByText('Preferences saved')).toBeNull();
  });
  it('requires confirmation before disconnecting and then offers reconnection', async () => {
    fetchMock.mockResolvedValue(response(null, 204));
    workspace(<ChannelSettings />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Disconnect channel' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Disconnect channel' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Reconnect channel' }),
    ).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/channels/${previewChannels[0].id}/disconnect`,
    );
  });
  it('makes non-owner settings read-only and does not request private team grants', async () => {
    workspace(
      <>
        <ChannelSettings />
        <Team />
      </>,
      [previewChannels[1]],
    );
    expect(
      screen.getByLabelText<HTMLButtonElement>('Ordinary chat retention')
        .disabled,
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Save preferences' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Disconnect channel' }),
    ).toBeNull();
    expect(
      await screen.findByText('Only the owner can manage the team.'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('adds a team member and refetches the authorized member list', async () => {
    let added = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') {
        added = true;
        return response({
          userId: previewPeople[1].userId,
          role: 'team',
          verificationState: 'owner_approved',
        });
      }
      return response(added ? previewPeople : [previewPeople[0]]);
    });
    workspace(<Team />);
    const user = userEvent.setup();
    expect(await screen.findByText('moss.jpeg')).toBeTruthy();
    await user.type(screen.getByLabelText('Twitch user ID'), '300');
    await selectValue(user, screen.getByLabelText('Role'), 'team');
    await user.click(screen.getByRole('button', { name: 'Add to team' }));
    expect(await screen.findByText('pixel_pilot')).toBeTruthy();
    const call = fetchMock.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    );
    expect(call?.[1]).toMatchObject({
      headers: { 'X-CSRF-Token': previewSession.csrfToken },
      body: JSON.stringify({ twitchUserId: '300', role: 'team' }),
    });
  });
  it('updates a role and removes membership only after confirmation', async () => {
    let role: 'team' | 'moderator' = 'moderator';
    let removed = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') {
        role = 'team';
        return response({
          userId: previewPeople[0].userId,
          role,
          verificationState: 'owner_approved',
        });
      }
      if (options?.method === 'DELETE') {
        removed = true;
        return response(null, 204);
      }
      return response(removed ? [] : [{ ...previewPeople[0], role }]);
    });
    workspace(<Team />);
    const user = userEvent.setup();
    await screen.findByText('moss.jpeg');
    await selectValue(
      user,
      screen.getByLabelText('Role for moss.jpeg'),
      'team',
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText<HTMLButtonElement>('Role for moss.jpeg').value,
      ).toBe('team'),
    );
    await user.click(screen.getByRole('button', { name: 'Remove moss.jpeg' }));
    expect(removed).toBe(false);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove access',
      }),
    );
    await waitFor(() => expect(screen.queryByText('moss.jpeg')).toBeNull());
    expect(removed).toBe(true);
  });
  it('keeps fixture changes local and labels the preview clearly', async () => {
    render(
      <AppShell
        session={previewSession}
        channels={previewChannels}
        preview
        view="team"
      >
        <Team />
      </AppShell>,
    );
    const user = userEvent.setup();
    await screen.findByText('moss.jpeg');
    expect(screen.getByText(/Simulated actions/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove moss.jpeg' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove access',
      }),
    );
    await waitFor(() => expect(screen.queryByText('moss.jpeg')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns expired mutations to sign-in rather than showing stale success', async () => {
    fetchMock.mockResolvedValue(response({ message: 'Sign in required' }, 401));
    workspace(<ChannelSettings />);
    const user = userEvent.setup();
    await selectValue(
      user,
      screen.getByLabelText('Ordinary chat retention'),
      '2',
    );
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/login?expired=1'),
    );
    expect(screen.queryByText('Preferences saved')).toBeNull();
  });
  it('connects an authenticated user’s channel from the empty overview', async () => {
    fetchMock.mockResolvedValue(response(previewChannels[0]));
    workspace(<Overview />, []);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connect channel' }));
    expect(await screen.findByText('Connected')).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/channels/connect');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '{}',
      headers: { 'X-CSRF-Token': previewSession.csrfToken },
    });
  });
  it('signs out through NestJS and clears the authenticated workspace navigation', async () => {
    fetchMock.mockResolvedValue(response(null, 204));
    workspace(<Account />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'X-CSRF-Token': previewSession.csrfToken },
    });
  });
  it('switches channels without carrying owner controls into a moderator’s view', async () => {
    render(
      <AppShell session={previewSession} channels={previewChannels}>
        <ChannelSettings />
      </AppShell>,
    );
    const user = userEvent.setup();
    expect(
      screen.getByRole('button', { name: 'Disconnect channel' }),
    ).toBeTruthy();
    await selectValue(
      user,
      screen.getByLabelText('Selected channel'),
      previewChannels[1].id,
    );
    expect(
      screen.queryByRole('button', { name: 'Disconnect channel' }),
    ).toBeNull();
    expect(
      screen.getByLabelText<HTMLButtonElement>('Ordinary chat retention').value,
    ).toBe('3');
    expect(
      screen.getByLabelText<HTMLButtonElement>('Ordinary chat retention')
        .disabled,
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('lets owners retry a failed team list request', async () => {
    fetchMock
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValue(response([previewPeople[0]]));
    workspace(<Team />);
    const user = userEvent.setup();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('moss.jpeg')).toBeTruthy();
  });
  it('persists light and dark preferences with the namespaced theme key', async () => {
    render(
      <Providers>
        <ThemeChoices />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    );
    expect(localStorage.getItem('lore-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    );
  });
});
