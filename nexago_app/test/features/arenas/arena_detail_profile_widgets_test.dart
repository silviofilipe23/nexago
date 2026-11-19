import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_hours_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_offers_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_events_providers.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_events_section.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_hours.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_event_mapper.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_event.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_anchor_bar.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_bottom_cta.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_other_offers.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_hero.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_info_sections.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_metrics_bar.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_promotions.dart';

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  ThemeData? theme,
  List<Override> overrides = const [],
}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme ?? AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: child,
          ),
        ),
      ),
    ),
  );
}

ArenaPromotion _promo({String label = 'Tarde em dobro', DateTime? until}) {
  return ArenaPromotion(
    id: label,
    active: true,
    label: label,
    courtIds: const [],
    weekdays: const [2, 3, 4],
    startTime: '14:00',
    endTime: '17:00',
    discountPercent: 20,
    validUntil: until,
  );
}

void main() {
  group('ArenaDetailMetricsBar', () {
    testWidgets('shows rating, entry price and courts', (tester) async {
      await _pump(
        tester,
        const ArenaDetailMetricsBar(
          rating: 4.8,
          reviewsCount: 126,
          entryPricePerHour: 90,
          totalCourts: 6,
          freeCourtsToday: 4,
        ),
      );

      expect(find.text('4,8'), findsOneWidget);
      expect(find.text('126 avaliações'), findsOneWidget);
      expect(find.textContaining('90'), findsOneWidget);
      expect(find.text('A partir de /h'), findsOneWidget);
      expect(find.text('Quadras · 4 com vaga hoje'), findsOneWidget);
      expect(find.textContaining('Score'), findsNothing);
    });

    testWidgets('a new arena reads "Nova" instead of empty numbers',
        (tester) async {
      await _pump(
        tester,
        const ArenaDetailMetricsBar(
          rating: 0,
          reviewsCount: 0,
          entryPricePerHour: null,
          totalCourts: 2,
          freeCourtsToday: 0,
        ),
      );

      expect(find.text('Nova'), findsOneWidget);
      expect(find.text('Sem avaliações'), findsOneWidget);
      expect(find.text('—'), findsOneWidget);
      expect(find.text('Quadras'), findsOneWidget);
    });

    testWidgets('follows the light theme instead of a fixed dark card',
        (tester) async {
      await _pump(
        tester,
        const ArenaDetailMetricsBar(
          rating: 4,
          reviewsCount: 3,
          entryPricePerHour: 80,
          totalCourts: 1,
          freeCourtsToday: 1,
        ),
        theme: AppTheme.light,
      );

      final box = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(ArenaDetailMetricsBar),
              matching: find.byType(Container),
            )
            .first,
      );
      final color = (box.decoration! as BoxDecoration).color;
      expect(color, isNot(AppColors.surfaceCard));
      expect(color, AppTheme.light.colorScheme.surface);
    });
  });

  group('ArenaDetailBottomCta', () {
    testWidgets('carries the entry price and today availability',
        (tester) async {
      var taps = 0;
      await _pump(
        tester,
        ArenaDetailBottomCta(
          onPressed: () => taps++,
          entryPricePerHour: 90,
          freeSlotsToday: 4,
        ),
      );

      expect(find.text('4 horários livres hoje'), findsOneWidget);
      expect(find.textContaining('/h', findRichText: true), findsOneWidget);
      await tester.tap(find.text('Ver horários'));
      expect(taps, 1);
    });

    testWidgets('a full day points to other days', (tester) async {
      await _pump(
        tester,
        ArenaDetailBottomCta(
          onPressed: () {},
          entryPricePerHour: 90,
          freeSlotsToday: 0,
        ),
      );

      expect(find.text('Hoje lotado · veja outros dias'), findsOneWidget);
    });

    testWidgets('without a price only the button shows', (tester) async {
      await _pump(tester, ArenaDetailBottomCta(onPressed: () {}));

      expect(find.text('Ver horários'), findsOneWidget);
      expect(
          find.textContaining('a partir de', findRichText: true), findsNothing);
    });
  });

  group('ArenaDetailLocationSection', () {
    testWidgets('renders nothing without address nor contact', (tester) async {
      await _pump(tester, const ArenaDetailLocationSection(address: null));

      expect(find.text('Localização e contato'), findsNothing);
    });

    testWidgets('shows the address and opens directions and WhatsApp',
        (tester) async {
      var directions = 0;
      var whatsapp = 0;
      await _pump(
        tester,
        ArenaDetailLocationSection(
          address: 'Rua 10, 200 · Goiânia, GO',
          onDirections: () => directions++,
          onWhatsApp: () => whatsapp++,
        ),
      );

      expect(find.text('Rua 10, 200 · Goiânia, GO'), findsOneWidget);
      await tester.tap(find.text('Como chegar'));
      await tester.tap(find.text('WhatsApp'));
      expect(directions, 1);
      expect(whatsapp, 1);
    });

    testWidgets('hides WhatsApp when the arena has no number', (tester) async {
      await _pump(
        tester,
        ArenaDetailLocationSection(address: 'Goiânia, GO', onDirections: () {}),
      );

      expect(find.text('Como chegar'), findsOneWidget);
      expect(find.text('WhatsApp'), findsNothing);
    });
  });

  group('ArenaDetailRulesSection', () {
    testWidgets('lists each rule', (tester) async {
      await _pump(
        tester,
        const ArenaDetailRulesSection(
          rules: [
            ArenaDetailRule(
              icon: Icons.event_busy_outlined,
              title: 'Cancelamento grátis até 6h antes',
              subtitle: 'O valor volta inteiro.',
            ),
            ArenaDetailRule(
              icon: Icons.payments_outlined,
              title: 'Formas de pagamento',
              subtitle: 'Pix ou cartão pelo app',
            ),
          ],
        ),
      );

      expect(find.text('Antes de reservar'), findsOneWidget);
      expect(find.text('Cancelamento grátis até 6h antes'), findsOneWidget);
      expect(find.text('Pix ou cartão pelo app'), findsOneWidget);
    });

    testWidgets('renders nothing without rules', (tester) async {
      await _pump(tester, const ArenaDetailRulesSection(rules: []));

      expect(find.text('Antes de reservar'), findsNothing);
    });
  });

  group('ArenaDetailAboutSection', () {
    testWidgets('short text has no "Ler mais"', (tester) async {
      await _pump(
        tester,
        const ArenaDetailAboutSection(description: 'Seis quadras de areia.'),
      );

      expect(find.text('Sobre'), findsOneWidget);
      expect(find.text('Ler mais'), findsNothing);
    });

    testWidgets('long text collapses and expands', (tester) async {
      final long = List.filled(40, 'Quadras de areia tratada.').join(' ');
      await _pump(tester, ArenaDetailAboutSection(description: long));

      expect(find.text('Ler mais'), findsOneWidget);
      await tester.tap(find.text('Ler mais'));
      await tester.pumpAndSettle();
      expect(find.text('Ler menos'), findsOneWidget);
    });
  });

  group('ArenaDetailPromotions', () {
    testWidgets('shows active promotions and opens the slots', (tester) async {
      var opened = 0;
      await _pump(
        tester,
        ArenaDetailPromotions(
          arenaId: 'a1',
          onOpenSlots: () => opened++,
          now: DateTime(2026, 11, 19),
        ),
        overrides: [
          arenaPromotionsProvider('a1').overrideWith(
            (ref) => Stream.value([
              _promo(),
              _promo(label: 'Vencida', until: DateTime(2026, 11, 1)),
            ]),
          ),
        ],
      );
      await tester.pump();

      expect(find.text('PROMOÇÃO'), findsOneWidget);
      expect(find.text('Tarde em dobro'), findsOneWidget);
      expect(find.text('Ter–Qui · 14:00–17:00 · 20% off'), findsOneWidget);
      expect(find.text('Vencida'), findsNothing);

      await tester.tap(find.text('Tarde em dobro'));
      expect(opened, 1);
    });

    testWidgets('renders nothing without promotions', (tester) async {
      await _pump(
        tester,
        ArenaDetailPromotions(arenaId: 'a1', onOpenSlots: () {}),
        overrides: [
          arenaPromotionsProvider('a1')
              .overrideWith((ref) => Stream.value(const <ArenaPromotion>[])),
        ],
      );
      await tester.pump();

      expect(find.text('PROMOÇÃO'), findsNothing);
    });
  });

  group('ArenaDetailHero', () {
    testWidgets('offers back, share and favorite without photos',
        (tester) async {
      var shared = 0;
      await _pump(
        tester,
        ArenaDetailHero(
          arenaId: 'a1',
          photos: const [],
          onBack: () {},
          onShare: () => shared++,
          isFavorite: false,
          isFavoritePending: false,
          onToggleFavorite: () {},
        ),
      );

      expect(find.byTooltip('Voltar'), findsOneWidget);
      expect(find.byTooltip('Favoritar arena'), findsOneWidget);
      await tester.tap(find.byTooltip('Compartilhar arena'));
      expect(shared, 1);
      expect(find.textContaining(' / '), findsNothing);
    });
  });

  group('ArenaDetailBottomCta with a picked time', () {
    testWidgets('shows the pick and reserves it', (tester) async {
      var reserved = 0;
      var opened = 0;
      await _pump(
        tester,
        ArenaDetailBottomCta(
          onPressed: () => opened++,
          entryPricePerHour: 90,
          selection: ArenaDetailBookingSelection(
            title: 'sex, 8 nov · 19:00–20:00',
            subtitle: 'Quadra 2 · 1h · R\$ 90',
            onReserve: () => reserved++,
          ),
        ),
      );

      expect(find.text('sex, 8 nov · 19:00–20:00'), findsOneWidget);
      expect(find.text('Ver horários'), findsNothing);
      await tester.tap(find.text('Reservar'));
      expect(reserved, 1);
      expect(opened, 0);
    });
  });

  group('ArenaDetailOtherOffers', () {
    testWidgets('lists each offer and reports the tapped kind', (tester) async {
      ArenaOfferKind? tapped;
      await _pump(
        tester,
        ArenaDetailOtherOffers(arenaId: 'a1', onTap: (k) => tapped = k),
        overrides: [
          arenaDetailOtherOffersProvider('a1').overrideWithValue(const [
            ArenaOfferSummary(
              kind: ArenaOfferKind.schedulePlan,
              kicker: 'HORÁRIO FIXO',
              title: 'Plano mensal',
              subtitle: 'a partir de R\$ 320/mês',
            ),
            ArenaOfferSummary(
              kind: ArenaOfferKind.club,
              kicker: 'CLUBINHO',
              title: 'qui, 14 · 19:00',
              subtitle: '3 vagas · R\$ 25',
            ),
          ]),
        ],
      );

      expect(find.text('Outras formas de jogar'), findsOneWidget);
      expect(find.text('Plano mensal'), findsOneWidget);
      await tester.tap(find.text('qui, 14 · 19:00'));
      expect(tapped, ArenaOfferKind.club);
    });

    testWidgets('renders nothing without offers', (tester) async {
      await _pump(
        tester,
        ArenaDetailOtherOffers(arenaId: 'a1', onTap: (_) {}),
        overrides: [
          arenaDetailOtherOffersProvider('a1').overrideWithValue(const []),
        ],
      );

      expect(find.text('Outras formas de jogar'), findsNothing);
    });
  });

  group('ArenaDetailAnchorBar', () {
    testWidgets('each shortcut calls its section', (tester) async {
      final calls = <String>[];
      await _pump(
        tester,
        ArenaDetailAnchorBar(
          anchors: [
            ArenaDetailAnchor(label: 'Horários', onTap: () => calls.add('h')),
            ArenaDetailAnchor(label: 'Quadras', onTap: () => calls.add('q')),
          ],
        ),
      );

      await tester.tap(find.text('Quadras'));
      await tester.tap(find.text('Horários'));
      expect(calls, ['q', 'h']);
    });
  });

  group('ArenaDetailOpenStatusLine', () {
    testWidgets('shows the open label', (tester) async {
      await _pump(
        tester,
        const ArenaDetailOpenStatusLine(
          status: ArenaOpenStatus(
            isOpen: true,
            label: 'Aberta agora · até 23:00',
          ),
        ),
      );

      expect(find.text('Aberta agora · até 23:00'), findsOneWidget);
    });
  });

  group('ArenaDetailWeekHours', () {
    testWidgets('lists each row of the week', (tester) async {
      await _pump(
        tester,
        const ArenaDetailWeekHours(
          rows: [
            ArenaWeekHoursRow(
              daysLabel: 'Seg–Sex',
              hoursLabel: '07:00–23:00',
            ),
            ArenaWeekHoursRow(daysLabel: 'Dom', hoursLabel: 'Fechado'),
          ],
        ),
      );

      expect(find.text('HORÁRIOS DE RESERVA'), findsOneWidget);
      expect(find.text('Seg–Sex'), findsOneWidget);
      expect(find.text('07:00–23:00'), findsOneWidget);
      expect(find.text('Fechado'), findsOneWidget);
    });

    testWidgets('renders nothing without rows', (tester) async {
      await _pump(tester, const ArenaDetailWeekHours(rows: []));

      expect(find.text('HORÁRIOS DE RESERVA'), findsNothing);
    });
  });

  group('ArenaDetailEventsSection', () {
    setUpAll(() => initializeDateFormatting('pt_BR'));
    final now = DateTime(2030, 11, 8, 10);

    OrganizerEvent event(String id, String name, int inDays,
        {String listing = 'open'}) {
      return organizerEventFromMap(id, {
        'name': name,
        'listingStatus': listing,
        'sport': 'beachVolleyball',
        'arenaId': 'a1',
        'startAt': Timestamp.fromDate(now.add(Duration(days: inDays))),
        'categories': [
          {'id': 'c1', 'categoryName': 'Misto', 'maxTeams': 16},
        ],
      })!;
    }

    List<Override> overrides(List<OrganizerEvent> events) => [
          arenaEventsProvider('a1').overrideWith(
            (ref) => Stream.value(events),
          ),
          tournamentCategoryEnrollmentCountsProvider.overrideWith(
            (ref, id) => Stream.value(const {'c1': 4}),
          ),
        ];

    testWidgets('lists upcoming events soonest first and opens one',
        (tester) async {
      OrganizerEvent? opened;
      await _pump(
        tester,
        ArenaDetailEventsSection(
          arenaId: 'a1',
          now: now,
          onOpen: (e) => opened = e,
        ),
        overrides: overrides([
          event('later', 'Copa de Verão', 30),
          event('soon', 'Etapa 1 da Liga', 5),
          event('old', 'Torneio passado', -60, listing: 'completed'),
        ]),
      );
      await tester.pump();

      expect(find.text('Torneios e ligas aqui'), findsOneWidget);
      expect(find.text('Torneio passado'), findsNothing);
      final soonY = tester.getTopLeft(find.text('Etapa 1 da Liga')).dy;
      final laterY = tester.getTopLeft(find.text('Copa de Verão')).dy;
      expect(soonY, lessThan(laterY));

      await tester.tap(find.text('Etapa 1 da Liga'));
      expect(opened?.id, 'soon');
    });

    testWidgets('shows three and counts the rest', (tester) async {
      await _pump(
        tester,
        ArenaDetailEventsSection(arenaId: 'a1', now: now, onOpen: (_) {}),
        overrides: overrides([
          for (var i = 1; i <= 5; i++) event('e$i', 'Evento $i', i * 7),
        ]),
      );
      await tester.pump();

      expect(find.text('Evento 3'), findsOneWidget);
      expect(find.text('Evento 4'), findsNothing);
      expect(find.text('E mais 2 eventos.'), findsOneWidget);
    });

    testWidgets('renders nothing without upcoming events', (tester) async {
      await _pump(
        tester,
        ArenaDetailEventsSection(arenaId: 'a1', now: now, onOpen: (_) {}),
        overrides: overrides(const []),
      );
      await tester.pump();

      expect(find.text('Torneios e ligas aqui'), findsNothing);
    });
  });
}
