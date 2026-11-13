import { profileImagePath } from './athlete-avatar-upload';

describe('profileImagePath', () => {
  it('usa o tipo e o instante do envio', () => {
    expect(profileImagePath('u1', 'avatar', 1794224273667)).toBe('profiles/u1/avatar-1794224273667.jpg');
    expect(profileImagePath('u1', 'cover', 1794224273667)).toBe('profiles/u1/cover-1794224273667.jpg');
  });

  it('nunca reaproveita o nome fixo que invalidava a URL antiga', () => {
    expect(profileImagePath('u1', 'avatar')).not.toBe('profiles/u1/avatar.jpg');
    expect(profileImagePath('u1', 'cover')).not.toBe('profiles/u1/cover.jpg');
  });

  it('dois envios em instantes diferentes geram arquivos diferentes', () => {
    expect(profileImagePath('u1', 'avatar', 1000)).not.toBe(profileImagePath('u1', 'avatar', 1001));
  });
});
