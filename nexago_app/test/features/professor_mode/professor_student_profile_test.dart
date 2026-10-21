import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_follow_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_privacy_preferences.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/public_profile_game_summary.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/athlete_public_profile_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_student_profile_providers.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_student_profile_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts, professorTestNow;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

AthleteMatchHistoryItem match(String id, DateTime at, {required bool win}) =>
    AthleteMatchHistoryItem(
      id: id,
      playedAt: at,
      result: win ? AthleteMatchResult.win : AthleteMatchResult.loss,
      opponentLabel: 'Lia M. & Rita S.',
      competitionLabel: 'Copa Primavera CFC',
      scoreDisplay: '6–3',
    );

AthleteMatchHistoryBundle history({
  List<AthleteMatchHistoryItem>? matches,
  List<AthleteTournamentHistoryItem>? tournaments,
}) =>
    AthleteMatchHistoryBundle(
      matches: matches ??
          [
            match('m1', DateTime(2026, 10, 18), win: true),
            match('m2', DateTime(2026, 10, 18, 12), win: false),
            match('m3', DateTime(2026, 10, 14), win: true),
            match('m4', DateTime(2026, 10, 9), win: true),
          ],
      tournaments: tournaments ??
          const [
            AthleteTournamentHistoryItem(
              id: 't1',
              tournamentId: 't1',
              name: 'Copa Primavera CFC',
              venue: 'Arena CFC',
              periodLabel: '18 out',
              categoryLabel: 'Iniciante',
              genderLabel: 'Feminino',
              placement: 3,
              medal: TournamentPlacement.bronze,
              wins: 3,
              losses: 1,
            ),
          ],
      seasonSummary: const AthleteSeasonSummary(
        year: 2026,
        winRatePercent: 75,
        wins: 3,
        losses: 1,
      ),
    );

AthleteProfile athlete({
  AthleteProfileVisibility visibility = AthleteProfileVisibility.public,
  bool frequentPartners = true,
}) =>
    AthleteProfile(
      id: 'ath-1',
      name: 'Carla Dias',
      nickname: 'carladias',
      sport: 'Beach Tennis',
      level: 'iniciante',
      city: 'Goiânia',
      privacyPreferences: AthletePrivacyPreferences(
        profileVisibility: visibility,
        showOthers: AthletePrivacyShowOthers(
          frequentPartners: frequentPartners,
        ),
      ),
    );

List<Override> profileOverrides(AthleteProfile profile) => [
      authProvider.overrideWith((ref) => Stream.value(null)),
      athleteProfileByIdProvider('ath-1')
          .overrideWith((ref) => Stream.value(profile)),
      userConfirmedPeladasProvider('ath-1')
          .overrideWith((ref) => Stream.value(const [])),
      athletePublicRankingProvider('ath-1').overrideWith(
        (ref) async => const AthletePublicRankingSnapshot(
          rank: 38,
          points: 120,
          tournamentsCount: 1,
          seasonYear: 2026,
        ),
      ),
      athletePublicPartnersProvider('ath-1').overrideWith(
        (ref) async => const [
          AthletePublicPartnerEntry(
            userId: 'ath-2',
            name: 'Bruno Alves',
            initials: 'BA',
            avatarUrl: null,
            subtitle: '',
          ),
        ],
      ),
      athleteFollowersCountProvider('ath-1')
          .overrideWith((ref) => Stream.value(0)),
      athleteFollowingCountProvider('ath-1')
          .overrideWith((ref) => Stream.value(0)),
      athleteIsFollowingProvider('ath-1')
          .overrideWith((ref) => Stream.value(false)),
      athleteSportRanksProvider('ath-1').overrideWith((ref) async => const {}),
      sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
      athletePublicMatchHistoryProvider('ath-1')
          .overrideWith((ref) async => history()),
    ];

Widget stub(String label) => Scaffold(body: Center(child: Text(label)));

/// A tela do professor numa rota real, com a avaliação como destino.
Future<void> pumpProfile(
  WidgetTester tester,
  AthleteProfile profile, {
  bool professorView = true,
}) async {
  tester.view.physicalSize = const Size(390, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: '/perfil',
    routes: [
      GoRoute(
        path: '/perfil',
        builder: (_, __) => professorView
            ? const ProfessorStudentProfilePage(athleteId: 'ath-1')
            : const AthletePublicProfilePage(userId: 'ath-1'),
      ),
      GoRoute(
        path: AppRoutes.professorEvaluate,
        name: AppRouteNames.professorEvaluate,
        builder: (_, state) =>
            stub('avaliar ${state.pathParameters['athleteId']}'),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: profileOverrides(profile),
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settleProfessorStudents(tester);
}

Override previewOverride(String athleteId, ProfessorStudentProfilePreview p) =>
    professorStudentProfilePreviewProvider(athleteId)
        .overrideWith((ref) async => p);

const carlaPreview = ProfessorStudentProfilePreview(
  sportLevel: 'Beach Tennis · Iniciante',
  summary: PublicProfileGameSummary(matches: 34, wins: 19, tournaments: 2, rank: 38),
);

Future<void> tapAndSettle(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('resumo dos jogos (lógica)', () {
    test('conta jogos, vitórias, torneios e a forma recente', () {
      final s = summarizePublicProfileGames(
        history: history(),
        ranking: const AthletePublicRankingSnapshot(rank: 38),
      );
      expect(s.matches, 4);
      expect(s.wins, 3);
      expect(s.losses, 1);
      expect(s.winRatePercent, 75);
      expect(s.tournaments, 1);
      expect(s.rank, 38);
      // Mais recente primeiro: a derrota do meio-dia de 18/10.
      expect(s.recentForm, [false, true, true, true]);
    });

    test('sem histórico: sem taxa e sem posição', () {
      final s = summarizePublicProfileGames();
      expect(s.matches, 0);
      expect(s.winRatePercent, isNull);
      expect(s.hasRank, isFalse);
      expect(publicProfilePreviewLine(s), '');
      expect(publicProfileProfessorNote(s), contains('Ainda sem partidas'));
    });

    test('linha de prévia e nota com números reais', () {
      const s = PublicProfileGameSummary(
        matches: 34,
        wins: 19,
        tournaments: 2,
        rank: 38,
        recentForm: [true, false, true, true, false],
      );
      expect(publicProfilePreviewLine(s), '34 jogos · 2 torneios · #38 no ranking');
      expect(
        publicProfileProfessorNote(s),
        '19 vitórias em 34 partidas de torneio (56%). Nos 5 últimos: 3V · 2D.',
      );
      expect(
        publicProfilePreviewLine(const PublicProfileGameSummary(matches: 1, tournaments: 1)),
        '1 jogo · 1 torneio',
      );
    });

    test('prévia restrita não carrega número', () {
      const p = ProfessorStudentProfilePreview.restricted();
      expect(p.subtitle, contains('Perfil privado'));
      expect(p.subtitle, isNot(contains('#')));
      expect(carlaPreview.subtitle,
          'Beach Tennis · Iniciante · 34 jogos · 2 torneios · #38 no ranking');
    });
  });

  group('privacidade (lógica)', () {
    const private = AthletePrivacyPreferences(
      profileVisibility: AthleteProfileVisibility.private,
    );
    const noPartners = AthletePrivacyPreferences(
      showOthers: AthletePrivacyShowOthers(frequentPartners: false),
    );

    test('perfil privado fecha para o professor como para qualquer um', () {
      for (final professorView in [true, false]) {
        expect(
          publicProfileVisibilityFor(private,
                  isSelf: false, professorView: professorView)
              .blocked,
          isTrue,
        );
      }
      expect(
        publicProfileVisibilityFor(private, isSelf: true, professorView: false)
            .blocked,
        isFalse,
      );
    });

    test('"amigos" segue aberto (v1 trata como público)', () {
      const friends = AthletePrivacyPreferences(
        profileVisibility: AthleteProfileVisibility.friends,
      );
      expect(
        publicProfileVisibilityFor(friends, isSelf: false, professorView: true)
            .blocked,
        isFalse,
      );
    });

    test('parceiros frequentes desligado esconde as duplas do professor', () {
      expect(
        publicProfileVisibilityFor(noPartners,
                isSelf: false, professorView: true)
            .showPartners,
        isFalse,
      );
      // A visão comum fica como era.
      expect(
        publicProfileVisibilityFor(noPartners,
                isSelf: false, professorView: false)
            .showPartners,
        isTrue,
      );
    });
  });

  group('I1 entrada na página do aluno', () {
    testWidgets('B3: card com a prévia abre o perfil do uid do aluno',
        (tester) async {
      await pumpProfessorStudentsApp(
        tester,
        repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
        location: '${AppRoutes.professorStudents}/arena-cfc/s1',
        overrides: [previewOverride('ath-1', carlaPreview)],
        extraRoutes: [
          GoRoute(
            path: AppRoutes.professorStudentProfile,
            name: AppRouteNames.professorStudentProfile,
            builder: (_, state) => stub(
              'perfil ${state.pathParameters['athleteId']} '
              '${state.pathParameters['studentId']}',
            ),
          ),
        ],
      );
      expect(find.text('Perfil público de atleta'), findsOneWidget);
      expect(
        find.text(
            'Beach Tennis · Iniciante · 34 jogos · 2 torneios · #38 no ranking'),
        findsOneWidget,
      );

      await tapAndSettle(
          tester, find.byKey(const Key('professor-student-public-profile')));
      expect(find.text('perfil ath-1 s1'), findsOneWidget);
    });

    testWidgets('B3: aluno sem conta de atleta não tem o card',
        (tester) async {
      await pumpProfessorStudentsApp(
        tester,
        repo: FakeProfessorStudentsRepository([
          professorStudentsSnapshot(students: [
            studentMap({'athleteId': null}),
          ]),
        ]),
        location: '${AppRoutes.professorStudents}/arena-cfc/s1',
      );
      expect(find.text('João Silva'), findsWidgets);
      expect(find.byKey(const Key('professor-student-public-profile')),
          findsNothing);
    });

    testWidgets('B4: card da carteira abre o perfil e mostra "privado"',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(),
        plans: walletPlans(),
        students: [walletStudent()],
      );
      await pumpProfessorStudentsApp(
        tester,
        repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
        walletRepo: wallet,
        location: AppRoutes.professorWalletStudent
            .replaceAll(':athleteId', 'ath-paulo'),
        extraRoutes: [
          ...professorWalletRoutes,
          GoRoute(
            path: AppRoutes.professorWalletStudentProfile,
            name: AppRouteNames.professorWalletStudentProfile,
            builder: (_, state) =>
                stub('perfil ${state.pathParameters['athleteId']}'),
          ),
        ],
        overrides: [
          professorLinksClockProvider.overrideWithValue(() => professorTestNow),
          myProfessorLinksProvider.overrideWith((ref) => Stream.value(const [])),
          previewOverride(
            'ath-paulo',
            const ProfessorStudentProfilePreview.restricted(),
          ),
        ],
      );
      expect(
        find.text('Perfil privado · resultados ocultos pelo atleta'),
        findsOneWidget,
      );
      await tapAndSettle(
          tester, find.byKey(const Key('professor-student-public-profile')));
      expect(find.text('perfil ath-paulo'), findsOneWidget);
    });
  });

  group('I2–I6 perfil visto pelo professor', () {
    testWidgets('visão geral: faixa, números, nota e Avaliar',
        (tester) async {
      await pumpProfile(tester, athlete());
      expect(find.byKey(const Key('public-profile-professor-banner')),
          findsOneWidget);
      // Sem seguir/convidar na visão do professor.
      expect(find.text('Convidar'), findsNothing);
      final stats = find.byKey(const Key('public-profile-professor-stats'));
      for (final v in ['4', '75%', '#38', '1']) {
        expect(find.descendant(of: stats, matching: find.text(v)),
            findsOneWidget);
      }
      expect(find.text('PARA O PROFESSOR · SÓ VOCÊ VÊ'), findsOneWidget);
      expect(find.textContaining('3 vitórias em 4 partidas'), findsOneWidget);
      expect(find.text('Bruno Alves'), findsOneWidget);

      await tapAndSettle(tester, find.text('Avaliar aluno'));
      expect(find.text('avaliar ath-1'), findsOneWidget);
    });

    testWidgets('aba Torneios lista as campanhas', (tester) async {
      await pumpProfile(tester, athlete());
      await tapAndSettle(
          tester, find.byKey(const Key('public-profile-tab-tournaments')));
      expect(find.text('Copa Primavera CFC'), findsOneWidget);
      expect(find.text('3V 1D'), findsOneWidget);
    });

    testWidgets('parceiros frequentes ocultos pelo atleta', (tester) async {
      await pumpProfile(tester, athlete(frequentPartners: false));
      expect(find.text('Bruno Alves'), findsNothing);
      expect(find.byKey(const Key('public-profile-partners-hidden')),
          findsOneWidget);
    });

    testWidgets('I6: perfil privado fica restrito, sem números',
        (tester) async {
      await pumpProfile(
        tester,
        athlete(visibility: AthleteProfileVisibility.private),
      );
      expect(find.byKey(const Key('public-profile-restricted')),
          findsOneWidget);
      expect(find.text('Perfil privado'), findsOneWidget);
      // Só a identidade pública (o nome exibido prefere o apelido).
      expect(find.text('carladias'), findsOneWidget);
      expect(find.text('@carladias · Beach Tennis'), findsOneWidget);
      expect(find.text('#38'), findsNothing);
      expect(find.text('Bruno Alves'), findsNothing);
      expect(find.text('Copa Primavera CFC'), findsNothing);
      expect(find.text('PARA O PROFESSOR · SÓ VOCÊ VÊ'), findsNothing);
    });

    testWidgets('visão comum (atleta) não ganha nada do professor',
        (tester) async {
      await pumpProfile(tester, athlete(frequentPartners: false),
          professorView: false);
      expect(find.byKey(const Key('public-profile-professor-banner')),
          findsNothing);
      expect(find.byKey(const Key('public-profile-tab-tournaments')),
          findsNothing);
      expect(find.text('PARA O PROFESSOR · SÓ VOCÊ VÊ'), findsNothing);
      // Como era antes: a visão comum ainda mostra as duplas.
      expect(find.text('Bruno Alves'), findsOneWidget);
    });

    testWidgets('visão comum de perfil privado segue a mensagem de sempre',
        (tester) async {
      await pumpProfile(
        tester,
        athlete(visibility: AthleteProfileVisibility.private),
        professorView: false,
      );
      expect(find.text('Este perfil é privado.'), findsOneWidget);
      expect(find.byKey(const Key('public-profile-restricted')), findsNothing);
    });
  });
}
