import { createClient, type Transport, type TransportRequest } from '../api/client';
import { createMockState, mockTransport } from '../api/mock';
import { memberActions } from '../lib/leadership';

function recording() {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    calls.push(req);
    return { status: 200, data: {} };
  };
  return { calls, api: createClient({ transport, getToken: () => 't' }) };
}

describe('leader and admin client methods', () => {
  it('call the documented paths with the documented bodies', async () => {
    const { calls, api } = recording();
    await api.manage('st nick');
    await api.memberAction('stnicholas', 12, 'make_leader');
    await api.invites('stnicholas');
    await api.createInvite('stnicholas', { days: 7, uses: 20 });
    await api.revokeInvite('stnicholas', 3);
    await api.postAnnouncement('stnicholas', 'Saturday 8 am');
    await api.deleteAnnouncement('stnicholas', 9);
    await api.clubLifts('stnicholas');
    await api.clubLifts('stnicholas', 'reviewed');
    await api.reviewLift(44, 'reject', 'Depth');
    await api.adminSummary();
    await api.adminApplications();
    await api.decideApplication(5, { action: 'approve', slug: 'stherman' });
    await api.adminLifts();
    expect(calls.map((c) => `${c.method} ${c.path} ${c.body === undefined ? '' : JSON.stringify(c.body)}`.trim())).toEqual([
      'GET /clubs/st%20nick/manage',
      'POST /clubs/stnicholas/members/12 {"action":"make_leader"}',
      'GET /clubs/stnicholas/invites',
      'POST /clubs/stnicholas/invites {"days":7,"uses":20}',
      'DELETE /clubs/stnicholas/invites/3',
      'POST /clubs/stnicholas/announcements {"body":"Saturday 8 am"}',
      'DELETE /clubs/stnicholas/announcements/9',
      'GET /clubs/stnicholas/lifts?status=pending',
      'GET /clubs/stnicholas/lifts?status=reviewed',
      'POST /lifts/44/review {"action":"reject","note":"Depth"}',
      'GET /admin/summary',
      'GET /admin/applications',
      'POST /admin/applications/5 {"action":"approve","slug":"stherman"}',
      'GET /admin/lifts',
    ]);
  });
});

describe('leader and admin mock', () => {
  const make = async () => {
    let token: string | null = null;
    const state = createMockState();
    const api = createClient({ transport: mockTransport(state, 0), getToken: () => token });
    token = (await api.login('moses@demo.test', 'pw', 'test')).token;
    const slug = (await api.me()).clubs[0].slug;
    return { api, state, slug };
  };

  it('shows the Lead view to leaders and staff only', async () => {
    const { api, state, slug } = await make();
    expect((await api.me()).clubs[0].can_lead).toBe(true);
    expect((await api.club(slug)).can_lead).toBe(true);
    const view = await api.manage(slug);
    expect(view.requests.length).toBeGreaterThan(0);
    state.me.is_staff = false;
    state.me.clubs[0].can_lead = false;
    await expect(api.manage(slug)).rejects.toMatchObject({ status: 403 });
    await expect(api.adminSummary()).rejects.toMatchObject({ status: 403 });
  });

  it('follows the member rules', async () => {
    const { api, state, slug } = await make();
    const view = await api.manage(slug);
    const request = view.requests[0];
    const approved = await api.memberAction(slug, request.id, 'approve');
    expect(approved.message).toMatch(/is in/);
    const member = (await api.manage(slug)).members.find((m) => m.id === request.id)!;
    expect(member.role).toBe('member');
    expect((await api.club(slug)).members.some((m) => m.name === request.name)).toBe(true);
    await api.memberAction(slug, member.id, 'make_leader');
    await expect(api.memberAction(slug, member.id, 'make_leader')).rejects.toMatchObject({ status: 400 });
    await api.memberAction(slug, member.id, 'make_member');
    await api.memberAction(slug, member.id, 'remove');
    expect((await api.manage(slug)).members.some((m) => m.id === member.id)).toBe(false);

    const founder = view.members.find((m) => m.role === 'founder')!;
    await expect(api.memberAction(slug, founder.id, 'remove')).rejects.toMatchObject({ status: 400 });
    state.me.is_staff = false;
    await expect(api.memberAction(slug, founder.id, 'make_member')).rejects.toMatchObject({ status: 403 });
  });

  it('creates, lists and revokes invites, and posts and deletes announcements', async () => {
    const { api, slug } = await make();
    const inv = await api.createInvite(slug, { days: 7, uses: 5 });
    expect(inv.url).toMatch(/\/me\/invite\//);
    expect(inv.max_uses).toBe(5);
    expect((await api.invites(slug)).invites.some((i) => i.id === inv.id)).toBe(true);
    await api.revokeInvite(slug, inv.id);
    expect((await api.invites(slug)).invites.some((i) => i.id === inv.id)).toBe(false);
    await expect(api.postAnnouncement(slug, '  ')).rejects.toMatchObject({ status: 400 });
    const a = await api.postAnnouncement(slug, 'Bring chalk.');
    expect((await api.club(slug)).announcements[0]).toMatchObject({ id: a.id, body: 'Bring chalk.' });
    await api.deleteAnnouncement(slug, a.id!);
    expect((await api.club(slug)).announcements.some((x) => x.id === a.id)).toBe(false);
  });

  it('verifies and rejects lifts, never your own', async () => {
    const { api, slug } = await make();
    const { lifts } = await api.clubLifts(slug);
    const mine = lifts.find((l) => !l.can_review)!;
    const theirs = lifts.find((l) => l.can_review)!;
    expect(mine).toBeTruthy();
    await expect(api.reviewLift(mine.id, 'verify')).rejects.toMatchObject({ status: 403 });
    await expect(api.reviewLift(theirs.id, 'reject', '')).rejects.toMatchObject({ status: 400 });
    const before = (await api.manage(slug)).pending_lifts;
    const out = await api.reviewLift(theirs.id, 'verify');
    expect(out.lift).toMatchObject({ status: 'verified', reviewer: 'Fr. Moses' });
    expect((await api.manage(slug)).pending_lifts).toBe(before - 1);
    expect((await api.clubLifts(slug, 'reviewed')).lifts[0].id).toBe(theirs.id);
    expect((await api.adminLifts()).lifts.some((l) => l.id === theirs.id)).toBe(false);
  });

  it('approves and rejects club applications', async () => {
    const { api, slug } = await make();
    const { applications } = await api.adminApplications();
    const app = applications[0];
    await expect(api.decideApplication(app.id, { action: 'reject', note: '' })).rejects.toMatchObject({ status: 400 });
    await expect(api.decideApplication(app.id, { action: 'approve', slug })).rejects.toMatchObject({ status: 400 });
    const out = await api.decideApplication(app.id, { action: 'approve' });
    expect(out.club?.slug).toBe(app.slug);
    const summary = await api.adminSummary();
    expect(summary.pending_applications).toBe(0);
    expect(summary.clubs.some((c) => c.slug === app.slug)).toBe(true);
  });
});

describe('member actions offered', () => {
  const m = (role: string, is_me = false) => ({ id: 1, name: 'X', role, is_me, program: null });
  it('match the server rules', () => {
    expect(memberActions(m('member'))).toEqual(['make_leader', 'remove']);
    expect(memberActions(m('leader'))).toEqual(['make_member', 'remove']);
    expect(memberActions(m('founder'))).toEqual([]);
    expect(memberActions(m('leader', true))).toEqual([]);
  });
});
