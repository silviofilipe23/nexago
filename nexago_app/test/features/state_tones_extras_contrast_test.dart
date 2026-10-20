import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/domain/cashback_rules.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_page.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/cashback_earned_note.dart';
import 'package:nexago_app/features/cashback/presentation/widgets/checkout_cashback_toggle.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_event_mapper.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_event.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_logic.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_models.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/organizers_directory_page.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/widgets/organizer_champion_names.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/widgets/organizer_event_tiles.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/widgets/organizer_profile_header_parts.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/widgets/organizer_profile_tabs.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/domain/professor_links_repository.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_detail_page.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_request_sent_page.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_invite_sheet.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_link_request_sheet.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_links_ui.dart';
import 'package:nexago_app/features/professor_mode/application/professor_mode_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/domain/squad_rules.dart';
import 'package:nexago_app/features/squad/presentation/squad_invite_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_ranking_page.dart';
import 'package:nexago_app/features/squad/presentation/widgets/squad_checkout_summary.dart';
import 'package:nexago_app/features/squad/presentation/widgets/squad_sheets.dart';
import 'package:nexago_app/features/squad/presentation/widgets/squad_ui.dart';
import 'package:nexago_app/features/store/application/store_checkout_providers.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/application/store_review_providers.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_review_models.dart';
import 'package:nexago_app/features/store/presentation/store_address_page.dart';
import 'package:nexago_app/features/store/presentation/store_cart_page.dart';
import 'package:nexago_app/features/store/presentation/store_checkout_copy.dart';
import 'package:nexago_app/features/store/presentation/store_copy.dart';
import 'package:nexago_app/features/store/presentation/store_favorites_page.dart';
import 'package:nexago_app/features/store/presentation/store_order_review_page.dart';
import 'package:nexago_app/features/store/presentation/store_page.dart';
import 'package:nexago_app/features/store/presentation/store_review_copy.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_checkout_parts.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_customize_panels.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_order_parts.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_review_parts.dart';

import '../core/theme/state_tone_screens.dart';
import 'professor_links/professor_links_test_support.dart';
import 'squad/squad_test_support.dart';
import 'store/presentation/store_checkout_test_kit.dart';

// Verde, vermelho e âmbar do cashback, do perfil público do organizador, dos
// vínculos do professor, do NexaSquad e da Loja, conferidos contra o fundo
// real nos dois temas. No claro os crus do AppColors reprovam: ~1,6–3,5:1 no
// branco.

// ── Fixtures: cashback ──────────────────────────────────────────────────

const _cashbackOn = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

final _earn = CashbackLedgerEntry(
  id: 'e1',
  type: CashbackLedgerType.earn,
  amountCents: 240,
  label: 'Reserva · Arena Sol',
  createdAt: DateTime(2026, 9, 28, 9),
);

final _release = CashbackLedgerEntry(
  id: 'e2',
  type: CashbackLedgerType.release,
  amountCents: 180,
  label: 'Inscrição · Copa Verão',
  createdAt: DateTime(2026, 10, 13, 10),
);

List<Override> _earnedNoteOverrides(CashbackLot? lot) => [
      cashbackConfigProvider.overrideWith((ref) => Stream.value(_cashbackOn)),
      cashbackLotProvider('pay_1').overrideWith((ref) => Stream.value(lot)),
    ];

CheckoutCashbackToggle _toggle({required int available, bool value = false}) {
  return CheckoutCashbackToggle(
    priceCents: 2000,
    availableCents: available,
    config: _cashbackOn,
    value: value,
    onChanged: (_) {},
  );
}

final _redeemableCents = quoteCheckoutCashback(
  priceCents: 2000,
  checkout: const CashbackCheckoutContext(
    config: _cashbackOn,
    availableCents: 3000,
  ),
  useCashback: true,
).redeemableCents;

// ── Fixtures: perfil público do organizador ─────────────────────────────

const _organizer = OrganizerPublicProfile(
  uid: 'goi',
  name: 'Liga Amadora Goiânia',
  city: 'Goiânia',
  state: 'GO',
  isOrganizer: true,
  listed: true,
  followersCount: 2100,
  stats: OrganizerPublicStats(openEvents: 3, eventsCompleted: 38),
);

final OrganizerEvent _doneEvent = organizerEventFromMap('ev-done', {
  'name': 'Torneio de Abertura',
  'listingStatus': 'completed',
  'sport': 'beachVolleyball',
  'startAt': Timestamp.fromDate(DateTime(2026, 5, 2, 8)),
  'categories': [
    {'id': 'c1', 'categoryName': 'Masculino B'},
  ],
  'categoryOps': {
    'c1': {'championTeamId': 'team-1'},
  },
})!;

const _championNames = OrganizerChampionNames(
  names: {'team-1': 'Ana Souza e Bia Lima'},
);

const _reputation = OrganizerReputationView(
  average: 4.6,
  reviewsCount: 12,
  aspects: [OrganizerAspectRow(label: 'Organização', average: 4.7)],
  distribution: [
    OrganizerDistributionRow(stars: 5, count: 8, fraction: 0.66),
    OrganizerDistributionRow(stars: 4, count: 4, fraction: 0.34),
  ],
);

// ── Fixtures: vínculos do professor ─────────────────────────────────────

final _pendingLink = professorLink(
  arenaId: 'lagoa',
  arenaName: 'Lagoa Beach Club',
  type: ArenaProfessorLinkType.independent,
  status: ArenaProfessorLinkStatus.pending,
  initiatedBy: ArenaProfessorSide.professor,
  requestedAt: DateTime(2026, 10, 17),
  updatedAt: DateTime(2026, 10, 17),
);

final _activeLink = professorLink(
  arenaId: 'arena-norte',
  arenaName: 'Arena Norte',
  type: ArenaProfessorLinkType.independent,
  initiatedBy: ArenaProfessorSide.professor,
  approvedAt: DateTime(2026, 5, 6),
);

const _allPermissions = ArenaProfessorPermissions(
  canManageOwnLessons: true,
  canBookCourts: true,
  canAppearInArenaProfile: true,
);

/// Sessão, relógio e repositório dos vínculos, sem Firebase: a claim do
/// token volta vazia e a sincronização do papel não espera nada.
List<Override> _professorOverrides(FakeProfessorLinksRepository repo) => [
      professorLinksRepositoryProvider.overrideWithValue(repo),
      professorLinksUidProvider.overrideWithValue(professorTestUid),
      professorLinksClockProvider.overrideWithValue(() => professorTestNow),
      professorTokenRolesReaderProvider.overrideWithValue(
        ({required bool forceRefresh}) async => const <String>[],
      ),
      professorRoleRetryDelaysProvider.overrideWithValue(const <Duration>[]),
    ];

/// Folha dos vínculos com altura limitada (o corpo tem um `Flexible`).
Widget _professorSheet(Widget child) => SizedBox(height: 1100, child: child);

// ── Fixtures: NexaSquad ─────────────────────────────────────────────────

final _squadRanking = squadRanking(
  entries: [
    squadRankingEntryPayload(1, 'Marina Costa', 2400, delta: 0),
    squadRankingEntryPayload(2, 'Pedro Alves', 2100, delta: 1),
    squadRankingEntryPayload(3, 'João Victor', 1280, delta: 3, me: true),
    squadRankingEntryPayload(4, 'Lia Rocha', 900, delta: 2),
    squadRankingEntryPayload(5, 'Caio Lima', 600, delta: -2),
  ],
);

// ── Fixtures: Loja ──────────────────────────────────────────────────────

/// Overrides do [CheckoutHarness] (mesmos fakes), sem o GoRouter dele: a
/// tela abre direto como `home`, no tema do teste.
List<Override> _storeOverrides(CheckoutHarness h) => [
      storeRepositoryProvider.overrideWithValue(h.store),
      storeCheckoutServiceProvider.overrideWithValue(h.service),
      storeCheckoutRepositoryProvider.overrideWithValue(h.checkout),
      storeCepLookupProvider.overrideWithValue(FakeCepLookup()),
      storeUidProvider.overrideWith((ref) => 'ana'),
      storeUserPositionProvider.overrideWith((ref) => null),
      storeBookingVisitsProvider.overrideWith((ref) => const []),
      storeCheckoutChannelProvider.overrideWithValue(kStoreChannelIos),
      storeRecipientNameProvider.overrideWith((ref) => 'Ana Souza'),
      storeOpenUrlProvider.overrideWithValue((uri) async => true),
      analyticsServiceProvider.overrideWithValue(h.analytics),
      storeReviewRepositoryProvider.overrideWithValue(h.reviews),
      storeReviewServiceProvider.overrideWithValue(h.reviewService),
      storeReviewPhotoPickerProvider.overrideWithValue(h.photoPicker),
    ];

/// Vitrine/favoritos: só o repositório da Loja e a sessão.
List<Override> _showcaseOverrides(FakeStoreRepository repo) => [
      storeRepositoryProvider.overrideWithValue(repo),
      storeUidProvider.overrideWith((ref) => 'ana'),
      storeUserPositionProvider.overrideWith((ref) => null),
      storeBookingVisitsProvider.overrideWith((ref) => const []),
      analyticsServiceProvider.overrideWithValue(RecordingAnalytics()),
    ];

const StoreProduct _bolaPromo = StoreProduct(
  id: 'bola',
  name: 'Bola Pro Beach',
  category: 'bolas',
  priceCents: 18990,
  compareAtPriceCents: 21990,
  minPriceCents: 18990,
  maxPriceCents: 18990,
  pickup: true,
  variants: [
    StoreVariant(id: 'unico', priceCents: 18990, inStock: true, maxQty: 3),
  ],
);

/// A bola em promoção favoritada: acende a faixa verde dos favoritos.
class _FavoritesRepository extends FakeStoreRepository {
  _FavoritesRepository() : super(products: const [_bolaPromo]);

  @override
  Stream<StoreShopper> watchShopper(String uid) =>
      Stream.value(const StoreShopper(favoriteIds: ['bola']));
}

/// Catálogo só do cache (sem servidor): acende o "Sem conexão".
class _OfflineRepository extends FakeStoreRepository {
  @override
  Stream<StoreCatalog> watchCatalog() =>
      Stream.value(StoreCatalog(products: products, fromCache: true));
}

const _area = StoreCustomArea(
  id: 'peito',
  name: 'Peito',
  widthCm: 20,
  heightCm: 20,
);

const _imageOptions = StoreCustomImageOptions(
  enabled: true,
  formats: ['png', 'svg'],
  areas: [_area],
);

StoreCustomizeImagePanel _imagePanel(StoreImageDraft draft) =>
    StoreCustomizeImagePanel(
      options: _imageOptions,
      aloneCents: 0,
      draft: draft,
      area: _area,
      onPick: () {},
      onRetry: () {},
      onArea: (_) {},
    );

/// Pedido entregue em casa, 1 produto: a avaliação tem um passo só.
StoreOrderView _deliveredOrder() => orderView('ord_r', {
      'number': 'NX-4740',
      'status': 'ent',
      'items': [
        {
          'productId': 'viseira',
          'skuId': 'viseira_1',
          'name': 'Viseira Dry Fit',
          'variantLabel': 'Preta · único',
          'qty': 1,
          'unitCents': 6990,
          'totalCents': 6990,
        },
      ],
      'delivery': {'type': 'casa', 'address': 'Rua T-37, 1240'},
      'completedAt': '2026-09-18T20:00:00.000Z',
    });

Future<void> _frames(WidgetTester tester, [int n = 8]) async {
  for (var i = 0; i < n; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

// ── Telas ───────────────────────────────────────────────────────────────

final List<ToneScreen> extrasToneScreens = [
  // Cashback
  ToneScreen(
    'Meu cashback: pendente no herói e extrato',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const CashbackPage(),
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(_cashbackOn)),
        cashbackWalletProvider.overrideWith(
          (ref) => Stream.value(
            const CashbackWallet(availableCents: 1240, pendingCents: 480),
          ),
        ),
        cashbackLedgerProvider.overrideWith(
          (ref) => Stream.value([_release, _earn]),
        ),
      ],
    ),
    find.byType(CashbackPage),
    [
      CashbackCopy.pendingLine(480),
      Icons.check_circle_rounded,
      CashbackCopy.signedAmount(_release),
      Icons.hourglass_top_rounded,
      CashbackCopy.signedAmount(_earn),
      CashbackCopy.ledgerMeta(_earn),
    ],
  ),
  ToneScreen(
    'Nota de cashback do PIX: sem lote ainda',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      CashbackEarnedNote(paymentId: 'pay_1', onOpenCashback: () {}),
      overrides: _earnedNoteOverrides(null),
    ),
    tonePiece,
    [Icons.savings_rounded],
  ),
  ToneScreen(
    'Nota de cashback do PIX: lote pendente',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      CashbackEarnedNote(paymentId: 'pay_1', onOpenCashback: () {}),
      overrides: _earnedNoteOverrides(
        const CashbackLot(
          id: 'pay_1',
          status: CashbackLotStatus.pending,
          earnedCents: 240,
          remainingCents: 240,
        ),
      ),
    ),
    tonePiece,
    [Icons.savings_rounded],
  ),
  ToneScreen(
    'Usar meu cashback: só a linha de ganho',
    (tester, theme) =>
        pumpTonePiece(tester, theme, _toggle(available: 0), onCard: true),
    tonePiece,
    [Icons.savings_outlined],
  ),
  ToneScreen(
    'Usar meu cashback: ligado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _toggle(available: 3000, value: true),
    ),
    tonePiece,
    [Icons.savings_outlined, CashbackCopy.summaryAmount(_redeemableCents)],
  ),
  ToneScreen(
    'Cashback aplicado na cobrança',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const CheckoutCashbackAppliedNote(appliedCents: 500),
      onCard: true,
    ),
    tonePiece,
    [Icons.savings_outlined],
  ),

  // Perfil público do organizador
  ToneScreen(
    'Diretório: card com inscrição aberta',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerDirectoryCard(organizer: _organizer, onTap: () {}),
      overrides: [
        organizerReputationProvider.overrideWith(
          (ref, organizerId) => Stream.value(null),
        ),
      ],
    ),
    tonePiece,
    ['3 com inscrição aberta'],
  ),
  ToneScreen(
    'Selos do evento: abertas, últimas vagas, esgotado e ao vivo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OrganizerEventBadgeChip(badge: OrganizerEventBadge.registrationOpen),
          SizedBox(height: 8),
          OrganizerEventBadgeChip(badge: OrganizerEventBadge.lastSpots),
          SizedBox(height: 8),
          OrganizerEventBadgeChip(badge: OrganizerEventBadge.soldOut),
          SizedBox(height: 8),
          OrganizerEventBadgeChip(badge: OrganizerEventBadge.live),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    [
      OrganizerEventBadge.registrationOpen.label.toUpperCase(),
      OrganizerEventBadge.lastSpots.label.toUpperCase(),
      OrganizerEventBadge.soldOut.label.toUpperCase(),
      OrganizerEventBadge.live.label.toUpperCase(),
    ],
  ),
  ToneScreen(
    'Evento realizado: troféu dos campeões',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerCompletedEventRow(
        event: _doneEvent,
        championNames: _championNames,
        onOpen: () {},
      ),
      onCard: true,
    ),
    tonePiece,
    [Icons.emoji_events_outlined],
  ),
  ToneScreen(
    'Cabeçalho do perfil: estrela da nota',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const OrganizerProfileStatsRow(
        stats: [
          OrganizerHeaderStat(value: '38', label: 'eventos'),
          OrganizerHeaderStat(value: '4,8', label: 'nota', isRating: true),
        ],
      ),
    ),
    tonePiece,
    [Icons.star_rounded],
  ),
  ToneScreen(
    'Aba Resultados: troféu dos campeões',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerResultsTab(
        completed: [_doneEvent],
        championNames: _championNames,
        onOpenEvent: (_) {},
      ),
    ),
    tonePiece,
    [Icons.emoji_events_outlined],
  ),
  ToneScreen(
    'Aba Avaliações: estrelas e nota por evento',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const OrganizerReviewsTab(
        reputation: _reputation,
        eventRows: [
          OrganizerEventReviewRow(
            tournamentId: 't1',
            name: 'Copa Verão',
            average: 4.5,
            count: 6,
            dateLabel: '12 set',
          ),
        ],
      ),
    ),
    tonePiece,
    [Icons.star_rounded, Icons.star_half_rounded],
  ),

  // Vínculos do professor
  ToneScreen(
    'Status do vínculo: aguardando, ativo e suspenso',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfessorLinkStatusLabel(ArenaProfessorLinkStatus.pending),
          SizedBox(height: 8),
          ProfessorLinkStatusLabel(ArenaProfessorLinkStatus.active),
          SizedBox(height: 8),
          ProfessorLinkStatusLabel(
            ArenaProfessorLinkStatus.suspended,
            small: true,
          ),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['Aguardando a arena', 'Ativo', 'Suspenso', 'marca'],
  ),
  ToneScreen(
    'Permissões liberadas',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ProfessorPermissionList(permissions: _allPermissions, dense: true),
      onCard: true,
    ),
    tonePiece,
    [Icons.check_rounded],
  ),
  ToneScreen(
    'Notas amarela e vermelha',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProfessorLinksNote(
            'Até a aprovação você não pode reservar quadras.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
          SizedBox(height: 12),
          ProfessorLinksNote(
            'Vínculo suspenso pela arena.',
            tone: ProfessorLinksNoteTone.red,
          ),
        ],
      ),
    ),
    tonePiece,
    ['marca'],
  ),
  ToneScreen(
    'Botão fantasma vermelho',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ProfessorLinksGhostButton(
        label: 'Encerrar vínculo',
        color: AppColors.live,
        onPressed: () {},
      ),
    ),
    tonePiece,
    ['Encerrar vínculo'],
  ),
  ToneScreen(
    'Detalhe do vínculo: pedido aguardando',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      ProfessorLinkDetailPage(linkId: _pendingLink.id),
      overrides: _professorOverrides(
        FakeProfessorLinksRepository(links: [_pendingLink]),
      ),
    ),
    find.byType(ProfessorLinkDetailPage),
    ['Aguardando a arena', 'marca', 'Cancelar solicitação'],
  ),
  ToneScreen(
    'Detalhe do vínculo: ativo',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      ProfessorLinkDetailPage(linkId: _activeLink.id),
      overrides: _professorOverrides(
        FakeProfessorLinksRepository(links: [_activeLink]),
      ),
    ),
    find.byType(ProfessorLinkDetailPage),
    ['Ativo', 'marca', Icons.check_rounded, 'Encerrar vínculo'],
  ),
  ToneScreen(
    'Solicitação enviada',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      ProfessorLinkRequestSentPage(linkId: _pendingLink.id),
      overrides: _professorOverrides(
        FakeProfessorLinksRepository(links: [_pendingLink]),
      ),
    ),
    find.byType(ProfessorLinkRequestSentPage),
    [Icons.send_rounded, 'Aguardando a arena', 'marca'],
  ),
  ToneScreen(
    'Folha do convite: erro ao responder',
    (tester, theme) async {
      await pumpTonePiece(
        tester,
        theme,
        _professorSheet(ProfessorInviteSheet(link: invitedLink())),
        onSheet: true,
        overrides: _professorOverrides(
          FakeProfessorLinksRepository(
            links: [invitedLink()],
            respondError: const ProfessorLinkException('Este convite expirou.'),
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('professor-invite-accept')));
      await _frames(tester);
    },
    tonePiece,
    ['Este convite expirou.', Icons.check_rounded],
  ),
  ToneScreen(
    'Folha do pedido de vínculo: erro ao enviar',
    (tester, theme) async {
      await pumpTonePiece(
        tester,
        theme,
        _professorSheet(
          const ProfessorLinkRequestSheet(
            arenaId: 'praia-viva',
            arenaName: 'Praia Viva Arena',
          ),
        ),
        onSheet: true,
        overrides: _professorOverrides(
          FakeProfessorLinksRepository(
            requestError: const ProfessorLinkException(
              'A arena não aceita pedidos agora.',
            ),
          ),
        ),
      );
      await tester.tap(
        find.byKey(
          Key(
            'professor-request-type-'
            '${ArenaProfessorLinkType.independent.wire}',
          ),
        ),
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('professor-request-submit')));
      await _frames(tester);
    },
    tonePiece,
    ['A arena não aceita pedidos agora.', 'marca'],
  ),

  // NexaSquad
  ToneScreen(
    'Selo de nível Captain',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SquadTierBadge(SquadTier.cap),
          SizedBox(height: 8),
          SquadTierBadge(SquadTier.cap, small: true),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    ['marca'],
  ),
  ToneScreen(
    'Convite do Squad: código em uso',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const SquadInvitePage(inviteId: 'inv-1'),
        overrides: [
          squadRepositoryProvider.overrideWithValue(
            FakeSquadRepository(
              acceptError: const SquadException(
                'Esse código já está em uso. Escolha outro.',
                field: 'code',
              ),
            ),
          ),
        ],
      );
      await tester.tap(find.byKey(const Key('squad-invite-contract-check')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('squad-invite-accept')));
      await _frames(tester);
    },
    find.byType(SquadInvitePage),
    ['Esse código já está em uso. Escolha outro.'],
  ),
  ToneScreen(
    'Squad Ranking: subiu e caiu',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const SquadRankingPage(),
      overrides: [
        squadRankingProvider.overrideWith((ref) async => _squadRanking),
        mySquadProvider.overrideWith((ref) async => MySquad.none),
      ],
    ),
    find.byType(SquadRankingPage),
    [Icons.arrow_upward_rounded, squadDeltaLabel(2), squadDeltaLabel(-2)],
  ),
  ToneScreen(
    'Resumo do checkout com desconto do embaixador',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const SquadCheckoutSummary(
        priceCents: 12000,
        discountCents: 1200,
        discountLabel: 'Código JOAO10',
        cashbackCents: 0,
        totalCents: 10800,
      ),
      onCard: true,
    ),
    tonePiece,
    ['− ${formatBRLFromCents(1200)}'],
  ),
  ToneScreen(
    'Desconto do embaixador aplicado',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const SquadDiscountAppliedNote(discountCents: 1200),
      onCard: true,
    ),
    tonePiece,
    [Icons.sell_outlined],
  ),
  ToneScreen(
    'Benefícios do pacote: ativo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      SquadBenefitList(
        benefits: squadBenefits(squadPackage('amb')),
        status: 'Ativo',
      ),
    ),
    tonePiece,
    ['ATIVO'],
  ),

  // Loja
  ToneScreen(
    'Novo endereço: CEP encontrado',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const StoreAddressPage(),
        overrides: _storeOverrides(CheckoutHarness()),
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('store-address-field-zip')),
          matching: find.byType(TextField),
        ),
        '74210130',
      );
      await _frames(tester);
    },
    find.byType(StoreAddressPage),
    [Icons.check_rounded],
  ),
  ToneScreen(
    'Carrinho: cupom aplicado, descontos e retirada grátis',
    (tester, theme) async {
      final h = CheckoutHarness();
      h.service.quoteImpl = (req) => quoteFor(
            req,
            over: {
              'coupon': req.couponCode == null
                  ? null
                  : {
                      'code': req.couponCode,
                      'discountCents': 1000,
                      'problem': null,
                      'message': null,
                    },
            },
          );
      await pumpTonePage(
        tester,
        theme,
        StoreCartPage(clock: () => kTestNow),
        overrides: _storeOverrides(h),
      );
      await CheckoutHarness.settleQuote(tester);
      await tester.enterText(
        find.byKey(const ValueKey('store-cart-coupon-field')),
        'verao',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('store-cart-coupon-apply')));
      await CheckoutHarness.settleQuote(tester);
    },
    find.byType(StoreCartPage),
    [
      Icons.sell_outlined,
      StoreCheckoutCopy.discount(1000),
      StoreCheckoutCopy.discount(950),
      StoreCheckoutCopy.free,
    ],
  ),
  ToneScreen(
    'Preço grátis e linha de desconto do resumo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const StoreChoicePrice(StoreCheckoutCopy.free, free: true),
          const SizedBox(height: 10),
          StoreSummaryRow(
            label: StoreCheckoutCopy.pixDiscount,
            value: StoreCheckoutCopy.discount(950),
            win: true,
          ),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    [StoreCheckoutCopy.free, StoreCheckoutCopy.discount(950)],
  ),
  ToneScreen(
    'Favoritos: faixa do maior desconto',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const StoreFavoritesPage(),
      overrides: _showcaseOverrides(_FavoritesRepository()),
    ),
    find.byKey(const ValueKey('store-favorites-highlight')),
    [Icons.sell_outlined],
  ),
  ToneScreen(
    'Vitrine em cache: sem conexão',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        StorePage(clock: () => DateTime.utc(2026, 10, 16, 15)),
        overrides: _showcaseOverrides(_OfflineRepository()),
      );
      await tester.pump(const Duration(seconds: 1));
    },
    find
        .ancestor(of: find.text(StoreCopy.offline), matching: find.byType(Row))
        .first,
    [Icons.cloud_off_rounded],
  ),
  ToneScreen(
    'Personalizar: aba preenchida',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      StoreCustomizeTabs(
        tabs: const [
          StoreCustomizeTab.name,
          StoreCustomizeTab.image,
          StoreCustomizeTab.variant,
        ],
        current: StoreCustomizeTab.name,
        done: const {StoreCustomizeTab.image},
        onTap: (_) {},
      ),
    ),
    tonePiece,
    [Icons.check_rounded],
  ),
  ToneScreen(
    'Personalizar: imagem vetorial',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _imagePanel(
        const StoreImageDraft(
          fileName: 'logo.svg',
          status: StoreImageDraftStatus.ready,
          format: 'svg',
        ),
      ),
    ),
    tonePiece,
    [Icons.check_rounded, StoreCopy.customizeVector],
  ),
  ToneScreen(
    'Personalizar: imagem pode borrar',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      _imagePanel(
        const StoreImageDraft(
          fileName: 'foto.png',
          status: StoreImageDraftStatus.ready,
          format: 'png',
          widthPx: 300,
          heightPx: 300,
        ),
      ),
    ),
    tonePiece,
    [
      Icons.warning_amber_rounded,
      StoreCopy.customizeQualityWarn(_area.name),
    ],
  ),
  ToneScreen(
    'Pílula do pedido: aguardando e entregue',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StoreOrderPill(status: StoreOrderStatus.pag),
          SizedBox(height: 8),
          StoreOrderPill(status: StoreOrderStatus.ent),
        ],
      ),
      onCard: true,
    ),
    tonePiece,
    [StoreOrderStatus.pag.label, StoreOrderStatus.ent.label, 'marca'],
  ),
  // "Como receber" (folha do produto): o "Grátis" verde fica fora. A opção
  // pinta 4,3% de tinta sobre a folha e, no claro, o tom do tema dá 4,27:1
  // ali (o cru dava 1,45:1) — falta um verde mais escuro no core.
  ToneScreen(
    'Avaliação do produto: compra verificada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      StoreReviewCard(
        review: StorePublicReview(
          id: 'r1',
          rating: 5,
          createdAt: DateTime.utc(2026, 10, 10, 15),
          comment: 'Veste muito bem.',
          variantLabel: 'Branco · M',
          authorName: 'Rafaela M.',
          authorInitials: 'RM',
        ),
        now: DateTime.utc(2026, 10, 20, 12),
      ),
    ),
    tonePiece,
    [Icons.verified_user_outlined, StoreReviewCopy.verified],
  ),
  ToneScreen(
    'Avaliar compra: obrigado',
    (tester, theme) async {
      final h = CheckoutHarness(products: const [kBola]);
      await pumpTonePage(
        tester,
        theme,
        StoreOrderReviewPage(orderId: 'ord_r', clock: () => kTestNow),
        overrides: _storeOverrides(h),
      );
      h.checkout.order('ord_r').add(_deliveredOrder());
      await _frames(tester, 6);
      await tester.tap(find.byKey(const ValueKey('store-review-star-4')));
      await _frames(tester, 6);
      await tester.tap(find.byKey(const ValueKey('store-review-publish')));
      await _frames(tester, 6);
    },
    find.byKey(const ValueKey('store-review-thanks')),
    [Icons.check_rounded],
  ),
];

void main() => stateToneScreensTests(extrasToneScreens);
