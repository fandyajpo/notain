import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { getActiveOrgId, setActiveOrgId } from './active-org';
import { endOrgSwitch, getOrgSwitch, switchActiveOrg } from './org-switch';

/**
 * `switchActiveOrg` is the single entry point every create/switch flow goes
 * through, so its contract is what keeps those flows consistent: the switch
 * must be ANNOUNCED before the selection changes (OrgGate raises the blocking
 * overlay from that flag on the very commit it resets on), and the two cases
 * with nothing to announce — a first selection and a repeated click — must
 * stay silent.
 */
const ORG_A = 'org_aaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbb';

beforeEach(() => {
  setActiveOrgId(ORG_A);
  endOrgSwitch();
});

describe('switchActiveOrg', () => {
  it('announces the switch before flipping, naming the destination', () => {
    switchActiveOrg(ORG_B, 'Kedua');

    expect(getActiveOrgId()).toBe(ORG_B);
    // The flag is what OrgGate renders its overlay from — without it the gate
    // would blank the page to its loading state with nothing covering it.
    expect(getOrgSwitch()).toMatchObject({ from: ORG_A, to: ORG_B, toName: 'Kedua' });
  });

  it('is a no-op for the organization already active', () => {
    switchActiveOrg(ORG_A, 'Sama');

    expect(getActiveOrgId()).toBe(ORG_A);
    expect(getOrgSwitch()).toBeNull();
  });

  it('selects without a flag when there is no previous organization', () => {
    setActiveOrgId(null);
    endOrgSwitch();

    switchActiveOrg(ORG_A, 'Pertama');

    expect(getActiveOrgId()).toBe(ORG_A);
    // Nothing to block: onboarding switches into the first workspace from an
    // empty selection, where no previous org's UI could still be on screen.
    expect(getOrgSwitch()).toBeNull();
  });
});
