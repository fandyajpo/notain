import { FileText, LayoutGrid, Palette, Settings, Users, type LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

/**
 * The app's primary navigation. The desktop sidebar and the mobile drawer in
 * `DashboardLayout.astro` both render from this list, so a new destination is
 * one edit and both stay in sync. (The admin link is deliberately absent — it
 * only exists for members of the `admins` team and renders as its own island.)
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { href: '/invoices', label: 'Invoice', Icon: FileText },
  { href: '/customers', label: 'Customer', Icon: Users },
  { href: '/templates', label: 'Template', Icon: Palette },
  { href: '/settings', label: 'Pengaturan', Icon: Settings },
];
