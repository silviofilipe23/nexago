import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/booking_story.dart';
import '../domain/booking_story_providers.dart';
import 'widgets/booking_story/booking_story_card.dart';
import 'widgets/booking_story/booking_story_editor.dart';

/// Abre o editor do story por cima de tudo (fora do shell com a barra).
/// Chamado da confirmação, da agenda e do card "Próxima reserva" da home.
Future<void> openBookingStory(BuildContext context, BookingStoryArgs args) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(builder: (_) => BookingStoryPage(args: args)),
  );
}

/// Reservar · 11 — editor do story 9:16 de uma reserva garantida: o atleta
/// escolhe o fundo (foto da galeria ou um tema) e o que aparece na arte, e
/// compartilha o PNG 1080×1920 pela folha nativa (Instagram → Story).
class BookingStoryPage extends ConsumerStatefulWidget {
  const BookingStoryPage({super.key, required this.args});

  final BookingStoryArgs args;

  @override
  ConsumerState<BookingStoryPage> createState() => _BookingStoryPageState();
}

class _BookingStoryPageState extends ConsumerState<BookingStoryPage>
    with BookingStoryEditorMixin {
  /// Guarda o que foi DESLIGADO: informação que chega depois (o esporte vem do
  /// doc da reserva) nasce ligada.
  final Set<BookingStoryInfo> _hidden = {};

  void _toggleInfo(BookingStoryInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  @override
  Widget build(BuildContext context) {
    final args = widget.args;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final source = ref.watch(bookingStorySourceProvider(args.bookingId));
    final data = bookingStoryDataFrom(
      arenaName: args.arenaName,
      courtName: args.courtName,
      dateKey: args.dateKey,
      startTime: args.startTime,
      endTime: args.endTime,
      sport: source?.sport,
      crew: bookingStoryCrew(
        ownerUid: profile?.id ?? source?.ownerUid,
        ownerName:
            profile == null ? null : athleteDisplayName(profile, fallback: ''),
        ownerAvatarUrl: profile?.avatarUrl,
        confirmed: source?.confirmed ?? const [],
      ),
    );
    final available = data.availableInfos;
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };

    return BookingStoryEditorScaffold(
      title: 'Postar no story',
      cardKey: storyCardKey,
      card: BookingStoryCard(
        data: data,
        theme: storyTheme,
        infos: infos,
        photo: storyPhoto,
      ),
      theme: storyTheme,
      photo: storyPhoto,
      busy: storyBusy,
      onPickPhoto: pickStoryPhoto,
      onSelectTheme: selectStoryTheme,
      onSave: () => shareStory(fileName: 'nexago_reserva.png'),
      onPost: () => shareStory(
        caption: bookingStoryShareText(data),
        fileName: 'nexago_reserva.png',
      ),
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('booking-story-info-${info.name}'),
            label: info.label,
            selected: infos.contains(info),
            onTap: () => _toggleInfo(info),
          ),
      ],
    );
  }
}
