import 'package:flutter/material.dart';

import '../../../../core/layout/nexa_page_header.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_skeleton.dart';
import 'arena_bookings_day_strip.dart';
import 'arena_bookings_header.dart';
import 'arena_bookings_shortcuts.dart';
import 'arena_dashboard_tokens.dart';
import 'arena_new_booking_button.dart';

/// Lado dos botões redondos do header (busca e filtro).
const double _headerButton = 44;

/// Área de toque desses botões (Material, 48): é ela que dá a altura e o
/// espaçamento reais do header.
const double _headerTapTarget = 48;

/// Largura da pílula "Nova reserva" no header.
const double _newBookingPillWidth = 139;

/// Largura do trilho da linha do dia (ponto + linha vertical), a mesma de
/// `ArenaBookingsDayTimelineSliver`.
const double _railColumn = 18;

/// Altura de um card de reserva típico (horário, nome, selos e ações).
const double _cardHeight = 196;

/// Quantos cards o esqueleto da linha do dia mostra.
const int _skeletonRows = 3;

/// Aba Reservas inteira enquanto o acesso à arena carrega: o título real,
/// os botões do header, os atalhos e a faixa de 7 dias nos mesmos lugares e
/// tamanhos da tela pronta, e a linha do dia no esqueleto. Quando a arena
/// chega, o conteúdo real entra por cima sem a tela pular.
class ArenaBookingsPageSkeleton extends StatelessWidget {
  const ArenaBookingsPageSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final compact =
        MediaQuery.sizeOf(context).width < arenaNewBookingCompactBelow;
    return Semantics(
      label: 'Carregando reservas',
      child: NexaPageHeader(
        topGap: 8,
        padding: const EdgeInsets.symmetric(
          horizontal: ArenaDashboardTokens.horizontalPadding,
        ),
        header: Row(
          children: [
            const Expanded(child: ArenaBookingsTitle()),
            const _HeaderButtonSkeleton(),
            const SizedBox(width: 8),
            const _HeaderButtonSkeleton(),
            const SizedBox(width: 8),
            NexaSkeleton(
              width: compact ? _headerButton : _newBookingPillWidth,
              height: _headerButton,
              radius: AppRadii.pillAll,
            ),
          ],
        ),
        child: SingleChildScrollView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            14,
            ArenaDashboardTokens.horizontalPadding,
            0,
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ArenaBookingsShortcutsSkeleton(),
              SizedBox(height: 12),
              ArenaBookingsDayStrip(),
              SizedBox(height: 12),
              ArenaBookingsDaySkeleton(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Botão redondo do header no esqueleto, dentro da área de toque real.
class _HeaderButtonSkeleton extends StatelessWidget {
  const _HeaderButtonSkeleton();

  @override
  Widget build(BuildContext context) {
    return const SizedBox.square(
      dimension: _headerTapTarget,
      child: Center(child: NexaSkeleton.circle(size: _headerButton)),
    );
  }
}

/// Linha do dia enquanto as reservas carregam: a faixa de resumo e cards
/// presos ao trilho, com a geometria da linha pronta.
class ArenaBookingsDaySkeleton extends StatelessWidget {
  const ArenaBookingsDaySkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      key: const Key('arena-bookings-skeleton'),
      label: 'Carregando',
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _StatsSkeleton(),
            const SizedBox(height: 14),
            for (var i = 0; i < _skeletonRows; i++)
              _RowSkeleton(isLast: i == _skeletonRows - 1),
          ],
        ),
      ),
    );
  }
}

/// Faixa "ocupado · em quadra · reservas" no esqueleto. As linhas usam um
/// texto vazio com o estilo real, então a altura bate com a faixa pronta.
class _StatsSkeleton extends StatelessWidget {
  const _StatsSkeleton();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final value = AppTypography.mono(fontSize: 15);
    const label = TextStyle(fontSize: 11);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            Expanded(
              child: Column(
                children: [
                  _Line(style: value, width: 32, height: 12),
                  const SizedBox(height: 2),
                  const _Line(style: label, width: 52, height: 8),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Barra de esqueleto na altura de uma linha de texto com [style].
class _Line extends StatelessWidget {
  const _Line({required this.style, required this.width, required this.height});

  final TextStyle style;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Text(' ', style: style),
        NexaSkeleton(width: width, height: height),
      ],
    );
  }
}

/// Uma linha da linha do dia: ponto no trilho e o card ao lado.
class _RowSkeleton extends StatelessWidget {
  const _RowSkeleton({required this.isLast});

  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      height: _cardHeight + 10,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: _railColumn,
            child: Column(
              children: [
                const SizedBox(height: 18),
                const NexaSkeleton.circle(size: 10),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          const Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: _CardSkeleton(),
            ),
          ),
        ],
      ),
    );
  }
}

/// Card de reserva no esqueleto: horário e valor, atleta, selos e ações.
class _CardSkeleton extends StatelessWidget {
  const _CardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      padding: const EdgeInsets.all(14),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              NexaSkeleton(width: 96, height: 18),
              Spacer(),
              NexaSkeleton(width: 72, height: 14),
            ],
          ),
          SizedBox(height: 16),
          Row(
            children: [
              NexaSkeleton.circle(size: 32),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FractionallySizedBox(
                      widthFactor: 0.6,
                      child: NexaSkeleton(height: 14),
                    ),
                    SizedBox(height: 6),
                    FractionallySizedBox(
                      widthFactor: 0.4,
                      child: NexaSkeleton(height: 10),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: 16),
          Row(
            children: [
              NexaSkeleton(width: 64, height: 22, radius: AppRadii.pillAll),
              SizedBox(width: 8),
              NexaSkeleton(width: 104, height: 22, radius: AppRadii.pillAll),
            ],
          ),
          Spacer(),
          Row(
            children: [
              Expanded(
                child: NexaSkeleton(height: 40, radius: AppRadii.mdAll),
              ),
              SizedBox(width: 8),
              NexaSkeleton(width: 44, height: 40, radius: AppRadii.mdAll),
            ],
          ),
        ],
      ),
    );
  }
}
