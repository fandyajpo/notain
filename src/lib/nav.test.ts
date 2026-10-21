import { describe, expect, it } from 'vite-plus/test';
import { ADMIN_GROUP_LABEL, NAV_GROUPS, UTILITIES_GROUP_LABEL, drawerStagger } from './nav';

const WORKSPACE = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/invoices', label: 'Invoice' },
  { href: '/customers', label: 'Customer' },
  { href: '/catalog', label: 'Katalog' },
  { href: '/templates', label: 'Template' },
];

const ACCOUNT = [
  { href: '/billing', label: 'Billing' },
  { href: '/api-keys', label: 'Integration' },
  { href: '/settings', label: 'Settings' },
];

describe('NAV_GROUPS', () => {
  it('groups every signed-in destination under Workspace and Account', () => {
    expect(NAV_GROUPS.map((group) => group.id)).toEqual(['workspace', 'account']);
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(['Workspace', 'Account']);
  });

  it('lists the workspace and account items in navigation order', () => {
    const strip = (index: number) =>
      NAV_GROUPS[index].items.map(({ href, label }) => ({ href, label }));

    expect(strip(0)).toEqual(WORKSPACE);
    expect(strip(1)).toEqual(ACCOUNT);
  });

  it('keeps the two groups that are islands out of the item lists', () => {
    // Administration and Utilities are rendered by islands (the admin link only
    // exists for the `admins` team, the rest are interactive), so neither may
    // appear here — the shell renders their labels itself.
    const hrefs = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).not.toContain('/admin');
    expect(ADMIN_GROUP_LABEL).toBe('Administration');
    expect(UTILITIES_GROUP_LABEL).toBe('Utilities');
  });

  it('never repeats a destination across the two groups', () => {
    const hrefs = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.every((href) => href.startsWith('/'))).toBe(true);
  });

  it('gives every item a visible label and an icon', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.label.trim().length, `${group.id}: label`).toBeGreaterThan(0);
        // A Lucide icon is a forward-ref component object, not a function —
        // truthiness is the shape-independent check.
        expect(item.Icon, `${group.id}: ${item.label} icon`).toBeTruthy();
      }
    }
  });
});

describe('drawerStagger', () => {
  it('stages the group items first, then the three islands', () => {
    const stagger = drawerStagger();
    const flat = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));

    flat.forEach((href, index) => expect(stagger.get(href)).toBe(index));
    expect(stagger.get('admin')).toBe(flat.length);
    expect(stagger.get('shortcuts')).toBe(flat.length + 1);
    expect(stagger.get('sign-out')).toBe(flat.length + 2);
  });

  it('covers exactly what the drawer renders', () => {
    const stagger = drawerStagger();
    expect(stagger.size).toBe(
      NAV_GROUPS.reduce((total, group) => total + group.items.length, 0) + 3,
    );
  });
});
