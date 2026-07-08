import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

/// Raio dos cards da timeline (protótipo desafio ~24).
const agendaTimelineCardRadius = 20.0;

/// Degradê no tom do tipo (accent), canto superior direito → inferior esquerdo.
BoxDecoration agendaTimelineCardDecoration({
  required AthleteAgendaItemKind kind,
  required Color accent,
  bool highlighted = false,
  bool isCanceled = false,
  bool isLive = false,
}) {
  final typeAccent = _resolveTypeAccent(
    kind: kind,
    isCanceled: isCanceled,
    isLive: isLive,
  );
  final (topRight, bottomLeft, borderBase) = _accentGradient(typeAccent);

  final borderColor = highlighted
      ? accent.withValues(alpha: 0.55)
      : isCanceled
          ? AppColors.live.withValues(alpha: 0.4)
          : borderBase;

  return BoxDecoration(
    borderRadius: BorderRadius.circular(agendaTimelineCardRadius),
    gradient: LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: [topRight, bottomLeft],
    ),
    border: Border.all(
      color: borderColor,
      width: highlighted || isLive ? 1.5 : 1,
    ),
  );
}

/// Cor base do degradê sempre alinhada ao tipo (não ao estado muted).
Color _resolveTypeAccent({
  required AthleteAgendaItemKind kind,
  required bool isCanceled,
  required bool isLive,
}) {
  if (isCanceled || isLive) return AppColors.live;
  return switch (kind) {
    AthleteAgendaItemKind.rental => athleteAgendaRentalAccent,
    AthleteAgendaItemKind.tournament => athleteAgendaTournamentAccent,
    AthleteAgendaItemKind.challenge => athleteAgendaChallengeAccent,
    AthleteAgendaItemKind.friendlyMatch => athleteAgendaFriendlyMatchAccent,
  };
}

(Color topRight, Color bottomLeft, Color border) _accentGradient(Color accent) {
  const darkBase = Color(0xFF050508);
  final topRight = Color.alphaBlend(
    accent.withValues(alpha: 0.34),
    Color.alphaBlend(accent.withValues(alpha: 0.10), const Color(0xFF0E0E12)),
  );
  final bottomLeft = Color.alphaBlend(
    accent.withValues(alpha: 0.14),
    darkBase,
  );
  final border = Color.alphaBlend(
    accent.withValues(alpha: 0.45),
    const Color(0xFF141418),
  );
  return (topRight, bottomLeft, border);
}
