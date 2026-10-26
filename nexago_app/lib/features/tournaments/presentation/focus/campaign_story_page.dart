import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../arenas/presentation/widgets/booking_story/booking_story_editor.dart';
import '../../domain/focus/campaign_story.dart';
import 'widgets/campaign_story_card.dart';

/// Abre o editor do story da campanha por cima de tudo (fora do shell do
/// Focus, que tem barra própria).
Future<void> openCampaignStory(BuildContext context, CampaignStoryData data) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(builder: (_) => CampaignStoryPage(data: data)),
  );
}

/// "Postar no story" da campanha no torneio: o atleta escolhe o fundo (um
/// tema, uma foto da galeria ou tirada na hora) e o que aparece no card, e
/// compartilha o PNG 1080×1920 pela folha nativa. Mesmo editor do story da
/// reserva e do treino.
class CampaignStoryPage extends ConsumerStatefulWidget {
  const CampaignStoryPage({super.key, required this.data});

  final CampaignStoryData data;

  @override
  ConsumerState<CampaignStoryPage> createState() => _CampaignStoryPageState();
}

class _CampaignStoryPageState extends ConsumerState<CampaignStoryPage>
    with BookingStoryEditorMixin {
  final Set<CampaignStoryInfo> _hidden = {};

  void _toggleInfo(CampaignStoryInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final available = campaignStoryInfosFor(data);
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };

    return BookingStoryEditorScaffold(
      title: 'Postar no story',
      cardKey: storyCardKey,
      card: CampaignStoryCard(
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
      onSave: () => shareStory(fileName: 'nexago_campanha.png'),
      onPost: () => shareStory(
        caption: campaignStoryShareText(data),
        fileName: 'nexago_campanha.png',
      ),
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('campaign-story-info-${info.name}'),
            label: info.label,
            selected: infos.contains(info),
            onTap: () => _toggleInfo(info),
          ),
      ],
    );
  }
}
