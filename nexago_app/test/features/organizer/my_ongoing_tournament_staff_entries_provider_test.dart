// Cobertura de myOngoingTournamentStaffEntriesProvider
// (lib/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart).
//
// LIMITAÇÃO DE COBERTURA (documentada, não contornada):
// O provider privado `_staffTournamentDetailProvider` (mesmo arquivo, linhas
// 75-78) chama `loadTournamentDetailById(FirebaseFirestore.instance, id)`
// diretamente — não passa por `firestoreProvider` (o padrão usado em ~40
// outros providers do app, ver lib/core/firebase/firebase_providers.dart) e,
// por ser privado, não pode ser sobrescrito a partir de um teste em outro
// arquivo via ProviderContainer overrides.
//
// Sem Firebase inicializado (como em `flutter test`, mesmo padrão documentado
// em athlete_level_upgrade_only_test.dart), `FirebaseFirestore.instance`
// lança `[core/no-app]` SINCRONAMENTE dentro do create() do FutureProvider.
// O Riverpod converte isso em AsyncError, e `.valueOrNull` vira `null` —
// exatamente o mesmo valor que representa "ainda carregando". Ou seja, neste
// ambiente de teste, `detail` é SEMPRE null e a branch
// `!isTournamentTerminal(detail.status)` (linha 92) NUNCA executa.
//
// Por isso só é possível testar aqui, sem tocar a implementação:
//   1) lista de staff vazia → resultado vazio (não itera `_staffTournamentDetailProvider`)
//   2) staff não-vazio + detail não resolvido (aqui, por erro; em produção,
//      também por "ainda carregando") → mantido (comportamento "otimista")
//
// As branches "exclui quando terminal" e "mantém quando aberto/ao vivo" —
// que são a regra de negócio central pedida — dependem de `detail` resolver
// de verdade e NÃO podem ser exercitadas sem inicializar o Firebase de
// verdade ou sem tornar o provider injetável (`firestoreProvider`). A regra
// pura em si (`isTournamentTerminal`) está coberta isoladamente em
// tournament_listing_status_test.dart.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';

ProviderContainer _buildContainer(
  List<MyTournamentStaffEntry> entries,
) {
  return ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(null)),
      myTournamentStaffEntriesProvider.overrideWith(
        (ref) => Stream.value(entries),
      ),
    ],
  );
}

void main() {
  group('myOngoingTournamentStaffEntriesProvider', () {
    test('lista de staff vazia → resultado vazio', () async {
      final container = _buildContainer(const []);
      addTearDown(container.dispose);

      await container.read(myTournamentStaffEntriesProvider.future);
      final result = container.read(myOngoingTournamentStaffEntriesProvider);

      expect(result, isEmpty);
    });

    test(
      'entrada mantida quando o detalhe do torneio ainda não resolveu '
      '(otimista — evita flicker enquanto carrega)',
      () async {
        const entry = MyTournamentStaffEntry(
          tournamentId: 't1',
          role: TournamentStaffRole.manager,
          status: 'active',
          tournamentName: 'Torneio X',
        );
        final container = _buildContainer(const [entry]);
        addTearDown(container.dispose);

        await container.read(myTournamentStaffEntriesProvider.future);
        final result = container.read(myOngoingTournamentStaffEntriesProvider);

        expect(result, [entry]);
      },
    );
  });
}
