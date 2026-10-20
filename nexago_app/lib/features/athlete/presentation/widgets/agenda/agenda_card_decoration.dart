import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

/// Raio dos cards da timeline (protótipo desafio ~24).
const agendaTimelineCardRadius = 20.0;

/// Degradê no tom do tipo (accent), canto superior direito → inferior esquerdo.
///
/// No tema claro o degradê é claro: o texto dos cards segue `themeColors`
/// (escuro no claro), então o fundo acompanha o tema.
BoxDecoration agendaTimelineCardDecoration({
  required AthleteAgendaItemKind kind,
  required Color accent,
  required bool isDark,
  bool highlighted = false,
  bool isCanceled = false,
  bool isLive = false,
}) {
  final typeAccent = _resolveTypeAccent(
    kind: kind,
    isCanceled: isCanceled,
    isLive: isLive,
  );
  final (topRight, bottomLeft, borderBase) = isDark
      ? _darkAccentGradient(typeAccent)
      : _lightAccentGradient(typeAccent);

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

/// Tom do tipo para texto, selos e botões sobre o card.
///
/// Os acentos são pastéis pensados pro fundo escuro; no tema claro escurecem
/// (mesmo matiz) para manter contraste ≥ 4,5:1 sobre o degradê claro.
Color agendaCardAccent(Color accent, {required bool isDark}) {
  if (isDark) return accent;
  final hsl = HSLColor.fromColor(accent);
  return hsl.withLightness(hsl.lightness * 0.42).toColor();
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
    AthleteAgendaItemKind.clubSession => athleteAgendaClubSessionAccent,
    AthleteAgendaItemKind.classSession => athleteAgendaClassSessionAccent,
  };
}

(Color topRight, Color bottomLeft, Color border) _darkAccentGradient(
  Color accent,
) {
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

(Color topRight, Color bottomLeft, Color border) _lightAccentGradient(
  Color accent,
) {
  const lightBase = AppColors.white;
  final topRight = Color.alphaBlend(accent.withValues(alpha: 0.12), lightBase);
  final bottomLeft = Color.alphaBlend(
    accent.withValues(alpha: 0.03),
    lightBase,
  );
  final border = Color.alphaBlend(accent.withValues(alpha: 0.5), lightBase);
  return (topRight, bottomLeft, border);
}
