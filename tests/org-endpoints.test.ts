import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest as orgsOnRequest } from '../functions/api/orgs';
import { onRequest as acceptOnRequest } from '../functions/api/orgs/accept';
import { onRequest as orgOnRequest } from '../functions/api/orgs/[id]';
import { onRequest as membersOnRequest } from '../functions/api/orgs/[id]/members';
import { onRequest as memberOnRequest } from '../functions/api/orgs/[id]/members/[membershipId]';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env, PagesFunction } from '../functions/_lib/types';

/**
 * The organization surface: list/create, invite/accept, member removal,
 * rename and the cascading delete.
 *
 * The isolation assertions are the point of this file. Multi-tenancy here
 * means membership rows are the only gate, so every test that matters seeds
 * TWO orgs and proves the caller reaches exactly one of them — including the
 * cascade, where deleting org A must leave org B's rows untouched.
 */

const APPWRITE_ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const OWNER = { $id: 'user-1', email: 'budi@example.com' };
const STRANGER = { $id: 'user-2', email: 'asing@example.com' };

let fake: AppwriteFake | null = null;

/**
 * The bearer token `req()` sends. `verifySession` caches a session per TOKEN
 * for 60 s, so a test that switches `fake.account` mid-flight must also
 * switch tokens — otherwise the second identity still resolves to the first.
 */
let token = 'jwt-token';

function env(): Env {
  return {
    ...APPWRITE_ENV,
    // The cascade best-effort-deletes the org's logo object.
    LOGOS: { delete: vi.fn(async () => undefined) },
  } as unknown as Env;
}

function handle(
  handler: PagesFunction<Env>,
  request: Request,
  params: Record<string, string> = {},
  envOverride?: Env,
): Promise<Response> {
  return Promise.resolve(
    handler({ request, params, env: envOverride ?? env(), waitUntil: () => {} }),
  );
}

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://notain.pages.dev${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Switches both the fake's account and the token the next `req()` carries. */
function signInAs(account: { $id: string; email: string } | null): void {
  fake!.account = account;
  token = account ? `jwt-${account.$id}` : 'jwt-signed-out';
}

/** Seeds `orgId` as an organization the given owner created. */
function seedOrg(orgId: string, ownerId = OWNER.$id, name = 'Organisasi'): void {
  fake!.rows.set(`organizations/${orgId}`, {
    $id: orgId,
    name,
    ownerId,
    plan: 'free',
    planExpiresAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z').toISOString(),
  } as Row);
}

function seedMembership(
  orgId: string,
  userId: string,
  options: { role?: string; status?: string; email?: string; id?: string } = {},
): Row {
  const row = {
    $id: options.id ?? `mem_${orgId}_${userId || 'pending'}`,
    orgId,
    userId,
    role: options.role ?? 'member',
    status: options.status ?? 'active',
    inviteEmail: options.email ?? `${userId || 'pending'}@example.com`,
    invitedBy: OWNER.$id,
    createdAt: new Date('2026-10-02T00:00:00.000Z').toISOString(),
  } as Row;
  fake!.rows.set(`memberships/${row.$id}`, row);
  return row;
}

afterEach(() => {
  fake = null;
  token = 'jwt-token';
});

describe('POST /api/orgs — create', () => {
  it('creates the org, its owner membership and its business profile row', async () => {
    fake = appwriteFake();

    const response = await handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'Kopi Senja' }));

    expect(response.status).toBe(201);
    const body = (await response.json()) as { org: { id: string; role: string; plan: string } };
    expect(body.org.id).toMatch(/^org_[0-9a-f]{16}$/);
    expect(body.org.role).toBe('owner');
    expect(body.org.plan).toBe('free');

    const org = fake.rows.get(`organizations/${body.org.id}`);
    expect(org).toMatchObject({ name: 'Kopi Senja', ownerId: OWNER.$id, plan: 'free' });

    const membership = [...fake.rows.values()].find(
      (row) => row.orgId === body.org.id && row.status === 'active',
    );
    expect(membership).toMatchObject({ userId: OWNER.$id, role: 'owner' });

    const profile = fake.rows.get(`profiles/${body.org.id}`);
    expect(profile).toMatchObject({ name: 'Kopi Senja' });
  });

  it('refuses an empty or oversized name', async () => {
    fake = appwriteFake();

    expect((await handle(orgsOnRequest, req('POST', '/api/orgs', { name: '   ' }))).status).toBe(
      400,
    );
    expect(
      (await handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'x'.repeat(129) }))).status,
    ).toBe(400);
    expect(fake.rows.size).toBe(0);
  });

  it('refuses a second organization on the free plan', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner' });

    const response = await handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'Kedua' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'forbidden',
      message: expect.stringContaining('1 organisasi'),
    });
    // The refusal happens before any write: the one seeded org is all there is.
    expect([...fake.rows.keys()].filter((key) => key.startsWith('organizations/'))).toHaveLength(1);
  });

  it('allows a second organization once an owned org is on an active paid plan', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner' });
    // No expiry = never expires; `isSubscriptionActive` treats that as active.
    fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')!.plan = 'pro';

    const response = await handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'Kedua' }));

    expect(response.status).toBe(201);
  });

  it('still refuses when the paid plan has expired', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner' });
    const org = fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')!;
    org.plan = 'pro';
    org.planExpiresAt = new Date('2026-01-01T00:00:00.000Z').toISOString(); // well in the past

    const response = await handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'Kedua' }));

    expect(response.status).toBe(403);
  });

  it('lets an admin skip the plan gate entirely — limits are for customers', async () => {
    fake = appwriteFake(); // the fake's default caller IS on the admins team
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner' });

    const response = await handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'Kedua' }));

    expect(response.status).toBe(201);
  });

  it('rate-fences creation per the hourly org-create budget', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    // Seed an owner's active paid org so the plan gate passes on every attempt:
    // this test is about the fence, not the gate.
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner' });
    fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')!.plan = 'pro';
    const limitedEnv = {
      ...APPWRITE_ENV,
      QUOTA_LIMIT_ORG_CREATE_PER_HOUR: '2',
      LOGOS: { delete: vi.fn() },
    } as unknown as Env;
    const post = () =>
      handle(orgsOnRequest, req('POST', '/api/orgs', { name: 'Org' }), {}, limitedEnv);

    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
  });
});

describe('GET /api/orgs — my orgs and pending invites', () => {
  it('returns only my active memberships plus invites addressed to my email', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa', OWNER.$id, 'Org A');
    seedOrg('org_bbbbbbbbbbbbbbbb', STRANGER.$id, 'Org B');
    seedOrg('org_cccccccccccccccc', STRANGER.$id, 'Org C');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });
    seedMembership('org_bbbbbbbbbbbbbbbb', STRANGER.$id, { email: STRANGER.email });
    // One invite for me (pending), one for someone else — only mine may show.
    seedMembership('org_cccccccccccccccc', '', { status: 'pending', email: OWNER.email });
    seedMembership('org_bbbbbbbbbbbbbbbb', '', {
      status: 'pending',
      email: STRANGER.email,
      id: 'mem_other_pending',
    });

    const response = await handle(orgsOnRequest, req('GET', '/api/orgs'));
    const body = (await response.json()) as {
      orgs: Array<{ id: string; name: string; isOwner: boolean }>;
      pending: Array<{ orgId: string; name: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.orgs.map((org) => org.id)).toEqual(['org_aaaaaaaaaaaaaaaa']);
    expect(body.orgs[0]).toMatchObject({ name: 'Org A', isOwner: true });
    expect(body.pending.map((invite) => invite.orgId)).toEqual(['org_cccccccccccccccc']);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 401 without a session', async () => {
    fake = appwriteFake({ account: null });
    const response = await handle(orgsOnRequest, req('GET', '/api/orgs'));
    expect(response.status).toBe(401);
  });

  it('degrades a business-type slug outside the taxonomy to null', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa', OWNER.$id, 'Org A');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });
    // A row written before the guard existed, carrying a retired slug.
    fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')!.businessType = 'slug-tua';

    const response = await handle(orgsOnRequest, req('GET', '/api/orgs'));
    const body = (await response.json()) as { orgs: Array<{ businessType: string | null }> };
    expect(response.status).toBe(200);
    expect(body.orgs[0]?.businessType).toBeNull();
  });
});

describe('POST /api/orgs/accept', () => {
  it('activates every invite addressed to my email, and only those', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedOrg('org_bbbbbbbbbbbbbbbb');
    const mine = seedMembership('org_aaaaaaaaaaaaaaaa', '', {
      status: 'pending',
      email: OWNER.email,
    });
    const theirs = seedMembership('org_bbbbbbbbbbbbbbbb', '', {
      status: 'pending',
      email: STRANGER.email,
    });

    const response = await handle(acceptOnRequest, req('POST', '/api/orgs/accept'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: ['org_aaaaaaaaaaaaaaaa'] });
    expect(fake.rows.get(`memberships/${mine.$id}`)).toMatchObject({
      userId: OWNER.$id,
      status: 'active',
    });
    // Someone else's invitation is never claimable by my session.
    expect(fake.rows.get(`memberships/${theirs.$id}`)).toMatchObject({
      userId: '',
      status: 'pending',
    });
  });
});

describe('members — invite, list, remove', () => {
  it('holds invites behind coming-soon: 503 for the owner, 403 for a member', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });

    // The owner clears the ownership gate, but the invitation EMAIL is not
    // wired up yet — so the endpoint refuses loudly instead of half-inviting.
    const invite = await handle(
      membersOnRequest,
      req('POST', '/api/orgs/org_aaaaaaaaaaaaaaaa/members', { email: 'Teman@Example.COM' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(invite.status).toBe(503);
    const body = (await invite.json()) as { message?: string };
    expect(body.message).toContain('segera hadir');

    // Nothing was written: there is no half-created invitation to clean up.
    const pendingRows = [...fake.rows.values()].filter(
      (row) => row.orgId === 'org_aaaaaaaaaaaaaaaa' && row.inviteEmail === 'teman@example.com',
    );
    expect(pendingRows).toHaveLength(0);

    // A plain member never reaches the invite path at all.
    seedMembership('org_aaaaaaaaaaaaaaaa', STRANGER.$id, { email: STRANGER.email });
    signInAs(STRANGER);
    const denied = await handle(
      membersOnRequest,
      req('POST', '/api/orgs/org_aaaaaaaaaaaaaaaa/members', { email: 'siapasaja@example.com' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(denied.status).toBe(403);
  });

  it('refuses invites from a plain member and from an outsider', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });
    const memberRow = seedMembership('org_aaaaaaaaaaaaaaaa', STRANGER.$id, {
      email: STRANGER.email,
    });
    expect(memberRow.$id).toBeTruthy();

    // A member of the org: authenticated, but not the owner.
    signInAs(STRANGER);
    const asMember = await handle(
      membersOnRequest,
      req('POST', '/api/orgs/org_aaaaaaaaaaaaaaaa/members', { email: 'x@example.com' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(asMember.status).toBe(403);

    // Not a member at all: the org must be indistinguishable from nonexistent.
    signInAs({ $id: 'user-3', email: 'lain@example.com' });
    const asOutsider = await handle(
      membersOnRequest,
      req('POST', '/api/orgs/org_aaaaaaaaaaaaaaaa/members', { email: 'x@example.com' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(asOutsider.status).toBe(404);
  });

  it('lets the owner remove a member, but never the owner themselves', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });
    const member = seedMembership('org_aaaaaaaaaaaaaaaa', STRANGER.$id, { email: STRANGER.email });

    const removed = await handle(
      memberOnRequest,
      req('DELETE', '/api/orgs/org_aaaaaaaaaaaaaaaa/members/' + member.$id),
      { id: 'org_aaaaaaaaaaaaaaaa', membershipId: member.$id },
    );
    expect(removed.status).toBe(200);
    expect(fake.rows.has(`memberships/${member.$id}`)).toBe(false);

    // Removing the owner — by anyone, themselves included — is refused:
    // a single-owner org without its owner could never be deleted again.
    const ownerRow = [...fake.rows.values()].find((row) => row.role === 'owner')!;
    const selfRemove = await handle(
      memberOnRequest,
      req('DELETE', '/api/orgs/org_aaaaaaaaaaaaaaaa/members/' + ownerRow.$id),
      { id: 'org_aaaaaaaaaaaaaaaa', membershipId: ownerRow.$id },
    );
    expect(selfRemove.status).toBe(409);
    expect(fake.rows.has(`memberships/${ownerRow.$id}`)).toBe(true);
  });

  it('never lets a membership row of another org be deleted through this path', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedOrg('org_bbbbbbbbbbbbbbbb');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });
    const foreign = seedMembership('org_bbbbbbbbbbbbbbbb', STRANGER.$id, { email: STRANGER.email });

    const response = await handle(
      memberOnRequest,
      req('DELETE', `/api/orgs/org_aaaaaaaaaaaaaaaa/members/${foreign.$id}`),
      { id: 'org_aaaaaaaaaaaaaaaa', membershipId: foreign.$id },
    );

    expect(response.status).toBe(404);
    expect(fake.rows.has(`memberships/${foreign.$id}`)).toBe(true);
  });

  it('lists members for any member of the org, and hides the org from outsiders', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });
    seedMembership('org_aaaaaaaaaaaaaaaa', STRANGER.$id, { email: STRANGER.email });

    const mine = await handle(
      membersOnRequest,
      req('GET', '/api/orgs/org_aaaaaaaaaaaaaaaa/members'),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(mine.status).toBe(200);
    const list = (await mine.json()) as { members: Array<{ email: string; isOwner: boolean }> };
    expect(list.members).toHaveLength(2);
    expect(list.members[0]?.isOwner).toBe(true); // owner sorts first

    // STRANGER is a member here, so the outsider must be someone else.
    signInAs({ $id: 'user-3', email: 'lain@example.com' });
    const outsider = await handle(
      membersOnRequest,
      req('GET', '/api/orgs/org_aaaaaaaaaaaaaaaa/members'),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(outsider.status).toBe(404);
  });
});

describe('PATCH /api/orgs/<id> — rename', () => {
  it('renames for the owner and refuses everyone else', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });

    const ok = await handle(
      orgOnRequest,
      req('PATCH', '/api/orgs/org_aaaaaaaaaaaaaaaa', { name: 'Nama Baru' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(ok.status).toBe(200);
    expect(fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')).toMatchObject({
      name: 'Nama Baru',
    });

    signInAs(STRANGER);
    const outsider = await handle(
      orgOnRequest,
      req('PATCH', '/api/orgs/org_aaaaaaaaaaaaaaaa', { name: 'Hacked' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(outsider.status).toBe(404);
    expect(fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')).toMatchObject({
      name: 'Nama Baru',
    });
  });

  it('sets the org business type, rejecting an unknown slug', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });

    const ok = await handle(
      orgOnRequest,
      req('PATCH', '/api/orgs/org_aaaaaaaaaaaaaaaa', { businessType: 'bengkel-mobil' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(ok.status).toBe(200);
    // The type lives on the ORG row, not a profile row.
    expect(fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')).toMatchObject({
      businessType: 'bengkel-mobil',
    });
    expect(fake.rows.get('profiles/org_aaaaaaaaaaaaaaaa')).toBeUndefined();

    const bad = await handle(
      orgOnRequest,
      req('PATCH', '/api/orgs/org_aaaaaaaaaaaaaaaa', { businessType: 'not-a-slug' }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(bad.status).toBe(400);
    expect(fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')).toMatchObject({
      businessType: 'bengkel-mobil',
    });
  });

  it('clears the org business type with an explicit null', async () => {
    fake = appwriteFake();
    seedOrg('org_aaaaaaaaaaaaaaaa');
    fake.rows.set('organizations/org_aaaaaaaaaaaaaaaa', {
      ...fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')!,
      businessType: 'bengkel-mobil',
    } as Row);
    seedMembership('org_aaaaaaaaaaaaaaaa', OWNER.$id, { role: 'owner', email: OWNER.email });

    const response = await handle(
      orgOnRequest,
      req('PATCH', '/api/orgs/org_aaaaaaaaaaaaaaaa', { businessType: null }),
      { id: 'org_aaaaaaaaaaaaaaaa' },
    );
    expect(response.status).toBe(200);
    expect(fake.rows.get('organizations/org_aaaaaaaaaaaaaaaa')).toMatchObject({
      businessType: null,
    });
  });
});

describe('DELETE /api/orgs/<id> — cascade', () => {
  it('wipes every table for that org, leaves other orgs alone, then answers done', async () => {
    fake = appwriteFake();
    const A = 'org_aaaaaaaaaaaaaaaa';
    const B = 'org_bbbbbbbbbbbbbbbb';
    seedOrg(A);
    seedOrg(B);
    seedMembership(A, OWNER.$id, { role: 'owner', email: OWNER.email });
    seedMembership(A, STRANGER.$id, { email: STRANGER.email });
    seedMembership(B, STRANGER.$id, { role: 'owner', email: STRANGER.email });
    fake.rows.set(`profiles/${A}`, { $id: A, name: 'Org A', logoFileId: 'logos_x.png' } as Row);
    fake.rows.set('invoices/inv-a1', { $id: 'inv-a1', orgId: A, invoiceNumber: 'INV-1' } as Row);
    fake.rows.set('invoices/inv-a2', { $id: 'inv-a2', orgId: A, invoiceNumber: 'INV-2' } as Row);
    fake.rows.set('invoices/inv-b1', { $id: 'inv-b1', orgId: B, invoiceNumber: 'INV-9' } as Row);
    fake.rows.set('customers/cust-a', { $id: 'cust-a', orgId: A, name: 'Budi' } as Row);
    fake.rows.set('payments/pay-a', { $id: 'pay-a', orgId: A, status: 'paid' } as Row);

    const first = await handle(orgOnRequest, req('DELETE', `/api/orgs/${A}`), { id: A });
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ done: true });

    // Everything of A is gone — rows, memberships, identity, root.
    expect(fake.rows.has(`organizations/${A}`)).toBe(false);
    expect(fake.rows.has(`profiles/${A}`)).toBe(false);
    expect(fake.rows.has('invoices/inv-a1')).toBe(false);
    expect(fake.rows.has('invoices/inv-a2')).toBe(false);
    expect(fake.rows.has('customers/cust-a')).toBe(false);
    expect(fake.rows.has('payments/pay-a')).toBe(false);
    const aMemberships = [...fake.rows.keys()].filter((key) => key.startsWith('memberships/'));
    expect(aMemberships.filter((key) => fake!.rows.get(key)?.orgId === A)).toHaveLength(0);

    // Org B is untouched — the cascade matched on orgId, never "all rows".
    expect(fake.rows.has(`organizations/${B}`)).toBe(true);
    expect(fake.rows.has('invoices/inv-b1')).toBe(true);
    expect(fake.rows.has('memberships/mem_org_bbbbbbbbbbbbbbbb_user-2')).toBe(true);

    // The loop's terminal call: nothing left, and it is not an error.
    const second = await handle(orgOnRequest, req('DELETE', `/api/orgs/${A}`), { id: A });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ done: true });
  });

  it('refuses a non-owner member while the org still exists', async () => {
    fake = appwriteFake();
    const A = 'org_aaaaaaaaaaaaaaaa';
    seedOrg(A);
    seedMembership(A, OWNER.$id, { role: 'owner', email: OWNER.email });
    seedMembership(A, STRANGER.$id, { email: STRANGER.email });
    signInAs(STRANGER);

    const response = await handle(orgOnRequest, req('DELETE', `/api/orgs/${A}`), { id: A });
    expect(response.status).toBe(403);
    expect(fake.rows.has(`organizations/${A}`)).toBe(true);
  });
});
