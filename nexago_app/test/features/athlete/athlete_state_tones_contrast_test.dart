import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/location/br_locations_provider.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_theme_mode_preference.dart';
import 'package:nexago_app/core/theme/theme_mode_provider.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_catalog.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_providers.dart';
import 'package:nexago_app/features/athlete/domain/achievements/achievement_status.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete/domain/athlete_active_sessions_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_follow_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_dashboard_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/arena_review.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_providers.dart';
import 'package:nexago_app/features/athlete/domain/community/community_feed_providers.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_tournament_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/profile_completion_models.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/athlete/onboarding/presentation/steps/athlete_onboarding_profile_step.dart';
import 'package:nexago_app/features/athlete/phone_verification/data/phone_verification_service.dart';
import 'package:nexago_app/features/athlete/phone_verification/presentation/phone_verification_field.dart';
import 'package:nexago_app/features/athlete/phone_verification/presentation/phone_verification_sheet.dart';
import 'package:nexago_app/features/athlete/presentation/achievements/widgets/achievement_card.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_active_sessions_page.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_discover_page.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_settings_page.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/athlete_public_profile_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_class_charges_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_empty_drop_ins_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_header.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_needs_you_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_timeline_widgets.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_flexible_banner.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_daily_missions_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_kpi_grid.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_next_reservation_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_registration_tracker.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_notifications/athlete_notification_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_notifications/athlete_notification_toggle_tile.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_profile_main_view.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_quest/athlete_quest_daily_missions_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_settings/athlete_settings_group.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_team_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_team_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_invite_sheet.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/br_state_city_fields.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/community/community_feed_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_season_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_tournament_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_tournament_stats_row.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/profile_completion/profile_completion_widgets.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/rating_dialog.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/tournament_detail/tournament_detail_campaign_section.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_mode_providers.dart';
import 'package:nexago_app/features/tournaments/domain/registration_progress_logic.dart';

import '../../core/theme/state_tone_contrast.dart';

// Texto, ícone e marca em verde, vermelho e âmbar nas telas do atleta
// (cadastro e WhatsApp, agenda, busca de arenas, Home, notificações, perfil,
// missões e liga, ajustes, detalhes da reserva, histórico de partidas,
// avaliação da arena e campanha do torneio), conferidos contra o fundo real
// nos dois temas. No claro os crus do AppColors reprovam: são ~1,6–3,5:1 no
// branco.

/// Uma tela (ou o pedaço dela que pinta um tom de estado) aberta com os
/// dados que acendem o tom.
class _Screen {
  const _Screen(
    this.name,
    this.open,
    this.root,
    this.expected, {
    this.darkIssue,
  });

  final String name;
  final Future<void> Function(WidgetTester tester, ThemeData theme) open;
  final Finder root;

  /// O que tem de ter sido conferido: texto, [IconData] ou `'marca'`.
  final List<Object> expected;

  /// Falha de contraste que o escuro já tinha antes desta troca. O escuro é
  /// a referência e não muda aqui: o caso fica pulado só nele, com o motivo
  /// no nome, até uma decisão de design.
  final String? darkIssue;
}

const _piece = Key('piece');
final _pieceFinder = find.byKey(_piece);

void _setView(WidgetTester tester) {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

/// Monta [child] numa tela do tema, opcionalmente sobre um card (onde ela
/// mora no app de verdade).
Future<void> _pumpPiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  bool onCard = false,
  List<Override> overrides = const [],
}) async {
  _setView(tester);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) => Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: KeyedSubtree(
                key: _piece,
                child: onCard
                    ? Material(
                        color: context.themeColors.surfaceCard,
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: child,
                        ),
                      )
                    : child,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

Future<void> _pumpPage(
  WidgetTester tester,
  ThemeData theme,
  Widget page,
  List<Override> overrides,
) async {
  _setView(tester);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: theme, home: page),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

/// Folha e diálogo abrem do jeito do app: um botão chama o `show*` real, que
/// traz o fundo (Material da folha, do diálogo) junto.
Future<void> _pumpOpened(
  WidgetTester tester,
  ThemeData theme,
  void Function(BuildContext context) open, {
  List<Override> overrides = const [],
}) async {
  _setView(tester);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) => Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: Center(
              child: ElevatedButton(
                onPressed: () => open(context),
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

// ── Fixtures ────────────────────────────────────────────────────────────

const _profile = AthleteProfile(
  id: 'u1',
  name: 'Maria Alves',
  sport: 'Beach tennis',
  level: 'Intermediário',
  city: 'Recife',
);

const _booking = MyBookingItem(
  id: 'b1',
  arenaName: 'Arena Sol',
  courtName: 'Quadra 2',
  dateRaw: '2026-10-23',
  startTime: '19:00',
  endTime: '20:00',
  rawStatus: 'confirmed',
  amountReais: 120,
  paymentDisplay: MyBookingPaymentDisplay(label: 'PIX'),
);

MyBookingItem _bookingWithStatus(String rawStatus) => MyBookingItem(
      id: 'b-$rawStatus',
      arenaName: 'Arena Sol',
      courtName: 'Quadra 2',
      dateRaw: '2026-10-23',
      startTime: '19:00',
      endTime: '20:00',
      rawStatus: rawStatus,
      paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX'),
    );

const _missions = DailyMissionBundle(
  dayKey: '2026-10-20',
  missions: [
    DailyMissionStatus(mission: GamificationMission.playToday, completed: true),
    DailyMissionStatus(
      mission: GamificationMission.reserveToday,
      completed: false,
    ),
  ],
);

AthleteInboxNotification _notification(
  String id,
  String type, {
  Map<String, String> data = const {},
}) =>
    AthleteInboxNotification(
      id: id,
      title: 'Copa VH',
      body: 'Enzo te chamou para jogar a Mista B.',
      type: type,
      data: data,
      read: true,
      dismissed: false,
      createdAt: DateTime(2026, 10, 20, 9),
    );

Widget _notificationCard(AthleteInboxNotification n) => AthleteNotificationCard(
      notification: n,
      presentation: notificationPresentation(n),
      timeLabel: '2h',
      onDismiss: () {},
      onPrimaryAction: () {},
      onSecondaryAction: () {},
    );

AthleteTournamentCampaignMatch _campaignMatch(
  String id,
  AthleteMatchResult result,
) =>
    AthleteTournamentCampaignMatch(
      id: id,
      stageLabel: 'GRUPO A',
      playedAt: DateTime.utc(2026, 10, 18, 13),
      opponentLabel: 'Enzo / Rafael',
      scoreDisplay: '21-17',
      result: result,
    );

/// Sessões: a deste aparelho e outra, que é a que tem "Revogar".
class _TwoSessions extends AthleteActiveSessionsNotifier {
  @override
  Future<AthleteActiveSessionsState> build() async =>
      AthleteActiveSessionsState(
        isLoading: false,
        tokens: [
          const AthleteDeviceToken(id: 't1', platform: 'ios', isCurrent: true),
          AthleteDeviceToken(
            id: 't2',
            platform: 'android',
            isCurrent: false,
            updatedAt: DateTime(2026, 10, 18, 9, 30),
          ),
        ],
      );
}

/// Descobrir com a primeira página falhada.
class _FailedDiscover extends AthleteDiscoverNotifier {
  @override
  AthleteDiscoverState build() =>
      const AthleteDiscoverState(errorMessage: 'sem conexão');
}

class _SystemTheme extends AppThemeModePreferenceNotifier {
  @override
  AppThemeModePreference build() => AppThemeModePreference.system;
}

/// A busca de atleta do convite cai sempre.
class _FailingUsersRepository implements UsersRepository {
  @override
  Future<List<Never>> searchAthletesByKeywords(String term, {int max = 15}) =>
      Future.error(StateError('sem rede'));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// O envio do SMS falha antes de chegar no Firebase.
class _FailingPhoneService implements PhoneVerificationService {
  @override
  Future<void> sendCode({
    required String phoneNumberRaw,
    required void Function(PhoneVerificationSession session) onCodeSent,
    required void Function(Object error) onFailed,
    void Function(String phoneNumber)? onAutoVerified,
    int? resendToken,
  }) async {
    onFailed(StateError('sem rede'));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

List<Override> _settingsOverrides() => [
      authProvider.overrideWith(
        (ref) => Stream.value(
          MockUser(
            uid: 'u1',
            email: 'maria@nexago.app',
            displayName: 'Maria Alves',
          ),
        ),
      ),
      athleteProfileProvider.overrideWith((ref) => Stream.value(_profile)),
      gamificationSummaryProvider.overrideWith(
        (ref) => Stream.value(GamificationSummary.initial()),
      ),
      achievementsScreenStateProvider.overrideWith(
        (ref) => AchievementsScreenState.empty,
      ),
      myBookingsStreamProvider.overrideWith((ref) => Stream.value(const [])),
      athleteMatchHistorySettingsSubtitleProvider.overrideWith(
        (ref) => '12 partidas',
      ),
      appThemeModePreferenceProvider.overrideWith(_SystemTheme.new),
      hasMultipleMobileRolesProvider.overrideWithValue(false),
      myProfessorLinksProvider.overrideWith((ref) => Stream.value(const [])),
      professorRoleSyncProvider.overrideWith((ref) {}),
      cashbackEnabledProvider.overrideWith((ref) => false),
      sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
    ];

List<Override> _publicProfileOverrides() => [
      authProvider.overrideWith((ref) => Stream.value(null)),
      athleteProfileByIdProvider('u2').overrideWith(
        (ref) => Stream.error('sem rede'),
      ),
      userConfirmedPeladasProvider('u2').overrideWith(
        (ref) => Stream.value(const []),
      ),
      athletePublicRankingProvider('u2').overrideWith(
        (ref) async => const AthletePublicRankingSnapshot(),
      ),
      athletePublicPartnersProvider('u2').overrideWith(
        (ref) async => const <AthletePublicPartnerEntry>[],
      ),
      athleteFollowersCountProvider('u2').overrideWith(
        (ref) => Stream.value(0),
      ),
      athleteFollowingCountProvider('u2').overrideWith(
        (ref) => Stream.value(0),
      ),
      athleteIsFollowingProvider('u2').overrideWith(
        (ref) => Stream.value(false),
      ),
    ];

/// Cadastro sem nada preenchido, com o asset das cidades falhando, depois
/// de tocar em "Concluir cadastro": cada obrigatório acusa o erro.
Future<void> _openIncompleteOnboarding(
  WidgetTester tester,
  ThemeData theme,
) async {
  await _pumpPage(tester, theme, const AthleteOnboardingProfileStep(), [
    brLocationsDataProvider.overrideWith((ref) => Future.error('sem rede')),
  ]);
  await tester.ensureVisible(find.text('Concluir cadastro'));
  await tester.tap(find.text('Concluir cadastro'));
  await tester.pump();
}

Future<void> _openUnlockedAchievement(WidgetTester tester, ThemeData theme) =>
    _pumpPiece(
      tester,
      theme,
      AchievementCard(
        viewModel: AchievementViewModel(
          definition: AchievementCatalog.all.first,
          status: const AchievementUnlocked(),
        ),
      ),
    );

final _screens = <_Screen>[
  _Screen(
    'WhatsApp: verificado e com erro',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      PhoneVerificationField(
        controller: TextEditingController(text: '(62) 99999-8888'),
        verified: true,
        onChanged: (_) {},
        onVerified: (_) {},
        errorText: 'Informe um WhatsApp válido com DDD',
      ),
    ),
    find.byType(PhoneVerificationField),
    [
      Icons.verified_rounded,
      'Verificado por SMS',
      'Informe um WhatsApp válido com DDD',
    ],
  ),
  _Screen(
    'WhatsApp: falha no envio do SMS',
    (tester, theme) async {
      await _pumpOpened(
        tester,
        theme,
        (context) => showPhoneVerificationSheet(
          context: context,
          initialPhone: '(62) 99999-8888',
        ),
        overrides: [
          phoneVerificationServiceProvider.overrideWithValue(
            _FailingPhoneService(),
          ),
        ],
      );
      await tester.tap(find.text('Enviar código'));
      await tester.pump();
    },
    find.byType(BottomSheet),
    ['Não foi possível concluir a verificação. Tente novamente.'],
  ),
  _Screen(
    'Cadastro: foto, gênero, WhatsApp e cidades com erro',
    _openIncompleteOnboarding,
    // As peças que pintam o tom trocado. Os campos de nome e nascimento
    // (AuthTextField) pintam o colorScheme.error do tema, fora desta troca.
    find.byWidgetPredicate(
      (w) =>
          w.runtimeType.toString() == '_PhotoPickerCard' ||
          (w is Text && w.data == 'Selecione o gênero') ||
          w is PhoneVerificationField ||
          w is BrStateCityFields,
    ),
    [
      'Selecione o gênero',
      'Escolha uma foto pra concluir',
      'Informe um WhatsApp válido com DDD',
      'Não foi possível carregar cidades: sem rede',
    ],
  ),
  _Screen(
    'Conquistas: check da conquista desbloqueada',
    _openUnlockedAchievement,
    find.descendant(
      of: find.byType(AchievementCard),
      matching: find.byIcon(Icons.check_circle_rounded),
    ),
    [Icons.check_circle_rounded],
  ),
  _Screen(
    'Conquistas: card desbloqueado inteiro',
    _openUnlockedAchievement,
    find.byType(AchievementCard),
    [Icons.check_circle_rounded, '+20 XP'],
  ),
  _Screen(
    'Sessões ativas: revogar outro aparelho',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const AthleteActiveSessionsPage(),
      [athleteActiveSessionsProvider.overrideWith(_TwoSessions.new)],
    ),
    find.byType(AthleteActiveSessionsPage),
    ['Revogar'],
  ),
  _Screen(
    'Descobrir atletas: falha ao carregar',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const AthleteDiscoverPage(),
      [athleteDiscoverProvider.overrideWith(_FailedDiscover.new)],
    ),
    find.byType(AthleteDiscoverPage),
    ['Não foi possível carregar atletas.\nsem conexão'],
  ),
  _Screen(
    'Configurações: sair da conta e conquistas',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const AthleteSettingsPage(),
      _settingsOverrides(),
    ),
    find.byType(AthleteSettingsPage),
    ['Sair da conta', Icons.logout_rounded, Icons.emoji_events_outlined],
  ),
  _Screen(
    'Perfil público: falha ao carregar',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const AthletePublicProfilePage(userId: 'u2'),
      _publicProfileOverrides(),
    ),
    find.byType(AthletePublicProfilePage),
    ['Não foi possível carregar o perfil.\nsem rede'],
  ),
  _Screen(
    'Agenda: mensalidade vencida',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AgendaClassChargesSection(
        charges: const [
          ClassChargeEntry(
            chargeId: 'c1',
            arenaId: 'a1',
            arenaName: 'Arena Sol',
            description: 'Mensalidade de outubro',
            amountReais: 180,
            dueDate: '2026-10-05',
            overdue: true,
            payment: 'manual',
          ),
        ],
        onPay: (_) {},
      ),
    ),
    find.byType(AgendaClassChargesSection),
    ['VENCEU 05/10'],
    darkIssue: '"VENCEU 05/10" em AppColors.live sobre o canto azul do '
        'degradê da aula (#28576F): 2,2:1',
  ),
  _Screen(
    'Agenda: drop-ins precisando de gente',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AgendaEmptyDropInsSection(
        sectionTitle: 'Drop-ins abertos hoje',
        dropIns: const [
          AgendaDropInPreview(
            id: 'd1',
            startHour: 18,
            startMinute: 0,
            arenaLine: 'Arena Sol · Quadra 1',
            kmDistance: 1.2,
            spotsNeeded: 1,
            avatarCount: 3,
          ),
          AgendaDropInPreview(
            id: 'd2',
            startHour: 19,
            startMinute: 30,
            arenaLine: 'Arena Mar · Quadra 3',
            kmDistance: 2.4,
            spotsNeeded: 2,
            avatarCount: 2,
          ),
        ],
        onJoinTap: (_) {},
      ),
    ),
    find.byType(AgendaEmptyDropInsSection),
    ['• 2 PRECISAM DE +1'],
  ),
  _Screen(
    'Agenda: notificação não lida no topo',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AgendaHeader(
        eyebrow: 'TER · 20 OUT',
        title: 'Agenda',
        monthModeActive: false,
        unreadNotificationCount: 3,
        searchVisible: false,
        onSearchTap: () {},
        onCalendarTap: () {},
        onNotificationsTap: () {},
      ),
    ),
    find.byType(AgendaHeader),
    ['marca'],
  ),
  _Screen(
    'Agenda: convite de dupla esperando resposta',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AgendaNeedsYouSection(
        items: const [
          AthleteAgendaNeedsYouItem(
            id: 'n1',
            kind: AthleteAgendaNeedsYouKind.partnerInvite,
            title: 'Convite de dupla',
            subtitle: 'Enzo te chamou para a Copa VH',
            meta: 'Expira em 2 dias',
            statusLabel: 'AGUARDANDO',
            inviteId: 'i1',
          ),
        ],
        onAcceptChallenge: () {},
        onDeclineChallenge: () {},
        onBookingTap: (_) {},
      ),
    ),
    find.byType(AgendaNeedsYouSection),
    ['AGUARDANDO'],
  ),
  _Screen(
    'Agenda: aula cancelada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AgendaTimelineRow(
        row: AthleteAgendaTimelineRow.item(
          AthleteAgendaItem(
            id: 'class-s1',
            kind: AthleteAgendaItemKind.classSession,
            startsAt: DateTime(2026, 10, 21, 19),
            title: 'Treino avançado',
            subtitle: 'Arena Sol · Quadra 2 · Prof. Lia',
            statusLabel: 'CANCELADA',
            accentColor: athleteAgendaClassSessionAccent,
            classSession: const AthleteAgendaClassPayload(
              sessionId: 's1',
              arenaName: 'Arena Sol',
              className: 'Treino avançado',
              teacherName: 'Prof. Lia',
              courtName: 'Quadra 2',
              isTeacher: false,
              kind: 'regular',
              canceled: true,
            ),
          ),
          isFirst: true,
          isLast: true,
        ),
        highlightNextId: null,
        onCancelBooking: (_) async {},
      ),
    ),
    find.byType(AgendaTimelineRow),
    ['CANCELADA'],
    darkIssue: '"CANCELADA" em AppColors.live sobre o canto vermelho do '
        'degradê da aula cancelada (#70201E): 3,1:1',
  ),
  _Screen(
    'Busca de arenas: horário flexível desligado',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      ArenaSearchFlexibleBanner(
        boostPercent: 40,
        flexibleTime: false,
        onToggle: () {},
      ),
    ),
    find.byType(ArenaSearchFlexibleBanner),
    // "Flexível" não entra: o texto usa o labelMedium do tema, que já traz a
    // cor (onSurface) e ganha do foregroundColor do botão.
    [Icons.bolt_rounded, '+40% opções'],
  ),
  _Screen(
    'Home: missão diária concluída',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const AthleteHomeDailyMissionsSection(missions: _missions),
    ),
    find.byType(AthleteHomeDailyMissionsSection),
    [Icons.check_circle_rounded, 'Jogue 1x hoje'],
  ),
  _Screen(
    'Home: KPI em alta',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const AthleteHomeKpiGrid(
        kpis: [
          AthleteHomeKpi(
            label: 'Jogos no mês',
            value: '8',
            delta: '+2',
            note: 'vs. setembro',
            tone: AthleteHomeKpiTone.green,
            arrow: true,
          ),
          AthleteHomeKpi(
            label: 'Vitórias',
            value: '5',
            delta: '3V · 1D',
            note: 'no mês',
            tone: AthleteHomeKpiTone.green,
          ),
        ],
      ),
    ),
    find.byType(AthleteHomeKpiGrid),
    [Icons.arrow_upward_rounded, '+2', '3V · 1D'],
  ),
  _Screen(
    'Home: próxima reserva confirmada e a pagar',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          for (final status in ['confirmed', 'pay_at_arena', 'pending_payment'])
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AthleteHomeNextReservationCard(
                booking: _bookingWithStatus(status),
                now: DateTime(2026, 10, 22, 12),
                onDetailsTap: () {},
                onReserveTap: () {},
              ),
            ),
        ],
      ),
    ),
    _pieceFinder,
    ['Confirmada', 'Pagar na arena', 'Pagamento pendente'],
  ),
  _Screen(
    'Home: inscrição na lista de espera',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AthleteHomeRegistrationTracker(
        items: const [
          RegistrationProgress(
            registrationId: 'r1',
            tournamentId: 't1',
            categoryId: 'c1',
            tournamentName: 'Copa VH',
            categoryName: 'Mista B',
            waitlist: true,
            steps: [
              RegistrationProgressStep(
                label: 'Categoria',
                caption: 'Mista B',
                state: RegistrationStepState.done,
              ),
              RegistrationProgressStep(
                label: 'Dupla',
                caption: 'Aguardando parceiro',
                state: RegistrationStepState.current,
              ),
              RegistrationProgressStep(
                label: 'Pagamento',
                caption: 'PIX ou cartão',
                state: RegistrationStepState.todo,
              ),
            ],
            pendingLabel: 'Falta a dupla',
            currentStep: 2,
            totalSteps: 3,
            paymentPending: false,
            canCancel: true,
          ),
        ],
        onContinue: (_) {},
        onCancel: (_) {},
      ),
    ),
    find.byType(AthleteHomeRegistrationTracker),
    ['Lista de espera'],
  ),
  _Screen(
    'Notificações: convite, convite aceito e vaga liberada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          _notificationCard(
            _notification(
              'n1',
              'tournament_partner_invite',
              data: const {'inviteId': 'i1'},
            ),
          ),
          _notificationCard(
            _notification(
              'n2',
              'tournament_partner_invite',
              data: const {'inviteId': 'i2', 'inviteResponse': 'accepted'},
            ),
          ),
          _notificationCard(
            _notification(
              'n3',
              'slot_vacancy_available',
              data: const {'arenaId': 'a1', 'date': '2026-10-22'},
            ),
          ),
        ],
      ),
    ),
    _pieceFinder,
    [
      Icons.emoji_events_outlined,
      'Recusar',
      Icons.check_circle_outline_rounded,
      'Você aceitou o convite',
      Icons.local_fire_department_rounded,
    ],
  ),
  _Screen(
    'Notificações: preferências verde e amarela',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AthleteSettingsGroup(
        sectionLabel: 'NOTIFICAÇÕES',
        children: [
          AthleteNotificationToggleTile(
            icon: Icons.emoji_events_rounded,
            title: 'Resultados',
            subtitle: 'Placar e pontos de ranking',
            value: true,
            onChanged: (_) {},
            variant: AthleteSettingsIconVariant.green,
          ),
          AthleteNotificationToggleTile(
            icon: Icons.schedule_rounded,
            title: 'Lembretes',
            subtitle: 'Antes do jogo e do check-in',
            value: false,
            onChanged: (_) {},
            variant: AthleteSettingsIconVariant.yellow,
            showDivider: false,
          ),
        ],
      ),
    ),
    find.byType(AthleteSettingsGroup),
    [Icons.emoji_events_rounded, Icons.schedule_rounded],
  ),
  _Screen(
    'Perfil: próxima reserva confirmada',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      Scaffold(
        body: AthleteProfileMainView(
          profile: _profile,
          embedded: true,
          readOnly: true,
          totalBookings: 3,
          nextBooking: _booking,
          gamificationSummary: GamificationSummary.initial(),
          badges: const [],
          onEdit: () {},
          onShare: () {},
          onCompleteProfile: () {},
          onOpenAgenda: () {},
          onOpenAchievements: () {},
          onOpenPartner: (_) {},
        ),
      ),
      [
        sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
        athleteProfileStatsProvider.overrideWith(
          (ref) async => AthleteProfileStats.empty,
        ),
        currentAthletePlayPartnersProvider.overrideWith(
          (ref) async => const <AthletePublicPartnerEntry>[],
        ),
        athleteProfilePartnerMatchCountsProvider.overrideWith(
          (ref) async => const <String, int>{},
        ),
      ],
    ),
    find.byType(AthleteProfileMainView),
    ['CONFIRMADA', 'marca'],
  ),
  _Screen(
    'Missões: missão concluída',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const AthleteQuestDailyMissionsSection(
        missions: _missions,
        showHeader: false,
      ),
    ),
    find.byType(AthleteQuestDailyMissionsSection),
    [Icons.check_rounded, 'Jogue 1x hoje'],
  ),
  _Screen(
    'Ajustes: ícones verde e amarelo e avatar animado',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      AthleteSettingsGroup(
        sectionLabel: 'CONTA',
        children: [
          AthleteSettingsTile(
            icon: Icons.verified_outlined,
            title: 'Telefone verificado',
            subtitle: '(62) 99999-8888',
            variant: AthleteSettingsIconVariant.green,
            onTap: () {},
          ),
          AthleteSettingsTile(
            icon: Icons.emoji_events_outlined,
            title: 'Conquistas',
            subtitle: '3 de 24',
            variant: AthleteSettingsIconVariant.yellow,
            onTap: () {},
          ),
          AthleteSettingsToggleTile(
            title: 'Avatar animado',
            subtitle: 'Mostra a moldura do seu nível',
            value: true,
            onChanged: (_) {},
            showDivider: false,
          ),
        ],
      ),
    ),
    find.byType(AthleteSettingsGroup),
    [Icons.verified_outlined, Icons.emoji_events_outlined, Icons.face_rounded],
  ),
  _Screen(
    'Detalhes da reserva: convidado sai do jogo',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      BookingDetailsTeamSection(
        bookingId: 'b1',
        arenaName: 'Arena Sol',
        startAt: DateTime(2026, 10, 25, 18),
      ),
      overrides: [
        bookingDetailsTeamProvider('b1').overrideWith(
          (ref) async => const BookingDetailsTeamState(
            members: [
              BookingDetailsTeamMember(
                uid: 'u2',
                displayName: 'Enzo Lima',
                subtitle: 'Organizador',
                initials: 'EL',
                isOrganizer: true,
              ),
            ],
            confirmedCount: 2,
            totalSlots: 4,
            viewerIsOwner: false,
            viewerIsParticipant: true,
            participantUids: ['u1'],
            ownerUid: 'u2',
          ),
        ),
      ],
    ),
    find.byType(BookingDetailsTeamSection),
    ['Sair do jogo', Icons.logout_rounded],
  ),
  _Screen(
    'Convidar jogadores: busca falhou',
    (tester, theme) async {
      await _pumpOpened(
        tester,
        theme,
        (context) => showBookingInviteSheet(
          context,
          bookingId: 'b1',
          arenaName: 'Arena Sol',
          startAt: DateTime(2026, 10, 25, 18),
          openSlots: 2,
          playingUids: const {'u1'},
        ),
        overrides: [
          authProvider.overrideWith((ref) => Stream.value(null)),
          usersRepositoryProvider.overrideWithValue(_FailingUsersRepository()),
          bookingInvitesForBookingProvider('b1').overrideWith(
            (ref) => Stream.value(const []),
          ),
        ],
      );
      await tester.enterText(
        find.descendant(
          of: find.byType(BookingInviteSheet),
          matching: find.byType(TextField),
        ),
        'Enzo',
      );
      // Passa o debounce da busca e entrega a falha.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
    },
    find.byType(BookingInviteSheet),
    ['Não foi possível buscar agora. Tente novamente.'],
  ),
  _Screen(
    'Estado e cidade: falha ao carregar as cidades',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      BrStateCityFields(
        selectedState: 'GO',
        selectedCity: 'Goiânia',
        onStateChanged: (_) {},
        onCityChanged: (_) {},
      ),
      overrides: [
        brLocationsDataProvider.overrideWith(
          (ref) => Future.error('sem rede'),
        ),
      ],
    ),
    find.byType(BrStateCityFields),
    ['Não foi possível carregar cidades: sem rede'],
  ),
  _Screen(
    'Comunidade: campeões e aviso do organizador',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const CommunityFeedSection(),
      overrides: [
        communityFeedProvider.overrideWith(
          (ref) => Stream.value(const [
            CommunityFeedItem(
              id: 'f1',
              type: CommunityFeedType.tournamentChampions,
              tournamentId: 't1',
              tournamentName: 'Copa VH',
              champions: [
                CommunityFeedChampion(
                  categoryName: 'Mista A',
                  playerNames: ['Ana', 'Bruno'],
                ),
              ],
            ),
            CommunityFeedItem(
              id: 'f2',
              type: CommunityFeedType.organizerAnnouncement,
              tournamentId: 't2',
              tournamentName: 'Open Goiânia',
              message: 'Check-in a partir das 7h.',
            ),
          ]),
        ),
      ],
    ),
    find.byType(CommunityFeedSection),
    [Icons.emoji_events_outlined, Icons.campaign_rounded],
  ),
  _Screen(
    'Histórico: temporada em alta',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      // Sem barras mensais: são preenchimento sólido (cru de propósito), não
      // texto nem marca.
      const MatchHistorySeasonCard(
        summary: AthleteSeasonSummary(
          year: 2026,
          winRatePercent: 9,
          wins: 2,
          losses: 21,
          trendPercent: 12,
        ),
      ),
    ),
    find.byType(MatchHistorySeasonCard),
    ['+12%'],
  ),
  _Screen(
    'Histórico: torneio e medalhas',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const Column(
        children: [
          MatchHistoryTournamentCard(
            tournament: AthleteTournamentHistoryItem(
              id: 'h1',
              tournamentId: 't1',
              name: 'Copa VH',
              venue: 'Arena Sol · Recife',
              periodLabel: 'OUT 2026',
              categoryLabel: 'Mista B',
              genderLabel: 'Mista',
              placement: 1,
              medal: TournamentPlacement.gold,
              wins: 5,
              losses: 1,
            ),
          ),
          MatchHistoryTournamentStatsRow(
            counts: TournamentMedalCounts(
              total: 7,
              gold: 3,
              silver: 2,
              bronze: 1,
            ),
          ),
        ],
      ),
    ),
    _pieceFinder,
    ['5V 1D', '3'],
  ),
  _Screen(
    'Completar perfil: passo concluído',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      ProfileCompletionStepTile(
        status: const ProfileCompletionStepStatus(
          step: ProfileCompletionStep.photo,
          isDone: true,
          subtitle: 'Foto enviada',
        ),
        onTap: () {},
      ),
    ),
    find.byType(ProfileCompletionStepTile),
    [Icons.check_rounded],
  ),
  _Screen(
    'Avaliação da arena: nota escolhida',
    (tester, theme) => _pumpOpened(
      tester,
      theme,
      (context) => showRatingDialog(
        context,
        pending: const PendingArenaReview(
          bookingId: 'b1',
          arenaId: 'a1',
          arenaName: 'Arena Sol',
          courtName: 'Quadra 1',
          dateRaw: '2026-10-19',
          startTime: '18:00',
          endTime: '19:00',
        ),
      ),
    ),
    find.byType(Dialog),
    ['Excelente'],
  ),
  _Screen(
    'Torneio: campanha com vitória e derrota',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentDetailCampaignSection(
        detail: AthleteTournamentDetail(
          tournamentId: 't1',
          name: 'Copa VH',
          championBadgeLabel: 'CAMPEÃ',
          metaLabel: 'OUT 2026 · MISTA B',
          gamesCount: 2,
          wins: 1,
          losses: 1,
          xpEarned: 120,
          venueName: 'Arena Sol',
          venueCity: 'Recife',
          partner: const AthleteTournamentPartner(
            initials: 'EL',
            avatarColor: 0xFF5B9BFF,
            name: 'Enzo Lima',
            monthsTogetherLabel: '3 meses',
          ),
          campaignTag: '1V 1D',
          matches: [
            _campaignMatch('m1', AthleteMatchResult.win),
            _campaignMatch('m2', AthleteMatchResult.loss),
          ],
        ),
        onMatchTap: (_) {},
      ),
    ),
    // Só os cards da partida. A linha do tempo (pontos e troféu da final)
    // fica no fundo da página do torneio, que é o `AppColors.canvas` escuro
    // nos dois temas: lá o tom cru é o certo e ela fica de fora de propósito.
    find.descendant(
      of: find.byType(TournamentDetailCampaignSection),
      matching: find.byType(InkWell),
    ),
    ['V', 'D'],
  ),
];

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $label', () {
      for (final screen in _screens) {
        final issue = label == 'escuro' ? screen.darkIssue : null;
        testWidgets(
          '${screen.name}: tons de estado legíveis'
          '${issue == null ? '' : ' (falha conhecida: $issue)'}',
          (tester) async {
            await screen.open(tester, theme);
            final checked = expectStateTonesLegible(tester, screen.root);
            expect(checked, containsAll(screen.expected));
          },
          skip: issue != null,
        );
      }
    });
  }
}
