import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

void main() {
  _urlDoPerfilPublico();
  test('sem apelido não inventa handle', () {
    final profile = AthleteProfile.fromMap('u1', {'fullName': 'João Silva'});
    expect(athletePublicHandle(profile), isNull);
  });

  test('com apelido devolve @apelido em minúsculas', () {
    final profile = AthleteProfile.fromMap('u1', {
      'fullName': 'Ana Paula',
      'nickname': 'AnaP',
    });
    expect(athletePublicHandle(profile), '@anap');
  });

  test('apelido já com @ não duplica o prefixo', () {
    final profile = AthleteProfile.fromMap('u1', {
      'fullName': 'Ana Paula',
      'nickname': '@anap',
    });
    expect(athletePublicHandle(profile), '@anap');
  });
}

void _urlDoPerfilPublico() {
  group('athletePublicProfileUrl', () {
    AthleteProfile perfil({String id = 'uid123', String? nick}) =>
        AthleteProfile(
          id: id,
          name: 'Ygor Josué',
          nickname: nick,
          sport: 'Vôlei de praia',
          level: 'Iniciante 1',
          city: 'Goiânia',
        );

    test('leva o UID no path, não o apelido', () {
      // A rota do portal se chama `atletas/:handle`, mas o parâmetro é lido
      // como id de documento (`getDoc(public_profiles/{uid})`). Apelido ali
      // dá 404.
      expect(
        athletePublicProfileUrl(perfil(nick: 'Goret')).toString(),
        'https://atleta.nexago.com.br/atletas/uid123',
      );
    });

    test('o link não muda quando o apelido muda', () {
      final semNick = athletePublicProfileUrl(perfil());
      final comNick = athletePublicProfileUrl(perfil(nick: 'Goret'));
      final outroNick = athletePublicProfileUrl(perfil(nick: 'OutroApelido'));

      expect(comNick, semNick);
      expect(outroNick, semNick);
    });

    test('todo atleta tem link, mesmo sem apelido', () {
      expect(
        athletePublicProfileUrl(perfil(nick: null)).toString(),
        contains('/atletas/uid123'),
      );
    });
  });
}
