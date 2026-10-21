import {
  CreditCard,
  FileText,
  KeyRound,
  LayoutGrid,
  Package,
  Palette,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

export type NavGroup = {
  /** Stable id for tests and for keying the drawer's stagger order. */
  id: string;
  /** The visible section label above the group's items. */
  label: string;
  items: readonly NavItem[];
};

/**
 * Section labels for the two groups that are not plain item lists:
 *
 * - **Administration** holds the admin link, which only exists for members of
 *   the `admins` team and so renders as its own island (`AdminNavGroup`).
 * - **Utilities** holds Pintasan and Keluar, both islands, and is pinned to the
 *   foot of the sidebar with `mt-auto`.
 *
 * They live here so the Astro shell and the React islands cannot drift apart
 * on wording.
 */
export const ADMIN_GROUP_LABEL = 'Administration';
export const UTILITIES_GROUP_LABEL = 'Utilities';

/**
 * The app's primary navigation, split into the two sections that every signed
 * in user sees. The desktop sidebar and the mobile drawer in
 * `DashboardLayout.astro` both render from this list, so a new destination is
 * one edit and both stay in sync.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', Icon: LayoutGrid },
      { href: '/invoices', label: 'Invoice', Icon: FileText },
      { href: '/customers', label: 'Customer', Icon: Users },
      { href: '/catalog', label: 'Katalog', Icon: Package },
      { href: '/templates', label: 'Template', Icon: Palette },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { href: '/billing', label: 'Billing', Icon: CreditCard },
      { href: '/api-keys', label: 'Integration', Icon: KeyRound },
      { href: '/settings', label: 'Settings', Icon: Settings },
    ],
  },
];

/**
 * Flat order of everything the mobile drawer renders, for the staggered
 * entrance: the groups first, then the admin / Pintasan / Keluar islands that
 * follow them. The desktop sidebar has no stagger, so it never reads this.
 */
export function drawerStagger(): Map<string, number> {
  const order = new Map<string, number>();
  let index = 0;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) order.set(item.href, index++);
  }
  for (const island of ['admin', 'shortcuts', 'sign-out']) order.set(island, index++);
  return order;
}
