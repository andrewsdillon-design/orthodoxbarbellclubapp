// What a club leader may do, mirroring obc/leadership.py on the server (which has the final say).
import type { ManagedMember, MemberAction } from '../api/types';

/**
 * Which actions to offer on a member, following obc/leadership.py: nothing on yourself, and nothing on a
 * founder (the server only lets an admin act on one, and even then there's no role change or removal to make).
 */
export function memberActions(m: ManagedMember): MemberAction[] {
  if (m.is_me || m.role === 'founder') return [];
  if (m.role === 'leader') return ['make_member', 'remove'];
  if (m.role === 'member') return ['make_leader', 'remove'];
  return [];
}
