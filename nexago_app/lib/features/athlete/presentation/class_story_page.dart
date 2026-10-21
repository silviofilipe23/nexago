import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/presentation/widgets/booking_story/booking_story_editor.dart';
import '../domain/agenda/athlete_agenda_providers.dart';
import '../domain/agenda/class_agenda_entry.dart';
import '../domain/agenda/class_story.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile_providers.dart';
import 'widgets/agenda/class_story_card.dart';

/// Abre o editor do story do treino por cima de tudo (fora do shell com a
/// barra) — do card da aula na agenda e do detalhe do treino.
Future<void> openClassStory(BuildContext context, ClassAgendaEntry session) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(builder: (_) => ClassStoryPage(session: session)),
  );
}

/// Números do treino: o histórico longo quando chega, a agenda enquanto isso.
ClassStoryStats watchClassStoryStats(WidgetRef ref, ClassAgendaEntry session) {
  final history =
      ref.watch(classStoryHistoryProvider(session.date)).valueOrNull ??
          ref.watch(myClassAgendaProvider).valueOrNull ??
          const <ClassAgendaEntry>[];
  return classStoryStats(session, history);
}

/// Agenda · F3 — "Postar no story" de uma aula concluída: o atleta escolhe o
/// fundo (foto da galeria ou um tema) e o que aparece no card, e compartilha
/// o PNG 1080×1920 pela folha nativa. Mesmo editor do story da reserva.
class ClassStoryPage extends ConsumerStatefulWidget {
  const ClassStoryPage({super.key, required this.session});

  final ClassAgendaEntry session;

  @override
  ConsumerState<ClassStoryPage> createState() => _ClassStoryPageState();
}

class _ClassStoryPageState extends ConsumerState<ClassStoryPage>
    with BookingStoryEditorMixin {
  final Set<ClassStoryInfo> _hidden = {};

  void _toggleInfo(ClassStoryInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final data = classStoryDataFrom(
      session: session,
      stats: watchClassStoryStats(ref, session),
      athleteName:
          profile == null ? '' : athleteDisplayName(profile, fallback: ''),
      athleteNickname: profile?.nickname,
      athleteAvatarUrl: profile?.avatarUrl,
    );
    final available = [
      for (final info in ClassStoryInfo.values)
        if (info != ClassStoryInfo.people || data.people.isNotEmpty) info,
    ];
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };

    return BookingStoryEditorScaffold(
      title: 'Postar no story',
      cardKey: storyCardKey,
      card: ClassStoryCard(
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
      onSave: () => shareStory(fileName: 'nexago_treino.png'),
      onPost: () => shareStory(
        caption: classStoryShareText(session),
        fileName: 'nexago_treino.png',
      ),
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('class-story-info-${info.name}'),
            label: info.label,
            selected: infos.contains(info),
            onTap: () => _toggleInfo(info),
          ),
      ],
    );
  }
}
