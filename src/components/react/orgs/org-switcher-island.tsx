import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, ChevronsUpDown, Settings } from 'lucide-react';
import { getShellClient } from '../../../lib/query/shell-client';
import { getActiveOrgId, setActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { cx, menuItemClass, popoverClass } from '../../../lib/ui/classes';

/**
 * The organization switcher in the app shell (`DashboardLayout.astro`): which
 * workspace am I in, and how do I move to another one.
 *
 * Rendered twice (desktop sidebar + mobile drawer), so it is a shell island
 * sharing `getShellClient` — the same pattern as sign-out and the admin nav
 * group. The org LIST itself is user-scoped and lives in that shell cache;
 * the *selection* lives in the module store (`active-org`), which every page
 * island subscribes to through `OrgGate` — that gate clears the page's
 * per-org caches when the selection changes, so one click here repaints the
 * whole page for the new workspace without this island knowing anything about
 * the page's QueryClient.
 *
 * The trigger carries `sidebar-label` on its text, so collapsing the rail to
 * its icon column drops the name exactly like it drops the brand's — one
 * shared collapse behaviour, no special case.
 *
 * The panel is portalled to `document.body`: the mobile drawer's inner wrapper
 * is `overflow-hidden`, which would clip an absolutely-positioned list.
 */
export function OrgSwitcherIsland() {
  const [client] = useState(getShellClient);

  return (
    <QueryClientProvider client={client}>
      <OrgSwitcher />
    </QueryClientProvider>
  );
}

function OrgSwitcher() {
  const { data } = useOrgs();
  const activeOrgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const orgs = data?.orgs ?? [];
  // The ensure logic in `OrgGate` normally keeps these in step; falling back
  // to the first org here only covers the frames before it has run.
  const active = orgs.find((org) => org.id === activeOrgId) ?? orgs[0] ?? null;

  // Close on outside press or Escape, like every menu in the app.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A scroll or resize would strand a fixed panel; closing is calmer than
  // re-anchoring on every frame (same trade-off as `Menu`).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Anchor the panel under the trigger, flipping above it near the viewport
  // bottom — measured once per open, before first paint.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < panelHeight + 8 && rect.top > spaceBelow;
    setPos(
      flip
        ? { bottom: window.innerHeight - rect.top + 6, left: rect.left }
        : { top: rect.bottom + 6, left: rect.left },
    );
  }, [open]);

  // Nothing to switch between yet: the forced create screen (OrgGate) owns
  // this moment, and a dead button under it would only compete for attention.
  if (!active) return null;

  function switchTo(orgId: string): void {
    setOpen(false);
    // OrgGate sees the store change and clears the page's per-org caches.
    setActiveOrgId(orgId);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Organisasi aktif: ${active.name}. Ganti organisasi`}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-background focus-ring"
      >
        <Building2 size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="sidebar-label min-w-0 flex-1 truncate text-left font-medium">
          {active.name}
        </span>
        <ChevronsUpDown
          size={14}
          className="sidebar-label shrink-0 text-muted"
          aria-hidden="true"
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Daftar organisasi"
            style={pos ?? { top: 0, left: 0, visibility: 'hidden' }}
            className={cx('fixed z-portal min-w-52', popoverClass())}
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
              Organisasi
            </p>
            {orgs.map((org) => {
              const isActive = org.id === active.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => switchTo(org.id)}
                  className={menuItemClass({ active: isActive })}
                >
                  <span className="truncate">{org.name}</span>
                  {isActive && <Check size={15} className="ml-auto shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
            <div className="my-1 border-t border-border" />
            <a
              role="menuitem"
              tabIndex={-1}
              href="/settings#organisasi"
              onClick={() => setOpen(false)}
              className={menuItemClass()}
            >
              <Settings size={15} className="shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate">Kelola organisasi</span>
            </a>
          </div>,
          document.body,
        )}
    </div>
  );
}
