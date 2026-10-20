import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arenas/data/payment_service.dart';
import 'package:nexago_app/features/arenas/domain/payment_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_registration_progress_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/domain/squad_rules.dart';
import 'package:nexago_app/features/tournaments/data/my_tournament_registrations_repository.dart';
import 'package:nexago_app/features/tournaments/data/partner_search_service.dart';
import 'package:nexago_app/features/tournaments/data/recent_partners_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_providers.dart';
import 'package:nexago_app/features/tournaments/domain/followed_match.dart';
import 'package:nexago_app/features/tournaments/domain/followed_matches_providers.dart';
import 'package:nexago_app/features/tournaments/domain/league_ranking_models.dart';
import 'package:nexago_app/features/tournaments/domain/league_ranking_providers.dart';
import 'package:nexago_app/features/tournaments/domain/match_win_probability_providers.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_logic.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_models.dart';
import 'package:nexago_app/features/tournaments/domain/registration_payment_method.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_providers.dart';
import 'package:nexago_app/features/tournaments/domain/team_follow_providers.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_hub_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_row.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_live_score.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_pix_args.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team_roster_logic.dart';
import 'package:nexago_app/features/tournaments/domain/uniform_auto_saver.dart';
import 'package:nexago_app/features/tournaments/presentation/league_detail_page.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_consent_page.dart';
import 'package:nexago_app/features/tournaments/presentation/registration_wizard/registration_terms_page.dart';
import 'package:nexago_app/features/tournaments/presentation/team_discover_page.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/team_public_profile_page.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/widgets/team_profile_tabs.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_detail_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_registration_pix_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_pick_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_status_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_success_page.dart';
import 'package:nexago_app/features/tournaments/presentation/tournament_substitution_wizard_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/bracket/bracket_match_node.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_athletes_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_ranking_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/discovery_list/discovery_list_stats_row.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/follow_match_button.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/league_detail_ranking_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/league_discovery_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/match_card_symmetric_parts.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/my_tournaments/my_tournaments_completed_stats.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/my_tournaments/my_tournaments_empty_suggested_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/my_tournaments/my_tournaments_ongoing_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/my_tournaments_home_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/pending_tournament_invitee_invites_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/pending_tournament_inviter_invites_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/predictions/prediction_match_pick_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_pill.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_spec_row.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/squad_code_field.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_category_spots_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_categories_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_category_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_category_pick_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_my_registration_tab.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_pool_standings_widgets.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_discovery_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_match_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_match_live_badge.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_partner_invite/partner_invite_hero_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_category_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_payment_step.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_price_summary.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_roster_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_sent_invites_list.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_solo_invite_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_uniform_step.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_waiting_step.dart';

import '../../core/theme/state_tone_contrast.dart';

// Verde, vermelho e âmbar nas telas de torneio fora do Modo Focus (card de
// partida, chave, grupos, detalhe e categorias, vitrine, Meus torneios,
// inscrição e wizard, substituição, NexaSquad, palpites, convites, equipes e
// ligas): texto, ícone e ponto de status conferidos contra o fundo real nos
// dois temas. No claro os crus do AppColors reprovam: ~1,6–3,5:1 no branco.

/// Uma tela (ou o pedaço dela que pinta um tom de estado) aberta com os
/// dados que acendem o tom.
class _Screen {
  const _Screen(this.name, this.open, this.root, this.expected);

  final String name;
  final Future<void> Function(WidgetTester tester, ThemeData theme) open;
  final Finder root;

  /// O que tem de ter sido conferido: texto, [IconData] ou `'marca'`.
  final List<Object> expected;
}

const _piece = Key('piece');
final _pieceFinder = find.byKey(_piece);

/// Monta [child] numa tela do tema, opcionalmente sobre um card (onde ela
/// mora no app de verdade).
Future<void> _pumpPiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  bool onCard = false,
  EdgeInsets padding = const EdgeInsets.all(16),
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) => Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: SingleChildScrollView(
              padding: padding,
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

/// Monta uma tela inteira (ou um pedaço que já traz o próprio scroll).
Future<void> _pumpPage(
  WidgetTester tester,
  ThemeData theme,
  Widget page,
  List<Override> overrides,
) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: theme, home: page),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

// ── Partidas ────────────────────────────────────────────────────────────

const _player = TournamentMatchCardPlayerViewModel(
  initials: 'AB',
  avatarColor: Color(0xFF5B8DEF),
);

/// Dia fixo para o rótulo de horário do cabeçalho não depender de hoje.
final _reference = DateTime(2026, 8, 7, 12);

TournamentMatch _match({
  String id = 'm1',
  String status = TournamentMatchStatus.scheduled,
  List<TournamentMatchSet> sets = const [],
  String? winnerId,
  DateTime? scheduleTime,
  int? currentSetIndex,
  MatchLiveScore? liveScore,
  String poolId = 'A',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: 1,
    matchType: 'Group',
    poolId: poolId,
    teamAId: 'team-a',
    teamBId: 'team-b',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: poolId.isNotEmpty,
    matchNumber: 12,
    sets: sets,
    winnerId: winnerId,
    courtName: '1',
    scheduleTime: scheduleTime,
    currentSetIndex: currentSetIndex,
    liveScore: liveScore,
  );
}

TournamentMatchCardViewModel _vm(TournamentMatch match) =>
    TournamentMatchCardViewModel(
      match: match,
      teamA: const TournamentMatchCardTeamViewModel(
        displayName: 'Ana / Bruno',
        players: [_player, _player],
      ),
      teamB: const TournamentMatchCardTeamViewModel(
        displayName: 'Carla / Diego',
        players: [_player, _player],
      ),
    );

final _doneMatch = _match(
  id: 'm-done',
  status: TournamentMatchStatus.completed,
  winnerId: 'team-a',
  sets: const [
    TournamentMatchSet(a: 21, b: 15),
    TournamentMatchSet(a: 21, b: 18),
  ],
);

final _liveMatch = _match(
  id: 'm-live',
  status: TournamentMatchStatus.inProgress,
  sets: const [
    TournamentMatchSet(a: 21, b: 15),
    TournamentMatchSet(a: 10, b: 8),
  ],
  currentSetIndex: 1,
);

final _scheduledMatch = _match(
  id: 'm-sched',
  scheduleTime: DateTime(2026, 8, 7, 17, 30),
);

final _tbdMatch = _match(id: 'm-tbd');

FollowedMatch _follow(String matchId) => FollowedMatch(
      matchId: matchId,
      tournamentId: 't1',
      categoryId: 'cat-a',
      source: 'manual',
      followedAt: DateTime.utc(2026, 10, 24),
    );

/// O card de partida só busca a probabilidade e a lista de seguidas: as duas
/// saem daqui, sem Firebase.
List<Override> _matchCardOverrides({List<FollowedMatch> followed = const []}) =>
    [
      followedMatchesProvider.overrideWith((ref) => Stream.value(followed)),
      matchWinProbabilityProvider.overrideWith((ref, query) async => null),
    ];

TournamentMatchRow _row(TournamentMatch match) =>
    buildTournamentMatchRow(viewModel: _vm(match), reference: _reference);

// ── Grupos ──────────────────────────────────────────────────────────────

TournamentPoolStandingsRow _standing({
  required int rank,
  required int gamesWon,
  required int gamesLost,
  required bool qualifies,
}) {
  return TournamentPoolStandingsRow(
    rank: rank,
    teamId: 'team-$rank',
    displayName: 'Dupla $rank',
    wins: 3 - rank,
    losses: rank - 1,
    setsWon: 4 - rank,
    setsLost: rank,
    gamesWon: gamesWon,
    gamesLost: gamesLost,
    points: (3 - rank) * 2,
    qualifies: qualifies,
    isAthleteTeam: false,
  );
}

final _group = TournamentPoolStandingsGroup(
  poolId: 'A',
  poolLabel: 'Grupo A',
  teamCount: 3,
  matchCount: 3,
  isComplete: true,
  rows: [
    _standing(rank: 1, gamesWon: 42, gamesLost: 31, qualifies: true),
    _standing(rank: 2, gamesWon: 30, gamesLost: 30, qualifies: true),
    _standing(rank: 3, gamesWon: 25, gamesLost: 36, qualifies: false),
  ],
);

// ── Torneio, categorias e vitrine ───────────────────────────────────────

const _offerPaid = TournamentCategoryOffer(
  id: 'c1',
  name: 'Masculino A',
  entryFee: 120,
  maxTeams: 8,
);
const _offerDone = TournamentCategoryOffer(
  id: 'c2',
  name: 'Feminino B',
  entryFee: 120,
  maxTeams: 8,
  isCompleted: true,
);
const _offerOpen = TournamentCategoryOffer(
  id: 'c3',
  name: 'Misto C',
  entryFee: 120,
  maxTeams: 8,
);
const _offerFull = TournamentCategoryOffer(
  id: 'c4',
  name: 'Masculino D',
  entryFee: 120,
  maxTeams: 4,
);
const _offerAlmostFull = TournamentCategoryOffer(
  id: 'c5',
  name: 'Feminino E',
  entryFee: 120,
  maxTeams: 8,
);

const _enrollment = {'c1': 3, 'c2': 8, 'c3': 2, 'c4': 4, 'c5': 7};

TournamentDetail _detail({
  List<TournamentCategoryOffer> offers = const [_offerOpen],
  bool requireFormedPair = false,
  DateTime? registrationClosesAt,
}) {
  return TournamentDetail(
    id: 't1',
    name: 'Copa de Teste',
    location: 'Arena Teste',
    city: 'Goiânia',
    dateLabel: '20–22 Ago',
    startDate: DateTime(2026, 8, 20),
    endDate: DateTime(2026, 8, 22),
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 120',
    priceValue: 120,
    spotsLeft: 8,
    spotsTotal: 16,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 8,
    liveMatchesNow: 0,
    categoryOffers: offers,
    sport: 'beachTennis',
    requireFormedPair: requireFormedPair,
    registrationClosesAt: registrationClosesAt,
  );
}

const _detailStats = TournamentDetailStats(
  categoryCount: 1,
  openCategories: 1,
  spotsTotal: 8,
  spotsEnrolled: 2,
  prizeTotalLabel: '',
);

DiscoveryTournament _discovery({
  String name = 'Copa Sol',
  int liveMatchesNow = 0,
}) {
  return DiscoveryTournament(
    id: 't9',
    name: name,
    location: 'Arena Sol',
    city: 'Recife',
    dateLabel: '16/08',
    startDate: DateTime(2026, 8, 16),
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 140,00',
    priceValue: 140,
    spotsLeft: 6,
    spotsTotal: 16,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 10,
    liveMatchesNow: liveMatchesNow,
  );
}

MyTournamentRegistration _registration({
  String id = 'reg-1',
  String tournamentName = 'Copa de Teste',
  String statusLabel = 'Confirmada e paga',
  bool isPaid = true,
  TournamentListingStatus? listingStatus,
  List<String> participantUids = const ['me', 'ana'],
  int? teamSize,
}) {
  return MyTournamentRegistration(
    registrationId: id,
    tournamentId: 't1',
    tournamentName: tournamentName,
    dateLabel: '20 ago',
    statusLabel: statusLabel,
    isPaid: isPaid,
    categoryId: 'masc',
    listingStatus: listingStatus,
    participantUids: participantUids,
    teamSize: teamSize,
    category: TournamentCategoryOffer(
      id: 'masc',
      name: 'Dupla Masculina',
      entryFee: 150,
      teamSize: teamSize,
    ),
  );
}

// ── Inscrição ───────────────────────────────────────────────────────────

const _partner = TournamentRegistrationPartnerCandidate(
  userId: 'p1',
  initials: 'CN',
  name: 'Carla Nunes',
  rankLabel: '#12',
);

const _duo = [
  TournamentRosterMember(
      uid: 'me', name: 'Eu Mesmo', isCaptain: true, isMe: true),
  TournamentRosterMember(
    uid: 'p1',
    name: 'Carla Nunes',
    isCaptain: false,
    isMe: false,
  ),
];

TournamentPartnerInvite _invite({
  String status = 'pending',
  String inviterUid = 'me',
  bool substitution = false,
}) {
  return TournamentPartnerInvite(
    id: 'invite-1',
    tournamentId: 't1',
    categoryId: 'masc',
    inviterUid: inviterUid,
    inviterName: 'Bia Lima',
    inviteeUid: 'carla',
    inviteeName: 'Carla Nunes',
    status: status,
    attachRegistrationId: 'reg-1',
    createdAt: DateTime.now().subtract(const Duration(hours: 2)),
    expiresAt: DateTime.now().add(const Duration(hours: 40)),
    isSubstitutionInvite: substitution,
    replacedUid: substitution ? 'ana' : null,
    replacedName: substitution ? 'Ana Souza' : null,
  );
}

const _joao = SquadCodeCheck(
  ambassadorName: 'João Victor',
  code: 'JOAO10',
  origin: 'code',
  discountPct: 10,
  feePercent: 8,
);

List<Override> _signedIn() => [
      authProvider.overrideWith(
        (ref) => Stream.value(MockUser(uid: 'me', displayName: 'Eu Mesmo')),
      ),
    ];

// ── Telas ───────────────────────────────────────────────────────────────

final _screens = <_Screen>[
  _Screen(
    'Card de partida: encerrada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentMatchCard(viewModel: _vm(_doneMatch)),
      overrides: _matchCardOverrides(),
    ),
    find.byType(TournamentMatchCard),
    ['ENCERRADA', '2', '21·15', '21·18'],
  ),
  _Screen(
    'Card de partida: agendada e ao vivo seguida',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          TournamentMatchCard(viewModel: _vm(_scheduledMatch)),
          const SizedBox(height: 12),
          TournamentMatchCard(viewModel: _vm(_liveMatch)),
        ],
      ),
      overrides: _matchCardOverrides(followed: [_follow('m-live')]),
    ),
    _pieceFinder,
    [
      buildTournamentMatchRow(viewModel: _vm(_scheduledMatch))
          .stateLabel
          .toUpperCase(),
      '21·15',
      'marca',
    ],
  ),
  _Screen(
    'Card simétrico: estado de cada partida',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          for (final match in [
            _doneMatch,
            _liveMatch,
            _scheduledMatch,
            _tbdMatch
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: MatchCardHead(row: _row(match), contextLabel: 'Grupo A'),
            ),
        ],
      ),
      onCard: true,
    ),
    _pieceFinder,
    ['ENCERRADA', 'AO VIVO', 'marca', '17:30', 'A DEFINIR'],
  ),
  _Screen(
    'Ponto do ao vivo',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const Row(
        children: [
          TournamentMatchCardLiveDot(),
          SizedBox(width: 12),
          TournamentMatchCardLiveDot(size: 10),
        ],
      ),
      onCard: true,
    ),
    _pieceFinder,
    ['marca', 'marca'],
  ),
  _Screen(
    'Seguir partida: seguindo',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      FollowMatchButton(match: _liveMatch),
      onCard: true,
      overrides: _matchCardOverrides(followed: [_follow('m-live')]),
    ),
    find.byType(FollowMatchButton),
    ['Seguindo', 'marca'],
  ),
  _Screen(
    'Chave: placar parcial ao vivo',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      BracketMatchNode(
        viewModel: _vm(
          _match(
            id: 'm-bracket',
            poolId: '',
            status: TournamentMatchStatus.inProgress,
            // Sem set fechado: com um lado na frente nos sets, o nó já trata
            // esse lado como vencedor e troca a linha ao vivo pelas parciais.
            liveScore: const MatchLiveScore(
              setsA: 0,
              setsB: 0,
              currentGamesA: 5,
              currentGamesB: 3,
            ),
          ),
        ),
        isAthleteMatch: false,
        isFinal: false,
        athleteTeamIds: const {},
      ),
    ),
    find.byType(BracketMatchNode),
    ['Set em andamento · 5×3'],
  ),
  _Screen(
    'Grupos: classificação encerrada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentPoolStandingsCard(group: _group, qualifiersPerGroup: 2),
    ),
    find.byType(TournamentPoolStandingsCard),
    // Selo, posição dos classificados, saldo +/−, faixa dos classificados
    // (2) e o ponto da legenda.
    ['FINALIZADO', '1', '2', '+11', '-11', 'marca', 'marca', 'marca'],
  ),
  _Screen(
    'Detalhe: lista de categorias',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const TournamentDetailCategoriesCard(
        tournamentId: 't1',
        tournamentName: 'Copa de Teste',
        offers: [_offerPaid, _offerDone, _offerOpen, _offerFull],
        enrollmentByCategoryId: _enrollment,
        enrollmentCountsResolved: true,
        registrationsByCategoryId: {
          'c1': UserCategoryRegistration(registrationId: 'r1', isPaid: true),
        },
      ),
    ),
    find.byType(TournamentDetailCategoriesCard),
    ['INSCRITO', 'ENCERRADA', '6 vagas', 'LISTA ESP.'],
  ),
  _Screen(
    'Detalhe: escolha da categoria',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          TournamentDetailCategoryPickSection(
            tournament: _detail(),
            stats: _detailStats,
            enrollmentByCategoryId: _enrollment,
            enrollmentCountsResolved: true,
            canAccessTournaments: true,
            onRegisterBlocked: () {},
            registrationsByCategoryId: const {
              'c3': UserCategoryRegistration(
                registrationId: 'r3',
                isPaid: true,
              ),
            },
            registrationResolved: true,
          ),
          TournamentDetailCategoryPickSection(
            tournament: _detail(offers: const [_offerAlmostFull]),
            stats: _detailStats,
            enrollmentByCategoryId: _enrollment,
            enrollmentCountsResolved: true,
            canAccessTournaments: true,
            onRegisterBlocked: () {},
            registrationResolved: true,
          ),
        ],
      ),
    ),
    _pieceFinder,
    ['6 vagas disponíveis', 'INSCRITO', '1 vaga disponível'],
  ),
  _Screen(
    'Detalhe: minha inscrição confirmada',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const Scaffold(
          body: TournamentDetailMyRegistrationTab(tournamentId: 't1')),
      [
        ..._signedIn(),
        myTournamentRegistrationsProvider.overrideWith(
          (ref) => Stream.value([_registration()]),
        ),
        athleteHomeInProgressRegistrationsProvider.overrideWith(
          (ref) async => const [],
        ),
      ],
    ),
    find.byType(TournamentDetailMyRegistrationTab),
    [Icons.verified_outlined, 'Confirmada e paga'],
  ),
  _Screen(
    'Vagas por categoria',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const TournamentCategorySpotsSection(
        tournamentId: 't1',
        offers: [_offerOpen, _offerAlmostFull, _offerFull],
        format: TournamentFormat.dupla,
      ),
      overrides: [
        tournamentCategoryEnrollmentCountsProvider.overrideWith(
          (ref, tournamentId) => Stream.value(_enrollment),
        ),
      ],
    ),
    find.byType(TournamentCategorySpotsSection),
    ['6 livres', '1 livre', 'LOTADA'],
  ),
  _Screen(
    'Vitrine: card do torneio',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentDiscoveryCard(
        tournament: _discovery(liveMatchesNow: 3),
        onTap: () {},
      ),
      overrides: [
        tournamentCategoryEnrollmentCountsProvider.overrideWith(
          (ref, tournamentId) => Stream.value(const <String, int>{}),
        ),
      ],
    ),
    // Só o corpo do card: o selo de status mora sobre a capa e segue o cru
    // de propósito (o fundo dele é a foto, não a superfície do tema).
    find
        .ancestor(of: find.text('Copa Sol'), matching: find.byType(Padding))
        .first,
    ['10/16 DUPLAS', '3 jogos ao vivo agora'],
  ),
  _Screen(
    'Vitrine: estatísticas da lista',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const DiscoveryListStatsRow(
        stats: TournamentHubStats(
          subscriptions: 2,
          liveNow: 3,
          openRegistrations: 5,
        ),
      ),
    ),
    find.byType(DiscoveryListStatsRow),
    ['3 ao vivo'],
  ),
  _Screen(
    'Vitrine: card de liga com inscrições abertas',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      LeagueDiscoveryCard(
        league: const DiscoveryLeague(id: 'l1', name: 'Liga Sol', stages: []),
        tournamentCount: 3,
        onTap: () {},
        open: true,
      ),
    ),
    find.byType(LeagueDiscoveryCard),
    ['Inscrições abertas'],
  ),
  _Screen(
    'Home: meus torneios (ao vivo e aguardando pagamento)',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const MyTournamentsHomeSection(),
      overrides: [
        ..._signedIn(),
        myTournamentStaffEntriesProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        myTournamentRegistrationsProvider.overrideWith(
          (ref) => Stream.value([
            _registration(
              id: 'r-live',
              tournamentName: 'Copa ao Vivo',
              statusLabel: 'Inscrito',
              listingStatus: TournamentListingStatus.live,
            ),
            _registration(
              id: 'r-pend',
              tournamentName: 'Copa Pendente',
              statusLabel: 'Aguardando pagamento',
              isPaid: false,
              listingStatus: TournamentListingStatus.open,
            ),
          ]),
        ),
      ],
    ),
    find.byType(MyTournamentsHomeSection),
    ['AO VIVO', 'AGUARDANDO PAGAMENTO'],
  ),
  _Screen(
    'Meus torneios: em andamento',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          MyTournamentsOngoingCard(
            enrollment: MyTournamentEnrollment(
              registration: _registration(
                statusLabel: 'Inscrito',
                listingStatus: TournamentListingStatus.open,
              ),
            ),
            onTap: () {},
          ),
          MyTournamentsOngoingCard(
            enrollment: MyTournamentEnrollment(
              registration: _registration(
                statusLabel: 'Inscrito',
                listingStatus: TournamentListingStatus.live,
              ),
            ),
            onTap: () {},
          ),
        ],
      ),
      // O card já traz o recuo de 20 da lista.
      padding: EdgeInsets.zero,
    ),
    _pieceFinder,
    ['INSCRITO', '• DIA DO EVENTO'],
  ),
  _Screen(
    'Meus torneios: números dos encerrados',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const MyTournamentsCompletedStats(
        titlesDisplay: '2',
        podiumsDisplay: '5',
        rankingPointsDisplay: '1.240',
      ),
    ),
    find.byType(MyTournamentsCompletedStats),
    ['1.240'],
  ),
  _Screen(
    'Meus torneios: sugestão com vagas',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      MyTournamentsEmptySuggestedCard(
        tournament: _discovery(),
        onTap: () {},
        onRegisterTap: () {},
      ),
    ),
    find.byType(MyTournamentsEmptySuggestedCard),
    [openTournamentSpotsPriceLabel(_discovery())],
  ),
  _Screen(
    'Inscrição: aguardando o parceiro',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const TournamentRegistrationWaitingStep(
        partner: _partner,
        athleteDisplayName: 'Eu Mesmo',
        athleteInitials: 'EM',
      ),
    ),
    find.byType(TournamentRegistrationWaitingStep),
    ['Aguardando confirmação', '24 horas', 'Pendente', Icons.check_rounded],
  ),
  _Screen(
    'Inscrição: parceiro confirmou',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const TournamentRegistrationWaitingStep(
        partner: _partner,
        athleteDisplayName: 'Eu Mesmo',
        athleteInitials: 'EM',
        inviteAccepted: true,
      ),
    ),
    find.byType(TournamentRegistrationWaitingStep),
    ['Parceiro confirmou', Icons.check_rounded, Icons.check_rounded],
  ),
  _Screen(
    'Inscrição: pagamento com a dupla paga',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentRegistrationPaymentStep(
        category: _offerOpen,
        quote: buildRegistrationQuote(entryFee: 160),
        paymentType: 'share',
        onPaymentTypeChanged: (_) {},
        duoRoster: _duo,
        currentAthleteUid: 'me',
        sharePaidUids: const ['me', 'p1'],
        isFullyPaid: true,
        progressLabel: 'Inscrição paga pelos dois.',
      ),
    ),
    find.byType(TournamentRegistrationPaymentStep),
    ['DUPLA CONFIRMADA', 'PAGO', 'CONFIRMADO', 'Inscrição paga pelos dois.'],
  ),
  _Screen(
    'Inscrição: pagamento direto com o organizador',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentRegistrationPaymentStep(
        category: _offerOpen,
        quote: buildRegistrationQuote(entryFee: 160),
        paymentType: 'share',
        onPaymentTypeChanged: (_) {},
        isDirectOrganizerPayment: true,
        tournamentId: 't1',
        tournamentName: 'Copa de Teste',
      ),
      overrides: [authProvider.overrideWith((ref) => Stream.value(null))],
    ),
    find.byType(TournamentRegistrationPaymentStep),
    [
      Icons.handshake_outlined,
      Icons.info_outline_rounded,
      Icons.verified_rounded,
      'Falar',
      Icons.chat_bubble_outline_rounded,
    ],
  ),
  _Screen(
    'Inscrição: resumo de categoria gratuita',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const TournamentRegistrationPriceSummary(
        quote: TournamentRegistrationQuote(entryFee: 0),
      ),
    ),
    find.byType(TournamentRegistrationPriceSummary),
    ['Gratuita', 'Gratuita'],
  ),
  _Screen(
    'Inscrição: categorias já inscrita, a continuar e encerrada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const Column(
        children: [
          TournamentRegistrationCategoryCard(
            offer: _offerPaid,
            format: TournamentFormat.dupla,
            alreadyRegistered: true,
          ),
          SizedBox(height: 12),
          TournamentRegistrationCategoryCard(
            offer: _offerOpen,
            format: TournamentFormat.dupla,
            alreadyRegistered: true,
            registrationIncomplete: true,
          ),
          SizedBox(height: 12),
          TournamentRegistrationCategoryCard(
            offer: TournamentCategoryOffer(
              id: 'c9',
              name: 'Misto Z',
              entryFee: 120,
              registrationClosed: true,
            ),
            format: TournamentFormat.dupla,
          ),
        ],
      ),
    ),
    _pieceFinder,
    [
      'JÁ INSCRITO',
      Icons.verified_rounded,
      'CONTINUAR INSCRIÇÃO',
      Icons.arrow_forward_rounded,
      'INSCRIÇÕES ENCERRADAS',
    ],
  ),
  _Screen(
    'Inscrição: elenco completo da equipe',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentRegistrationRosterCard(
        teamName: 'Trio do Sol',
        members: const [
          ..._duo,
          TournamentRosterMember(
            uid: 'p2',
            name: 'Duda Reis',
            isCaptain: false,
            isMe: false,
          ),
        ],
        remainingSlots: 0,
        onLeaveTeam: () {},
      ),
    ),
    find.byType(TournamentRegistrationRosterCard),
    ['ELENCO COMPLETO', 'Sair da equipe'],
  ),
  _Screen(
    'Inscrição: convite solo aguardando',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentRegistrationSoloInviteCard(
        onInvitePartner: () {},
        pendingPartnerName: 'Carla Nunes',
      ),
    ),
    find.byType(TournamentRegistrationSoloInviteCard),
    [Icons.hourglass_top_rounded],
  ),
  _Screen(
    'Inscrição: uniforme salvo e com falha',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        children: [
          for (final state in [UniformSaveState.saved, UniformSaveState.failed])
            TournamentRegistrationUniformStep(
              tournament: _detail(),
              category: _offerOpen,
              selection: const TournamentUniformSelection(),
              onChanged: (_) {},
              saveState: state,
            ),
        ],
      ),
    ),
    _pieceFinder,
    [
      'Salvo',
      Icons.check_circle_outline_rounded,
      'Não salvou',
      Icons.error_outline_rounded,
    ],
  ),
  _Screen(
    'Inscrição: convite enviado a cancelar',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      TournamentRegistrationSentInvitesList(
        invites: [_invite()],
        isTeamCategory: false,
        onCancel: (_) {},
      ),
    ),
    find.byType(TournamentRegistrationSentInvitesList),
    ['Cancelar'],
  ),
  _Screen(
    'Inscrição: forma de pagamento',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      RegistrationPaymentMethodPicker(
        value: RegistrationPaymentMethod.pix,
        amountReais: 100,
        onChanged: (_) {},
      ),
    ),
    find.byType(RegistrationPaymentMethodPicker),
    [Icons.pix_rounded],
  ),
  _Screen(
    'Inscrição: detalhe com pagamento pendente',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TournamentRegistrationDetailPage(
        tournamentId: 't1',
        registrationId: 'reg-1',
      ),
      _detailPageOverrides(isPaid: false),
    ),
    find.byType(TournamentRegistrationDetailPage),
    ['PAGAMENTO PENDENTE'],
  ),
  _Screen(
    'Inscrição: detalhe confirmado',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TournamentRegistrationDetailPage(
        tournamentId: 't1',
        registrationId: 'reg-1',
      ),
      _detailPageOverrides(isPaid: true),
    ),
    // Só o rótulo: o selo de confirmado nos avatares é disco cheio do verde
    // cru (15,8 px) com o check preto por cima, fora deste ajuste e abaixo
    // de 3:1 no fundo tingido do cartão (ver o relatório).
    find.text('INSCRIÇÃO CONFIRMADA'),
    ['INSCRIÇÃO CONFIRMADA'],
  ),
  _Screen(
    'Inscrição: PIX com desconto de indicação',
    (tester, theme) async {
      await _pumpPage(
        tester,
        theme,
        TournamentRegistrationPixPage(args: _pixArgs()),
        _pixOverrides(),
      );
      await tester.enterText(find.byType(TextField), '52998224725');
      await tester.pump();
      await tester.ensureVisible(find.text('Gerar PIX'));
      await tester.pump();
      await tester.tap(find.text('Gerar PIX'));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    },
    find.byType(TournamentRegistrationPixPage),
    ['${formatBRL(10)} de desconto pela indicação de embaixador'],
  ),
  _Screen(
    'Wizard: consentimento LGPD',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const RegistrationConsentPage(tournamentId: 't1', categoryId: 'c3'),
      [
        firebaseAuthProvider.overrideWithValue(
          MockFirebaseAuth(signedIn: true, mockUser: MockUser(uid: 'me')),
        ),
        tournamentDetailProvider('t1').overrideWith(
          (ref) => Stream.value(_detail()),
        ),
      ],
    ),
    find.byType(RegistrationConsentPage),
    [
      Icons.person_outline_rounded,
      Icons.notifications_none_rounded,
      Icons.lock_outline_rounded,
      'OBRIGATÓRIO',
      'OBRIGATÓRIO',
    ],
  ),
  _Screen(
    'Wizard: condições da inscrição',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const RegistrationTermsPage(
        tournamentId: 't1',
        categoryId: 'c3',
        lgpdAccepted: true,
      ),
      [
        tournamentDetailProvider('t1').overrideWith(
          (ref) => Stream.value(
            _detail(
              requireFormedPair: true,
              registrationClosesAt: DateTime.now().add(const Duration(days: 9)),
            ),
          ),
        ),
        pendingTournamentPartnerInvitesProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        tournamentPartnerInviteServiceProvider.overrideWithValue(
          _FakeInviteService(),
        ),
      ],
    ),
    find.byType(RegistrationTermsPage),
    [
      'DUPLA OBRIGATÓRIA',
      Icons.info_outline_rounded,
      Icons.person_outline_rounded,
      Icons.calendar_today_rounded,
    ],
  ),
  _Screen(
    'Wizard: selo, prazo em destaque e avisos',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: RegistrationWizardPill(
              label: 'PENDENTE',
              tone: RegistrationWizardPillTone.warn,
            ),
          ),
          const RegistrationWizardSpecRow(
            label: 'Inscrições até',
            value: '18/08',
            highlight: true,
          ),
          const RegistrationWizardNotice(
            icon: Icons.info_outline_rounded,
            child: Text('Este torneio só aceita dupla formada.'),
          ),
          const SizedBox(height: 12),
          // Prazo vencido: relógio fixo em 00:00, sem depender do segundo.
          RegistrationWizardNotice(
            expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
            totalWindow: const Duration(minutes: 30),
          ),
        ],
      ),
      onCard: true,
    ),
    _pieceFinder,
    [
      'PENDENTE',
      '18/08',
      Icons.info_outline_rounded,
      Icons.notifications_none_rounded,
      'PRAZO ENCERRADO',
      '00:00',
    ],
  ),
  _Screen(
    'Substituição: regras do passo 1',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TournamentSubstitutionWizardPage(
        tournamentId: 't1',
        registrationId: 'reg-1',
      ),
      [
        ..._signedIn(),
        myTournamentRegistrationsProvider.overrideWith(
          (ref) => Stream.value([_trioRegistration()]),
        ),
        registrationRosterProfilesProvider.overrideWith(
          (ref, uids) async => const <String, AppUserProfile>{},
        ),
        usersRepositoryProvider.overrideWithValue(_FakeUsersRepository()),
        recentPartnersRepositoryProvider.overrideWithValue(
          _FakeRecentPartnersRepository(),
        ),
      ],
    ),
    find.byType(TournamentSubstitutionWizardPage),
    [Icons.calendar_today_rounded, Icons.confirmation_number_outlined],
  ),
  _Screen(
    'Substituição: aviso de pagamento ao escolher quem entra',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      TournamentSubstitutionPickPage(
        registration: _trioRegistration(),
        replacedUid: 'ana',
        replacedName: 'Ana Souza',
      ),
      [
        ..._signedIn(),
        usersRepositoryProvider.overrideWithValue(_FakeUsersRepository()),
        partnerSearchServiceProvider.overrideWithValue(
          _FakePartnerSearchService(),
        ),
        recentPartnersRepositoryProvider.overrideWithValue(
          _FakeRecentPartnersRepository(),
        ),
        tournamentPartnerInviteServiceProvider.overrideWithValue(
          _FakeInviteService(),
        ),
      ],
    ),
    find.byType(TournamentSubstitutionPickPage),
    [Icons.help_outline_rounded],
  ),
  _Screen(
    'Substituição: acompanhamento, vaga reservada',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TournamentSubstitutionStatusPage(
        tournamentId: 't1',
        inviteId: 'invite-1',
      ),
      _statusPageOverrides(),
    ),
    // A caixa "VAGA RESERVADA". O herói da troca fica de fora: o selo
    // "aguardando" do avatar de quem entra é pílula cheia do âmbar cru com
    // pontos pretos por cima (fora deste ajuste; ver o relatório).
    find
        .ancestor(
            of: find.text('VAGA RESERVADA'), matching: find.byType(Container))
        .first,
    [Icons.lock_clock_outlined, 'VAGA RESERVADA'],
  ),
  _Screen(
    'Substituição: acompanhamento, cancelar a troca',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TournamentSubstitutionStatusPage(
        tournamentId: 't1',
        inviteId: 'invite-1',
      ),
      _statusPageOverrides(),
    ),
    find.widgetWithText(OutlinedButton, 'Cancelar troca'),
    ['Cancelar troca'],
  ),
  _Screen(
    'Substituição: sucesso',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      TournamentSubstitutionSuccessPage(
        invite: _invite(status: 'accepted', substitution: true),
        registration: _registration(),
      ),
      [
        ..._signedIn(),
        registrationRosterProfilesProvider.overrideWith(
          (ref, uids) async => const <String, AppUserProfile>{},
        ),
      ],
    ),
    find.byType(TournamentSubstitutionSuccessPage),
    [Icons.check_rounded],
  ),
  _Screen(
    'NexaSquad: indicação aplicada',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      SquadAppliedCodeCard(
        check: _joao,
        actionLabel: 'Remover',
        onAction: () {},
      ),
    ),
    find.byType(SquadAppliedCodeCard),
    [Icons.check_rounded, '${squadPercent(10)} OFF nesta inscrição'],
  ),
  _Screen(
    'Palpites: você acertou',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      PredictionMatchPickCard(
        viewModel: _vm(_doneMatch),
        selectedTeamId: 'team-a',
        locked: true,
        wasCorrect: true,
      ),
    ),
    find.byType(PredictionMatchPickCard),
    ['VOCÊ ACERTOU', 'ENCERRADA'],
  ),
  _Screen(
    'Home: convite de dupla recebido',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const PendingTournamentInviteeInvitesSection(),
      overrides: [
        ..._signedIn(),
        pendingTournamentPartnerInvitesProvider.overrideWith(
          (ref) => Stream.value([_invite(inviterUid: 'u1')]),
        ),
        tournamentDetailProvider('t1').overrideWith(
          (ref) => Stream.value(_detail()),
        ),
        appUserPublicProfileProvider('u1').overrideWith(
          (ref) async => const AppUserProfile(uid: 'u1', fullName: 'Bia Lima'),
        ),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      ],
    ),
    find.byType(PendingTournamentInviteeInvitesSection),
    ['marca'],
  ),
  _Screen(
    'Home: inscrição aguardando o parceiro',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const PendingTournamentInviterInvitesSection(),
      overrides: [
        ..._signedIn(),
        ongoingTournamentPartnerInvitesHomeProvider.overrideWith(
          (ref) => Stream.value([_invite()]),
        ),
      ],
    ),
    find.byType(PendingTournamentInviterInvitesSection),
    [Icons.schedule_rounded],
  ),
  _Screen(
    'Convite de dupla: herói',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const PartnerInviteHeroCard(
        inviterName: 'Bia Lima',
        inviterInitials: 'BL',
        inviteeInitials: 'EM',
      ),
    ),
    find.byType(PartnerInviteHeroCard),
    ['CONFIRMADO'],
  ),
  _Screen(
    'Equipe: campanha campeã no histórico',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const TeamProfileHistoryTab(
        campaigns: [
          TeamCampaignEntry(
            tournamentId: 't1',
            tournamentName: 'Copa Sol',
            resultLabel: '1º',
            wins: 4,
            losses: 0,
          ),
        ],
        formedLabel: '',
      ),
    ),
    find.byType(TeamProfileHistoryTab),
    ['1º'],
  ),
  _Screen(
    'Competir: card do ranking',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const CompeteHubRankingCard(
        ranking: CompeteHubUserRanking(
          rank: 3,
          seasonLabel: '2026',
          subtitle: 'Top 5% da temporada',
          points: 1240,
          tournamentsCount: 12,
        ),
      ),
    ),
    find.byType(CompeteHubRankingCard),
    ['12'],
  ),
  _Screen(
    'Competir: atleta online',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const CompeteHubAthletesSection(),
      overrides: [
        competeHubAthletesPreviewProvider.overrideWith(
          (ref) async => const [
            CompeteHubAthletePreview(
              userId: 'u2',
              name: 'Bia Lima',
              categoryLabel: 'Fem B',
              initials: 'BL',
              avatarColor: Color(0xFF5B8DEF),
              isOnline: true,
            ),
          ],
        ),
      ],
    ),
    find.byType(CompeteHubAthletesSection),
    ['marca'],
  ),
  _Screen(
    'Liga: erro ao carregar',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const LeagueDetailPage(leagueId: 'l1'),
      [
        leagueDetailProvider('l1').overrideWith(
          (ref) => Stream.error(Exception('falhou')),
        ),
        discoveryTournamentsProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
      ],
    ),
    find.byType(LeagueDetailPage),
    ['Não foi possível carregar a liga.\nException: falhou'],
  ),
  _Screen(
    'Liga: circuito cancelado',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const LeagueDetailPage(leagueId: 'l1'),
      [
        firebaseAuthProvider.overrideWithValue(MockFirebaseAuth()),
        leagueDetailProvider('l1').overrideWith(
          (ref) => Stream.value(
            const DiscoveryLeague(
              id: 'l1',
              name: 'Liga Sol',
              stages: [],
              listingStatus: 'cancelled',
            ),
          ),
        ),
        discoveryTournamentsProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
      ],
    ),
    find.byType(LeagueDetailPage),
    ['Este circuito foi cancelado.'],
  ),
  _Screen(
    'Liga: ranking com erro',
    (tester, theme) => _pumpPiece(
      tester,
      theme,
      const LeagueDetailRankingSection(
        league: DiscoveryLeague(
          id: 'l1',
          name: 'Liga Sol',
          stages: [],
          categories: [
            DiscoveryLeagueCategory(
              id: 'cm',
              name: 'Masculino',
              genderType: 'male',
            ),
          ],
        ),
        tournamentsById: {},
      ),
      overrides: [
        firebaseAuthProvider.overrideWithValue(MockFirebaseAuth()),
        leagueViewerTeamIdsProvider.overrideWith((ref) async => const {}),
        leagueCategoryRankingRowsProvider.overrideWith(
          (ref, key) async => throw Exception('falhou'),
        ),
      ],
    ),
    find.byType(LeagueDetailRankingSection),
    ['Não foi possível carregar o ranking.'],
  ),
  _Screen(
    'Equipes: erro na descoberta',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TeamDiscoverPage(),
      [teamDiscoverProvider.overrideWith(_FailedTeamDiscover.new)],
    ),
    find.byType(TeamDiscoverPage),
    ['Não foi possível carregar equipes.\nfalhou'],
  ),
  _Screen(
    'Equipe: erro no perfil público',
    (tester, theme) => _pumpPage(
      tester,
      theme,
      const TeamPublicProfilePage(teamId: 'team-1'),
      [
        teamPublicProfileProvider('team-1').overrideWith(
          (ref) async => throw Exception('falhou'),
        ),
        teamMatchHistoryProvider('team-1').overrideWith(
          (ref) async => throw Exception('falhou'),
        ),
        teamIsFollowedProvider('team-1').overrideWith(
          (ref) => Stream.value(false),
        ),
      ],
    ),
    find.byType(TeamPublicProfilePage),
    ['Não foi possível carregar a equipe.\nException: falhou'],
  ),
];

List<Override> _statusPageOverrides() => [
      ..._signedIn(),
      tournamentPartnerInviteProvider('invite-1').overrideWith(
        (ref) => Stream.value(_invite(substitution: true)),
      ),
      myTournamentRegistrationsProvider.overrideWith(
        (ref) => Stream.value([_registration()]),
      ),
      registrationRosterProfilesProvider.overrideWith(
        (ref, uids) async => const <String, AppUserProfile>{},
      ),
      tournamentPartnerInviteServiceProvider.overrideWithValue(
        _FakeInviteService(),
      ),
    ];

MyTournamentRegistration _trioRegistration() => _registration(
      participantUids: const ['me', 'ana', 'bia'],
      teamSize: 3,
    );

List<Override> _detailPageOverrides({required bool isPaid}) => [
      ..._signedIn(),
      myTournamentRegistrationsProvider.overrideWith(
        (ref) => Stream.value([
          _registration(
            isPaid: isPaid,
            statusLabel: isPaid ? 'Confirmada e paga' : 'Pagamento pendente',
          ),
        ]),
      ),
      registrationRosterProfilesProvider.overrideWith(
        (ref, uids) async => const <String, AppUserProfile>{},
      ),
      inviterTournamentPartnerInvitesProvider.overrideWith(
        (ref) => Stream.value(const []),
      ),
      tournamentPartnerInviteServiceProvider.overrideWithValue(
        _FakeInviteService(),
      ),
    ];

TournamentRegistrationPixArgs _pixArgs() => TournamentRegistrationPixArgs(
      registrationId: 'reg-1',
      tournamentId: 't1',
      tournamentName: 'Copa Teste',
      categoryName: 'Dupla Masculina',
      shareAmountReais: 100,
      holdExpiresAt: DateTime.now().add(const Duration(minutes: 20)),
      holdMinutes: 30,
    );

/// Mesmo harness de `tournament_registration_pix_page_test.dart`: a cobrança
/// volta com R$ 10 de desconto da indicação aplicado pelo servidor.
List<Override> _pixOverrides() => [
      firebaseAuthProvider.overrideWithValue(
        MockFirebaseAuth(signedIn: true, mockUser: MockUser(uid: 'atleta-1')),
      ),
      tournamentAccessStateProvider.overrideWith(
        (ref) => const TournamentAccessState(
          canAccess: true,
          onboardingCompleted: true,
          isProfileComplete: true,
          blockMessage: null,
          missingStepTitles: [],
        ),
      ),
      athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      tournamentRegistrationSnapshotProvider('reg-1').overrideWith(
        (ref) => Stream.value(
          TournamentRegistrationSnapshot(
            registrationId: 'reg-1',
            isPaid: false,
            paidAmount: 0,
            holdExpiresAt: DateTime.now().add(const Duration(minutes: 20)),
          ),
        ),
      ),
      paymentServiceProvider.overrideWithValue(_FakePaymentService()),
      cashbackConfigProvider.overrideWith(
        (ref) => Stream.value(CashbackConfig.fallback),
      ),
      cashbackWalletProvider.overrideWith(
        (ref) => Stream.value(const CashbackWallet(availableCents: 0)),
      ),
      squadRepositoryProvider.overrideWithValue(_FakeSquadRepository()),
    ];

// ── Dublês ──────────────────────────────────────────────────────────────

/// Descoberta de equipes que já nasce no erro, sem tocar no repositório.
class _FailedTeamDiscover extends TeamDiscoverNotifier {
  @override
  TeamDiscoverState build() => const TeamDiscoverState(errorMessage: 'falhou');
}

class _FakeUsersRepository implements UsersRepository {
  @override
  Future<Map<String, AppUserProfile>> getUsersByIds(
    Iterable<String> uids,
  ) async =>
      const {};

  @override
  Future<AppUserProfile?> getUserById(String uid) async => null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeRecentPartnersRepository implements RecentPartnersRepository {
  @override
  Future<List<AppUserProfile>> loadRecentPartners({
    required String currentUserId,
    required String? categoryGenderType,
    int maxProfiles = 12,
  }) async =>
      const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePartnerSearchService implements PartnerSearchService {
  @override
  Future<List<AppUserProfile>> searchPartners({
    required String currentUserId,
    required String? categoryGenderType,
    required String query,
    int max = PartnerSearchService.kFetchLimit,
  }) async =>
      const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Nenhuma tela aqui chega a chamar o serviço de convites: só a abertura.
class _FakeInviteService implements TournamentPartnerInviteService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePaymentService implements PaymentService {
  @override
  Future<ArenaBookingPixPaymentResult> createTournamentRegistrationPixPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
    bool useCashback = false,
    String? squadCode,
  }) async {
    return ArenaBookingPixPaymentResult(
      paymentId: 'pay_t1',
      qrCode: '00020101021226860014br.gov.bcb.pix',
      qrCodeBase64: '',
      expiresAt: DateTime.now().add(const Duration(minutes: 15)),
      amountToPayNowReais: 100,
      squadDiscountReais: 10,
      chargedReais: 90,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeSquadRepository implements SquadRepository {
  @override
  Future<SquadCodeCheck> checkCode({
    required String code,
    required List<String> athleteUids,
    required String registrationId,
    String purpose = 'registration',
    String? arenaId,
  }) async =>
      SquadCodeCheck.none;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ── Card da categoria: selo sobre a arte ────────────────────────────────

/// Fundo por trás do selo do card da categoria: a arte da faixa de nível com
/// o scrim escuro por cima. A arte é irmã do conteúdo num `Stack` — o
/// `backdropOf` do helper não a enxerga e acharia que o selo está sobre o
/// canvas do tema. Aqui vale o caso mais escuro e previsível: o fundo de
/// reserva da arte (`AppColors.canvas`) com o scrim na altura do selo.
Color _scrimBehind(WidgetTester tester, Finder pill, Finder card) {
  final rect = tester.getRect(card);
  final t =
      ((tester.getCenter(pill).dx - rect.left) / rect.width).clamp(0.0, 1.0);
  // Gradiente do scrim: 0,78 → 0,6 → 0,42 da esquerda para a direita.
  final alpha = t < 0.5
      ? 0.78 + (0.6 - 0.78) * (t / 0.5)
      : 0.6 + (0.42 - 0.6) * ((t - 0.5) / 0.5);
  var bg = AppColors.canvas;
  bg = Color.alphaBlend(Colors.black.withValues(alpha: alpha), bg);
  bg = Color.alphaBlend(Colors.black.withValues(alpha: 0.18), bg);
  return bg;
}

void main() {
  // `_screens` já formata horário em pt_BR ao ser montada, antes de qualquer
  // `setUpAll`. Os dados do locale local entram na hora; o Future só avisa.
  initializeDateFormatting('pt_BR');

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $label', () {
      for (final screen in _screens) {
        testWidgets('${screen.name}: tons de estado legíveis', (tester) async {
          await screen.open(tester, theme);
          final checked = expectStateTonesLegible(tester, screen.root);
          expect(checked, containsAll(screen.expected));
        });
      }

      // Fora do alcance do helper: o selo do card da categoria (INSCRITO,
      // LISTA ESP., ENCERRADA, AO VIVO) mora sobre a arte escura da faixa de
      // nível nos dois temas, então segue o tom cru. Escurecer no claro
      // derruba o selo para ~2,7:1 no scrim: este caso segura isso.
      testWidgets(
        'card da categoria: selo sobre a arte escura legível',
        (tester) async {
          await _pumpPiece(
            tester,
            theme,
            Column(
              children: [
                TournamentDetailCategoryCard(
                  offer: _offerPaid,
                  tournamentId: 't1',
                  tournamentName: 'Copa de Teste',
                  tournamentStatus: TournamentListingStatus.open,
                  onRegister: () {},
                  inscriptionCount: 3,
                  registration: const UserCategoryRegistration(
                    registrationId: 'r1',
                    isPaid: true,
                  ),
                ),
                TournamentDetailCategoryCard(
                  offer: _offerDone,
                  tournamentId: 't1',
                  tournamentName: 'Copa de Teste',
                  tournamentStatus: TournamentListingStatus.open,
                  onRegister: () {},
                  inscriptionCount: 8,
                ),
              ],
            ),
          );
          for (final text in ['INSCRITO', 'ENCERRADA']) {
            final pillText = find.text(text);
            final card = find.ancestor(
              of: pillText,
              matching: find.byType(TournamentDetailCategoryCard),
            );
            final color = tester.widget<Text>(pillText).style!.color!;
            final pillFill = (tester
                    .widget<Container>(
                      find
                          .ancestor(
                            of: pillText,
                            matching: find.byType(Container),
                          )
                          .first,
                    )
                    .decoration! as BoxDecoration)
                .color!;
            final bg = Color.alphaBlend(
              pillFill,
              _scrimBehind(tester, pillText, card),
            );
            expect(
              contrastRatio(color, bg),
              greaterThanOrEqualTo(4.5),
              reason: '"$text" ($color) sobre a arte ($bg)',
            );
          }
        },
      );
    });
  }
}
