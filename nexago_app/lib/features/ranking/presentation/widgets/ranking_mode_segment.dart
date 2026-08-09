import 'package:flutter/material.dart';

import '../../../../core/ui/nexa_segmented_control.dart';
import '../../domain/ranking_list_models.dart';

/// Alterna entre ranking de equipes e de atletas.
///
/// Delega a apresentação para [NexaSegmentedControl] — mantém esta API
/// própria (mode/onChanged) porque é assim que a tela de ranking a chama.
class RankingModeSegment extends StatelessWidget {
  const RankingModeSegment({
    super.key,
    required this.mode,
    required this.onChanged,
  });

  final RankingListMode mode;
  final ValueChanged<RankingListMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return NexaSegmentedControl<RankingListMode>(
      segments: const [
        NexaSegment(value: RankingListMode.teams, label: 'Equipes'),
        NexaSegment(value: RankingListMode.athletes, label: 'Atletas'),
      ],
      selected: mode,
      onChanged: onChanged,
    );
  }
}
