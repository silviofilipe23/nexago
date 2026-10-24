import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_story_photo_picker.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/presentation/booking_story_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_story_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

const args = BookingStoryArgs(
  bookingId: 'b1',
  arenaName: 'Arena CFC',
  courtName: 'Quadra 1',
  dateKey: '2026-05-22',
  startTime: '09:00',
  endTime: '10:30',
);

const maria = AthleteProfile(
  id: 'u1',
  name: 'Maria Alves',
  sport: '',
  level: '',
  city: '',
);

/// PNG 1×1 transparente.
final pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

Finder rich(String text) => find.textContaining(text, findRichText: true);

Future<void> abrirStory(
  WidgetTester tester, {
  BookingStorySource? source,
  BookingStoryPhotoPicker? picker,
}) async {
  tester.view.physicalSize = const Size(400, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(maria)),
        bookingStorySourceProvider('b1').overrideWith((ref) => source),
        if (picker != null)
          bookingStoryPhotoPickerProvider.overrideWithValue(picker),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const BookingStoryPage(args: args),
      ),
    ),
  );
  await tester.pump();
}

Future<void> escolherOrigem(
  WidgetTester tester,
  BookingStoryPhotoSource source,
) async {
  await tester.tap(
    find.byKey(ValueKey('booking-story-photo-source-${source.name}')),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('arte com hora, data, arena, galera e modalidade da reserva', (
    tester,
  ) async {
    await abrirStory(
      tester,
      source: const BookingStorySource(
        sport: 'beachVolleyball',
        ownerUid: 'u1',
        confirmed: [
          MyBookingConfirmedAthlete(userId: 'u2', displayName: 'Enzo Lima'),
        ],
      ),
    );

    expect(find.text('Bora\njogar.'), findsOneWidget);
    expect(find.text('09:00–10:30'), findsOneWidget);
    expect(find.text('SEX · 22 MAI'), findsOneWidget);
    expect(find.text('VÔLEI DE PRAIA'), findsOneWidget);
    expect(rich('Arena CFC · Quadra 1'), findsOneWidget);
    expect(rich('Maria e Enzo'), findsOneWidget);
    expect(rich('2 na quadra'), findsOneWidget);
    expect(find.byKey(const Key('booking-story-info-sport')), findsOneWidget);
  });

  testWidgets('chip desligado tira a informação da arte; religar volta', (
    tester,
  ) async {
    await abrirStory(tester);

    expect(rich('Arena CFC'), findsOneWidget);
    await tester.tap(find.byKey(const Key('booking-story-info-arena')));
    await tester.pump();
    expect(rich('Arena CFC'), findsNothing);

    await tester.tap(find.byKey(const Key('booking-story-info-time')));
    await tester.pump();
    expect(find.text('09:00–10:30'), findsNothing);

    await tester.tap(find.byKey(const Key('booking-story-info-arena')));
    await tester.pump();
    expect(rich('Arena CFC'), findsOneWidget);
  });

  testWidgets('reserva sem esporte gravado: sem chip nem linha de modalidade', (
    tester,
  ) async {
    await abrirStory(tester);

    expect(find.byKey(const Key('booking-story-info-sport')), findsNothing);
    expect(find.text('Modalidade'), findsNothing);
    // Só quem reservou: a galera vira convite.
    expect(rich('Quem vem jogar?'), findsOneWidget);
  });

  testWidgets('"Foto" sem foto abre a galeria e passa a usar a escolhida', (
    tester,
  ) async {
    var calls = 0;
    final sources = <BookingStoryPhotoSource>[];
    await abrirStory(
      tester,
      picker: (source) async {
        calls++;
        sources.add(source);
        return pixel;
      },
    );

    BookingStoryCard card() =>
        tester.widget<BookingStoryCard>(find.byType(BookingStoryCard));
    expect(card().theme.name, 'ember');
    expect(find.text('Adicionar foto'), findsOneWidget);

    await tester.tap(find.byKey(const Key('booking-story-theme-photo')));
    await tester.pumpAndSettle();
    await escolherOrigem(tester, BookingStoryPhotoSource.gallery);

    expect(calls, 1);
    expect(sources, [BookingStoryPhotoSource.gallery]);
    expect(card().theme.name, 'photo');
    expect(card().photo, pixel);
    expect(find.text('Trocar foto'), findsOneWidget);

    // Com a foto já escolhida, trocar de tema não reabre a galeria.
    await tester.tap(find.byKey(const Key('booking-story-theme-sand')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('booking-story-theme-photo')));
    await tester.pump();
    expect(calls, 1);
    expect(card().theme.name, 'photo');
  });

  testWidgets('"Tirar foto agora" abre a câmera e usa a foto tirada', (
    tester,
  ) async {
    final sources = <BookingStoryPhotoSource>[];
    await abrirStory(
      tester,
      picker: (source) async {
        sources.add(source);
        return pixel;
      },
    );

    await tester.tap(find.text('Adicionar foto'));
    await tester.pumpAndSettle();
    expect(find.text('Tirar foto agora'), findsOneWidget);
    expect(find.text('Escolher da galeria'), findsOneWidget);
    await escolherOrigem(tester, BookingStoryPhotoSource.camera);

    final card = tester.widget<BookingStoryCard>(find.byType(BookingStoryCard));
    expect(sources, [BookingStoryPhotoSource.camera]);
    expect(card.theme.name, 'photo');
    expect(card.photo, pixel);
  });

  testWidgets('galeria cancelada: continua no tema de antes', (tester) async {
    await abrirStory(tester, picker: (_) async => null);

    await tester.tap(find.byKey(const Key('booking-story-theme-photo')));
    await tester.pumpAndSettle();
    await escolherOrigem(tester, BookingStoryPhotoSource.gallery);

    final card = tester.widget<BookingStoryCard>(find.byType(BookingStoryCard));
    expect(card.theme.name, 'ember');
  });

  testWidgets('folha fechada sem escolher: nem abre o picker', (tester) async {
    var calls = 0;
    await abrirStory(
      tester,
      picker: (_) async {
        calls++;
        return pixel;
      },
    );

    await tester.tap(find.byKey(const Key('booking-story-theme-photo')));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(200, 40));
    await tester.pumpAndSettle();

    expect(calls, 0);
    final card = tester.widget<BookingStoryCard>(find.byType(BookingStoryCard));
    expect(card.theme.name, 'ember');
  });

  testWidgets('a captura sai em 1080×1920, mesmo com a prévia reduzida', (
    tester,
  ) async {
    await abrirStory(tester);

    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find
          .ancestor(
            of: find.byType(BookingStoryCard),
            matching: find.byType(RepaintBoundary),
          )
          .first,
    );
    final size = await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: 3);
      final out = Size(image.width.toDouble(), image.height.toDouble());
      image.dispose();
      return out;
    });

    expect(size, const Size(1080, 1920));
    // E a prévia na tela é 0,6× disso.
    expect(
      tester.getSize(find.byType(FittedBox).first),
      const Size(216, 384),
    );
  });
}
