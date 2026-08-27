import { STORAGE_KEY, getFollowedTournamentIds, isFollowing, toggleFollow } from './follow-storage';

describe('follow-storage', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  describe('getFollowedTournamentIds', () => {
    it('retorna vazio quando nada foi seguido', () => {
      expect(getFollowedTournamentIds()).toEqual([]);
    });

    it('retorna vazio se o localStorage falhar na leitura', () => {
      spyOn(localStorage, 'getItem').and.throwError('blocked');
      expect(getFollowedTournamentIds()).toEqual([]);
    });
  });

  describe('toggleFollow', () => {
    it('passa a seguir um torneio novo', () => {
      expect(toggleFollow('t1')).toBeTrue();
      expect(isFollowing('t1')).toBeTrue();
      expect(getFollowedTournamentIds()).toEqual(['t1']);
    });

    it('deixa de seguir um torneio já seguido', () => {
      toggleFollow('t1');
      expect(toggleFollow('t1')).toBeFalse();
      expect(isFollowing('t1')).toBeFalse();
      expect(getFollowedTournamentIds()).toEqual([]);
    });

    it('coloca o mais recente primeiro', () => {
      toggleFollow('t1');
      toggleFollow('t2');
      expect(getFollowedTournamentIds()).toEqual(['t2', 't1']);
    });

    it('descarta o mais antigo ao passar de 20 seguidos', () => {
      for (let i = 0; i < 21; i++) toggleFollow(`t${i}`);
      const ids = getFollowedTournamentIds();
      expect(ids.length).toBe(20);
      expect(ids[0]).toBe('t20');
      expect(ids).not.toContain('t0');
    });

    it('não muda nada se o localStorage falhar na escrita', () => {
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError');
      expect(toggleFollow('t1')).toBeFalse();
      expect(isFollowing('t1')).toBeFalse();
    });
  });
});
