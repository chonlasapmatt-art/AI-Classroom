import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SessionProvider, type SessionValue } from '../app/SessionContext';
import { RepositoryProvider } from '../data/RepositoryContext';
import { getFixtureRepository } from '../data/fixtureSchoolRepository';
import { disablePreviewMode } from './previewMode';

/**
 * Wires the fixture repository and a development-only session into the same providers the cloud
 * path uses, so every screen runs unmodified. Nothing here reaches Supabase or Dexie.
 */
export function PreviewProviders({ children, onExit }: { children: ReactNode; onExit: () => void }) {
  const repository = useMemo(() => getFixtureRepository(), []);
  const memberships = repository.memberships;
  const [membershipId, setMembershipId] = useState(memberships[0]!.membershipId);
  const membership = memberships.find((item) => item.membershipId === membershipId) ?? memberships[0]!;

  useEffect(() => {
    repository.setVisibility({ role: membership.role, profileId: membership.profileId });
  }, [membership, repository]);

  const session: SessionValue = useMemo(() => ({
    mode: 'preview',
    membership,
    memberships,
    selectMembership: setMembershipId,
    signOut: () => { disablePreviewMode(); onExit(); }
  }), [membership, memberships, onExit]);

  return (
    <SessionProvider value={session}>
      <RepositoryProvider repository={repository}>{children}</RepositoryProvider>
    </SessionProvider>
  );
}
