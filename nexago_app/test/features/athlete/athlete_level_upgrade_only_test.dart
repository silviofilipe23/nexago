import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/athlete/data/athlete_profile_repository.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_draft.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_providers.dart';

/// Monta um [ProviderContainer] com `athleteProfileProvider` sobrescrito por
/// um perfil fixo, sem depender de Firestore/Auth reais — mesmo padrão de
/// `booking_details_team_providers_test.dart`. `authProvider` resolve pra
/// `null` só pra destravar `gamificationSummaryProvider` (que cai no
/// `GamificationSummary.initial()` sem usuário logado) sem precisar fakear o
/// serviço de gamificação. `athleteProfileRepositoryProvider` vira um no-op:
/// `addSport`/`setPrimary` disparam `_saveNow()` IMEDIATAMENTE (não
/// debounced) — sem esse override, a primeira chamada tentaria
/// `FirebaseFirestore.instance` de verdade e explodiria com `[core/no-app]`.
ProviderContainer _buildContainer(AthleteProfile profile) {
  return ProviderContainer(
    overrides: [
      authProvider.overrideWith((ref) => Stream.value(null)),
      athleteProfileProvider.overrideWith((ref) => Stream.value(profile)),
      athleteProfileRepositoryProvider.overrideWithValue(
        _NoopSaveRepository(),
      ),
    ],
  );
}

/// Espera o `athleteProfileProvider` resolver e devolve o notifier já
/// hidratado (`status == ready`), com um listener vivo pra evitar que o
/// autoDispose derrube o provider entre o `await` e a leitura seguinte.
Future<AthleteSportsLevelsNotifier> _readyNotifier(
  ProviderContainer container,
) async {
  final sub = container.listen(athleteSportsLevelsProvider, (_, __) {});
  await container.read(athleteProfileProvider.future);
  addTearDown(sub.close);
  return container.read(athleteSportsLevelsProvider.notifier);
}

/// `saveProfile` sem efeito — `_firestore`/`_functions` nunca são usados (o
/// override abaixo substitui o único método que os tocaria), então os fakes
/// nunca precisam responder a nada de verdade. `functions:` é passado
/// explícito para não cair no default `FirebaseFunctions.instance` do
/// construtor, que lança `[core/no-app]` sem Firebase inicializado.
class _NoopSaveRepository extends AthleteProfileRepository {
  _NoopSaveRepository()
      : super(_UnusedFirestore(), functions: _UnusedFunctions());

  @override
  Future<void> saveProfile(AthleteProfile profile) async {}
}

class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('AthleteProfileOptions.levelRank', () {
    test('rankeia labels, códigos e legados', () {
      // Escada de 7 níveis (espelho de LEVEL_RANK nas functions): legados
      // caem no degrau inferior do split — iniciante→0, intermediario→2,
      // open→6.
      expect(AthleteProfileOptions.levelRank('Iniciante'), 0);
      expect(AthleteProfileOptions.levelRank('iniciante'), 0);
      expect(AthleteProfileOptions.levelRank('Básico'), 0);
      expect(AthleteProfileOptions.levelRank('Iniciante 1'), 0);
      expect(AthleteProfileOptions.levelRank('Iniciante 2'), 1);
      expect(AthleteProfileOptions.levelRank('iniciante_2'), 1);
      expect(AthleteProfileOptions.levelRank('Intermediário'), 2);
      expect(AthleteProfileOptions.levelRank('intermediario'), 2);
      expect(AthleteProfileOptions.levelRank('Intermediário 1'), 2);
      expect(AthleteProfileOptions.levelRank('intermediario_1'), 2);
      expect(AthleteProfileOptions.levelRank('Intermediário 2'), 3);
      expect(AthleteProfileOptions.levelRank('intermediario_2'), 3);
      expect(AthleteProfileOptions.levelRank('Avançado 1'), 4);
      expect(AthleteProfileOptions.levelRank('avancado_1'), 4);
      expect(AthleteProfileOptions.levelRank('Avançado 2'), 5);
      expect(AthleteProfileOptions.levelRank('avancado_2'), 5);
      expect(AthleteProfileOptions.levelRank('Open'), 6);
      expect(AthleteProfileOptions.levelRank('open'), 6);
      expect(AthleteProfileOptions.levelRank('Open / federado'), 6);
      expect(AthleteProfileOptions.levelRank('livre'), 6);
    });

    test('ausente/desconhecido → null', () {
      expect(AthleteProfileOptions.levelRank(null), isNull);
      expect(AthleteProfileOptions.levelRank(''), isNull);
      expect(AthleteProfileOptions.levelRank('xpto'), isNull);
    });

    test('hierarquia é crescente', () {
      expect(
        AthleteProfileOptions.levelRank('Iniciante')! <
            AthleteProfileOptions.levelRank('Intermediário')!,
        isTrue,
      );
      expect(
        AthleteProfileOptions.levelRank('Intermediário')! <
            AthleteProfileOptions.levelRank('Open')!,
        isTrue,
      );
    });
  });

  group('AthleteSportsLevelsUiState.lockedLevelRankFor', () {
    AthleteSportsLevelsUiState stateWithBaseline(Map<String, String> levels) {
      return AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.ready,
        baseline: AthleteSportsLevelsDraft(
          primaryAppSportId: 'beach_volleyball',
          levelByAppSportId: levels,
        ),
      );
    }

    test('retorna o rank do nível salvo por esporte', () {
      final state = stateWithBaseline({
        'beach_volleyball': 'Intermediário',
        'beach_tennis': 'Open',
      });
      expect(state.lockedLevelRankFor('beach_volleyball'), 2);
      expect(state.lockedLevelRankFor('beach_tennis'), 6);
    });

    test('esporte sem nível salvo → null (primeira definição livre)', () {
      final state = stateWithBaseline({'beach_volleyball': 'Iniciante'});
      expect(state.lockedLevelRankFor('tennis'), isNull);
    });
  });

  group('AthleteSportsLevelsUiState.isLevelLockedFor', () {
    test('true quando o código Firestore do esporte está em levelLocked', () {
      const state = AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.ready,
        levelLocked: {'VOLEI_PRAIA': true},
      );
      expect(state.isLevelLockedFor('beach_volleyball'), isTrue);
    });

    test('false quando o esporte não está no mapa (janela ainda aberta)', () {
      const state = AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.ready,
        levelLocked: {'VOLEI_PRAIA': true},
      );
      expect(state.isLevelLockedFor('beach_tennis'), isFalse);
    });

    test('false para appSportId desconhecido (nunca trava por engano)', () {
      const state = AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.ready,
        levelLocked: {'VOLEI_PRAIA': true},
      );
      expect(state.isLevelLockedFor('xpto'), isFalse);
    });
  });

  group('AthleteSportsLevelsDraft.addSport — escolha obrigatória', () {
    test('nível vazio não adiciona o esporte (no-op)', () {
      const draft = AthleteSportsLevelsDraft();
      final next = draft.addSport('beach_volleyball', '');
      expect(identical(next, draft), isTrue);
      expect(next.enrolledAppSportIds, isEmpty);
    });

    test('nível desconhecido não adiciona o esporte (no-op)', () {
      const draft = AthleteSportsLevelsDraft();
      final next = draft.addSport('beach_volleyball', 'xpto');
      expect(identical(next, draft), isTrue);
    });

    test('nível escolhido adiciona o esporte com exatamente esse nível', () {
      const draft = AthleteSportsLevelsDraft();
      final next = draft.addSport('beach_volleyball', 'Avançado 1');
      expect(next.primaryAppSportId, 'beach_volleyball');
      expect(next.levelByAppSportId['beach_volleyball'], 'Avançado 1');
    });
  });

  group('AthleteSportsLevelsNotifier.updateLevel — janela de calibração', () {
    const profileLocked = AthleteProfile(
      id: 'u1',
      name: 'Ana',
      sport: 'Vôlei de praia',
      level: 'Intermediário 1',
      city: 'Goiânia',
      primarySportFirestoreId: 'VOLEI_PRAIA',
      levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_1'},
      levelLocked: {'VOLEI_PRAIA': true},
    );

    // Mesmo nível salvo, mas SEM levelLocked: 1ª inscrição ainda não
    // aconteceu — janela de correção aberta.
    const profileUnlocked = AthleteProfile(
      id: 'u1',
      name: 'Ana',
      sport: 'Vôlei de praia',
      level: 'Intermediário 1',
      city: 'Goiânia',
      primarySportFirestoreId: 'VOLEI_PRAIA',
      levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_1'},
    );

    test(
      'travado: descer é rejeitado (comportamento de sempre, o ratchet '
      'continua valendo)',
      () async {
        final container = _buildContainer(profileLocked);
        addTearDown(container.dispose);
        final notifier = await _readyNotifier(container);

        notifier.updateLevel('beach_volleyball', 'Iniciante 1');

        final state = container.read(athleteSportsLevelsProvider);
        expect(
          state.draft.levelByAppSportId['beach_volleyball'],
          'Intermediário 1',
        );
      },
    );

    test('travado: subir continua permitido', () async {
      final container = _buildContainer(profileLocked);
      addTearDown(container.dispose);
      final notifier = await _readyNotifier(container);

      notifier.updateLevel('beach_volleyball', 'Avançado 1');

      final state = container.read(athleteSportsLevelsProvider);
      expect(state.draft.levelByAppSportId['beach_volleyball'], 'Avançado 1');
    });

    test(
      'destravado (pré-1ª inscrição): descer é aceito — autocorreção livre',
      () async {
        final container = _buildContainer(profileUnlocked);
        addTearDown(container.dispose);
        final notifier = await _readyNotifier(container);

        notifier.updateLevel('beach_volleyball', 'Iniciante 1');

        final state = container.read(athleteSportsLevelsProvider);
        expect(
          state.draft.levelByAppSportId['beach_volleyball'],
          'Iniciante 1',
        );
      },
    );

    test('destravado: subir continua permitido', () async {
      final container = _buildContainer(profileUnlocked);
      addTearDown(container.dispose);
      final notifier = await _readyNotifier(container);

      notifier.updateLevel('beach_volleyball', 'Avançado 1');

      final state = container.read(athleteSportsLevelsProvider);
      expect(state.draft.levelByAppSportId['beach_volleyball'], 'Avançado 1');
    });
  });

  group('AthleteSportsLevelsNotifier.addSport — escolha obrigatória', () {
    const profileNoSports = AthleteProfile(
      id: 'u1',
      name: 'Ana',
      sport: '',
      level: '',
      city: 'Goiânia',
    );

    test(
      'sem nível escolhido (string vazia): não adiciona o esporte',
      () async {
        final container = _buildContainer(profileNoSports);
        addTearDown(container.dispose);
        final notifier = await _readyNotifier(container);

        notifier.addSport('beach_volleyball', '');

        final state = container.read(athleteSportsLevelsProvider);
        expect(state.draft.enrolledAppSportIds, isEmpty);
      },
    );

    test('com nível escolhido: adiciona com exatamente esse nível', () async {
      final container = _buildContainer(profileNoSports);
      addTearDown(container.dispose);
      final notifier = await _readyNotifier(container);

      notifier.addSport('beach_volleyball', 'Avançado 1');

      final state = container.read(athleteSportsLevelsProvider);
      expect(
        state.draft.levelByAppSportId['beach_volleyball'],
        'Avançado 1',
      );
    });
  });
}
