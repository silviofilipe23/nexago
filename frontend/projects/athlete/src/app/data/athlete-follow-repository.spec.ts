import { buildFollowWrites } from './athlete-follow-repository';

describe('athlete-follow-repository', () => {
  describe('buildFollowWrites', () => {
    it('writes both mirrors when following', () => {
      expect(buildFollowWrites('viewer', 'atleta', true)).toEqual([
        { path: ['users', 'atleta', 'followers', 'viewer'], data: { followedAt: 'serverTimestamp', userId: 'viewer' } },
        { path: ['users', 'viewer', 'following', 'atleta'], data: { followedAt: 'serverTimestamp', userId: 'atleta' } },
      ]);
    });

    it('deletes both mirrors when unfollowing', () => {
      expect(buildFollowWrites('viewer', 'atleta', false)).toEqual([
        { path: ['users', 'atleta', 'followers', 'viewer'], data: null },
        { path: ['users', 'viewer', 'following', 'atleta'], data: null },
      ]);
    });

    it('refuses self-follow', () => {
      expect(buildFollowWrites('viewer', 'viewer', true)).toEqual([]);
    });

    it('refuses empty or blank ids', () => {
      expect(buildFollowWrites('', 'atleta', true)).toEqual([]);
      expect(buildFollowWrites('viewer', '   ', true)).toEqual([]);
    });

    it('trims ids before building the paths', () => {
      expect(buildFollowWrites(' viewer ', ' atleta ', true)[0]?.path).toEqual(['users', 'atleta', 'followers', 'viewer']);
    });
  });
});
