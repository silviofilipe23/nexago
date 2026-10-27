import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/presentation/widgets/booking_story/booking_story_editor.dart';
import '../domain/ranking_story.dart';
import 'widgets/ranking_story_card.dart';

/// Abre o editor do story do ranking por cima do shell (o editor tem a barra
/// Salvar / Postar própria).
Future<void> openRankingStory(BuildContext context, RankingStoryData data) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(builder: (_) => RankingStoryPage(data: data)),
  );
}

/// "Compartilhar minha posição" no ranking: o atleta escolhe o fundo (um
/// tema, uma foto da galeria ou tirada na hora) e o que aparece no card, e
/// compartilha o PNG 1080×1920 pela folha nativa. Mesmo editor do story da
/// reserva, do treino e da campanha.
class RankingStoryPage extends ConsumerStatefulWidget {
  const RankingStoryPage({super.key, required this.data});

  final RankingStoryData data;

  @override
  ConsumerState<RankingStoryPage> createState() => _RankingStoryPageState();
}

class _RankingStoryPageState extends ConsumerState<RankingStoryPage>
    with BookingStoryEditorMixin {
  late final Set<RankingStoryInfo> _hidden =
      rankingStoryInfosOffByDefault(widget.data);

  void _toggleInfo(RankingStoryInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final available = rankingStoryInfosFor(data);
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };

    return BookingStoryEditorScaffold(
      title: 'Postar no story',
      cardKey: storyCardKey,
      card: RankingStoryCard(
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
      onSave: () => shareStory(fileName: 'nexago_ranking.png'),
      onPost: () => shareStory(
        caption: rankingStoryShareText(
          data,
          showMovement: infos.contains(RankingStoryInfo.movement),
        ),
        fileName: 'nexago_ranking.png',
      ),
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('ranking-story-info-${info.name}'),
            label: data.infoLabel(info),
            selected: infos.contains(info),
            onTap: () => _toggleInfo(info),
          ),
      ],
    );
  }
}
