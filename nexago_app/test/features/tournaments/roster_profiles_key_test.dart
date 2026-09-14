// `rosterProfilesKey` é a chave da family `registrationRosterProfilesProvider`.
// Ela existe porque a family compara argumentos com `==` e `List` compara por
// identidade — uma lista montada no `build` criaria um provider por frame (ver
// a regressão em `tournament_substitution_status_page_test.dart`). Aqui o alvo
// é a canonicalização: o mesmo elenco tem de virar SEMPRE a mesma chave.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';

void main() {
  group('rosterProfilesKey', () {
    test('listas diferentes com o mesmo elenco dão a mesma chave', () {
      expect(
        rosterProfilesKey(['ana', 'carla']),
        rosterProfilesKey(['carla', 'ana']),
      );
    });

    test('ignora repetidos, vazios e espaços em volta', () {
      expect(
        rosterProfilesKey(['carla', ' ana ', 'carla', '', '  ']),
        rosterProfilesKey(['ana', 'carla']),
      );
    });

    test('elencos diferentes dão chaves diferentes', () {
      expect(
        rosterProfilesKey(['ana', 'carla']),
        isNot(rosterProfilesKey(['ana', 'bruno'])),
      );
    });

    test('elenco vazio vira chave vazia (o provider corta antes da rede)', () {
      expect(rosterProfilesKey(const []), isEmpty);
      expect(rosterProfilesKey(const ['', '   ']), isEmpty);
    });
  });
}
