import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/data/organizer_match_schedule_service.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_auto_schedule_page.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';

/// Cobertura do novo switch "Reagendamento dinâmico" (H3 — Auto-programação).
///
/// Regras travadas aqui:
/// 1. O valor exibido no `SwitchListTile` reflete
///    `config.dynamicRescheduleEnabled`, que chega via
///    `organizerMatchOpsConfigProvider` (stream do Firestore) — não é estado
///    local da tela.
/// 2. Tocar no switch chama
///    `OrganizerMatchScheduleService.updateMatchOpsSettings` com o
///    `tournamentId` da tela e o valor OPOSTO ao atual.
/// 3. Enquanto a chamada está pendente, `_savingDynamicReschedule` desabilita
///    o switch (`onChanged: null`); ao terminar — com sucesso OU com erro —
///    ele volta a ficar habilitado.
void main() {
  const tournamentId = 't1';

  late _FakeMatchScheduleService scheduleService;

  Future<void> pumpAutoSchedulePage(
    WidgetTester tester, {
    required TournamentMatchOpsConfig config,
  }) async {
    scheduleService = _FakeMatchScheduleService();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          organizerMatchScheduleServiceProvider
              .overrideWithValue(scheduleService),
          // `organizerMatchOpsStateProvider.config` deriva DESTA stream —
          // é ela que precisa mudar para simular o Firestore reagindo, não
          // um estado local da tela.
          organizerMatchOpsConfigProvider(tournamentId)
              .overrideWith((ref) => Stream.value(config)),
          organizerTournamentCourtsProvider(tournamentId).overrideWith(
            (ref) => Stream.value(const <TournamentCourt>[]),
          ),
          organizerTournamentMatchesProvider(tournamentId).overrideWith(
            (ref) => Stream.value(const <TournamentMatch>[]),
          ),
          organizerMatchCardsByIdProvider(tournamentId).overrideWith(
            (ref) => Stream.value(<String, TournamentMatchCardViewModel>{}),
          ),
          organizerTournamentDetailProvider(tournamentId).overrideWith(
            (ref) => Stream.value(
              const OrganizerTournamentDetailState(isLoading: false),
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: OrganizerAutoSchedulePage(tournamentId: tournamentId),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder dynamicRescheduleSwitch() => find.widgetWithText(
        SwitchListTile,
        'Reagendamento dinâmico',
      );

  testWidgets(
    'aparece na tela e reflete config.dynamicRescheduleEnabled == false',
    (tester) async {
      await pumpAutoSchedulePage(
        tester,
        config: const TournamentMatchOpsConfig(
          dynamicRescheduleEnabled: false,
        ),
      );

      expect(dynamicRescheduleSwitch(), findsOneWidget);
      final tile = tester.widget<SwitchListTile>(dynamicRescheduleSwitch());
      expect(tile.value, isFalse);
    },
  );

  testWidgets(
    'reflete config.dynamicRescheduleEnabled == true',
    (tester) async {
      await pumpAutoSchedulePage(
        tester,
        config: const TournamentMatchOpsConfig(
          dynamicRescheduleEnabled: true,
        ),
      );

      final tile = tester.widget<SwitchListTile>(dynamicRescheduleSwitch());
      expect(tile.value, isTrue);
    },
  );

  testWidgets(
    'acompanha o provider AO VIVO: quando o stream emite um novo valor sem '
    'nenhum toque no switch, o valor exibido muda sozinho — não fica preso '
    'ao valor capturado no primeiro build (o que aconteceria se a tela '
    'copiasse config.dynamicRescheduleEnabled pra um campo local, como '
    '_avoidConflict/_respectDeps/_scheduleFrom já fazem hoje)',
    (tester) async {
      final controller = StreamController<TournamentMatchOpsConfig>();
      addTearDown(controller.close);
      scheduleService = _FakeMatchScheduleService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            organizerMatchScheduleServiceProvider
                .overrideWithValue(scheduleService),
            organizerMatchOpsConfigProvider(tournamentId)
                .overrideWith((ref) => controller.stream),
            organizerTournamentCourtsProvider(tournamentId).overrideWith(
              (ref) => Stream.value(const <TournamentCourt>[]),
            ),
            organizerTournamentMatchesProvider(tournamentId).overrideWith(
              (ref) => Stream.value(const <TournamentMatch>[]),
            ),
            organizerMatchCardsByIdProvider(tournamentId).overrideWith(
              (ref) => Stream.value(<String, TournamentMatchCardViewModel>{}),
            ),
            organizerTournamentDetailProvider(tournamentId).overrideWith(
              (ref) => Stream.value(
                const OrganizerTournamentDetailState(isLoading: false),
              ),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: OrganizerAutoSchedulePage(tournamentId: tournamentId),
          ),
        ),
      );

      controller.add(
        const TournamentMatchOpsConfig(dynamicRescheduleEnabled: false),
      );
      // Dois `pump()`: o primeiro drena o microtask do `StreamController`
      // (repropaga pelos providers combinados); o segundo renderiza o frame
      // com o novo `config`. Mesmo padrão já usado com `matchController` em
      // `organizer_match_live_table_full_mode_test.dart`.
      await tester.pump();
      await tester.pump();

      expect(
        tester.widget<SwitchListTile>(dynamicRescheduleSwitch()).value,
        isFalse,
      );

      // Segundo valor DIFERENTE, direto do "Firestore" — sem nenhum tap no
      // switch.
      controller.add(
        const TournamentMatchOpsConfig(dynamicRescheduleEnabled: true),
      );
      await tester.pump();
      await tester.pump();

      expect(
        tester.widget<SwitchListTile>(dynamicRescheduleSwitch()).value,
        isTrue,
        reason: 'o switch deveria refletir o provider ao vivo, não um valor '
            'capturado uma vez em initState/campo local',
      );
      expect(
        scheduleService.updateMatchOpsSettingsCalls,
        isEmpty,
        reason: 'a mudança veio só do stream — nenhum tap aconteceu, então '
            'a callable não deveria ter sido chamada',
      );
    },
  );

  testWidgets(
    'tocar no switch (desligado) chama updateMatchOpsSettings com o '
    'tournamentId certo e value=true (o oposto do atual)',
    (tester) async {
      await pumpAutoSchedulePage(
        tester,
        config: const TournamentMatchOpsConfig(
          dynamicRescheduleEnabled: false,
        ),
      );

      await tester.tap(dynamicRescheduleSwitch());
      await tester.pumpAndSettle();

      expect(scheduleService.updateMatchOpsSettingsCalls, hasLength(1));
      final call = scheduleService.updateMatchOpsSettingsCalls.single;
      expect(call.tournamentId, tournamentId);
      expect(call.dynamicRescheduleEnabled, isTrue);
    },
  );

  testWidgets(
    'tocar no switch (ligado) chama updateMatchOpsSettings com value=false',
    (tester) async {
      await pumpAutoSchedulePage(
        tester,
        config: const TournamentMatchOpsConfig(
          dynamicRescheduleEnabled: true,
        ),
      );

      await tester.tap(dynamicRescheduleSwitch());
      await tester.pumpAndSettle();

      expect(scheduleService.updateMatchOpsSettingsCalls, hasLength(1));
      final call = scheduleService.updateMatchOpsSettingsCalls.single;
      expect(call.tournamentId, tournamentId);
      expect(call.dynamicRescheduleEnabled, isFalse);
    },
  );

  testWidgets(
    'fica desabilitado enquanto a chamada está pendente e volta a habilitar '
    'após ela terminar com SUCESSO',
    (tester) async {
      final completer = Completer<bool>();
      await pumpAutoSchedulePage(
        tester,
        config: const TournamentMatchOpsConfig(
          dynamicRescheduleEnabled: false,
        ),
      );
      scheduleService.nextUpdateMatchOpsSettingsResult = completer.future;

      await tester.tap(dynamicRescheduleSwitch());
      // Um único `pump()` (sem `pumpAndSettle`): a chamada ainda está
      // pendente porque o completer não foi resolvido.
      await tester.pump();

      final pendingTile =
          tester.widget<SwitchListTile>(dynamicRescheduleSwitch());
      expect(
        pendingTile.onChanged,
        isNull,
        reason: '_savingDynamicReschedule deveria desabilitar o switch '
            'enquanto a chamada está em andamento',
      );
      // O valor exibido continua vindo do provider (não otimista): a tela
      // não flipa o switch sozinha antes do Firestore confirmar.
      expect(pendingTile.value, isFalse);

      completer.complete(true);
      await tester.pumpAndSettle();

      final settledTile =
          tester.widget<SwitchListTile>(dynamicRescheduleSwitch());
      expect(
        settledTile.onChanged,
        isNotNull,
        reason: 'depois que a chamada termina o switch deveria voltar a '
            'ficar habilitado',
      );
    },
  );

  testWidgets(
    'fica desabilitado enquanto a chamada está pendente e volta a habilitar '
    'mesmo quando ela termina com ERRO',
    (tester) async {
      await pumpAutoSchedulePage(
        tester,
        config: const TournamentMatchOpsConfig(
          dynamicRescheduleEnabled: false,
        ),
      );
      final completer = Completer<bool>();
      scheduleService.nextUpdateMatchOpsSettingsResult = completer.future;

      await tester.tap(dynamicRescheduleSwitch());
      await tester.pump();

      expect(
        tester.widget<SwitchListTile>(dynamicRescheduleSwitch()).onChanged,
        isNull,
      );

      completer.completeError(Exception('falha de rede simulada'));
      // A tela captura o erro e mostra um snackbar; dá tempo da animação
      // do SnackBar entrar/sair sem travar em loop infinito.
      await tester.pump();
      await tester.pump(const Duration(seconds: 4));

      final settledTile =
          tester.widget<SwitchListTile>(dynamicRescheduleSwitch());
      expect(
        settledTile.onChanged,
        isNotNull,
        reason: 'mesmo com erro, o switch não pode ficar travado desabilitado '
            'para sempre',
      );
    },
  );
}

/// Dublê do serviço de callables: registra as chamadas de
/// `updateMatchOpsSettings` sem tocar em `FirebaseFunctions`. `noSuchMethod`
/// faz qualquer outra operação estourar se a tela passar a chamá-la sem que
/// este teste tenha sido atualizado para cobrir.
class _FakeMatchScheduleService implements OrganizerMatchScheduleService {
  final updateMatchOpsSettingsCalls =
      <({String tournamentId, bool dynamicRescheduleEnabled})>[];

  /// Permite ao teste segurar a resolução da chamada para inspecionar o
  /// estado "em andamento" (`_savingDynamicReschedule`) antes de liberar.
  /// Quando `null`, a chamada resolve de imediato com sucesso (`true`).
  Future<bool>? nextUpdateMatchOpsSettingsResult;

  @override
  Future<bool> updateMatchOpsSettings({
    required String tournamentId,
    required bool dynamicRescheduleEnabled,
  }) {
    updateMatchOpsSettingsCalls.add((
      tournamentId: tournamentId,
      dynamicRescheduleEnabled: dynamicRescheduleEnabled,
    ));
    return nextUpdateMatchOpsSettingsResult ?? Future.value(true);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      'O dublê do serviço de agendamento não implementa '
      '${invocation.memberName}. Se a tela passou a chamá-lo, cubra-o aqui.',
    );
  }
}
