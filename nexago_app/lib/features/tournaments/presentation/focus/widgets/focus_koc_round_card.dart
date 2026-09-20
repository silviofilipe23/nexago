import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/koc/koc_round_state.dart';
import '../../../domain/tournament_match.dart';

/// Card da rodada King of the Court no Focus do atleta.
///
/// Substitui o herói de duelo quando a próxima partida é uma rodada — e não é
/// só estética: o herói mostra "você × adversário" e a rodada não tem
/// adversário, tem ELENCO. O que o atleta precisa ler aqui é onde jogar, quando,
/// contra quem (todos) e quantos pontos cada dupla tem.
///
/// Somente leitura. Quem registra rally é a mesa.
class FocusKocRoundCard extends StatefulWidget {
  const FocusKocRoundCard({
    super.key,
    required this.match,
    required this.round,
    required this.myTeamIds,
    required this.nameOf,
    required this.phaseLabel,
    this.onOpenMaps,
  });

  final TournamentMatch match;

  /// Estado ao vivo; nulo quando a rodada ainda não começou.
  final KocRoundState? round;

  final Set<String> myTeamIds;

  /// Nome curto da dupla por `teamId`.
  final String Function(String teamId) nameOf;

  /// "CLASSIFICATÓRIA" / "SEMIFINAL" / "FINAL".
  final String phaseLabel;

  final VoidCallback? onOpenMaps;

  @override
  State<FocusKocRoundCard> createState() => _FocusKocRoundCardState();
}

class _FocusKocRoundCardState extends State<FocusKocRoundCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // O relógio vem do servidor (`endsAtMs`); aqui só redesenha a contagem.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final round = widget.round;
    final live = round?.clock != null && widget.match.isInProgress;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.lg,
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          color: colors.surfaceRaised,
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.30)),
        ),
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(
              phaseLabel: widget.phaseLabel,
              live: live,
              remaining: live ? round!.clock!.remainingLabel(DateTime.now()) : null,
            ),
            const SizedBox(height: 14),
            _WhereAndWhen(match: widget.match, onOpenMaps: widget.onOpenMaps),
            const SizedBox(height: 16),
            if (round == null || round.teamIds.isEmpty)
              const _WaitingRoster()
            else ...[
              _Table(
                round: round,
                myTeamIds: widget.myTeamIds,
                nameOf: widget.nameOf,
                showPoints: round.hasStarted,
              ),
              if (live) ...[
                const SizedBox(height: 14),
                _ThroneStrip(round: round, nameOf: widget.nameOf),
              ],
            ],
            const SizedBox(height: 14),
            Text(
              // A regra que o atleta mais erra: destronar não dá ponto.
              'Só quem está no trono pontua. Quem destrona assume o trono e '
              'começa a somar no rally seguinte.',
              style: AppTypography.soraRegular(
                fontSize: 12,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.phaseLabel,
    required this.live,
    required this.remaining,
  });

  final String phaseLabel;
  final bool live;
  final String? remaining;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text('👑', style: const TextStyle(fontSize: 18)),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'KING OF THE COURT',
                style: AppTypography.soraRegular(
                  fontSize: 10,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.8,
                ),
              ),
              Text(
                phaseLabel,
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
        if (live && remaining != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: AppColors.live.withValues(alpha: 0.16),
            ),
            child: Text(
              remaining!,
              style: AppTypography.soraRegular(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppColors.live,
              ),
            ),
          ),
      ],
    );
  }
}

class _WhereAndWhen extends StatelessWidget {
  const _WhereAndWhen({required this.match, required this.onOpenMaps});

  final TournamentMatch match;
  final VoidCallback? onOpenMaps;

  @override
  Widget build(BuildContext context) {
    final court = match.effectiveCourtLabel;
    final time = match.scheduleTime;
    final parts = <String>[
      if (court.isNotEmpty) 'Quadra $court',
      if (time != null) _timeLabel(time),
    ];

    return Row(
      children: [
        Icon(
          Icons.place_outlined,
          size: 16,
          color: context.themeColors.onSurfaceMuted,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            parts.isEmpty ? 'Horário a confirmar' : parts.join(' · '),
            style: AppTypography.soraRegular(
              fontSize: 14,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        if (onOpenMaps != null)
          TextButton(
            onPressed: onOpenMaps,
            child: const Text('Como chegar'),
          ),
      ],
    );
  }

  static String _timeLabel(DateTime when) {
    final local = when.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

/// Fase seguinte antes de a anterior fechar: o elenco ainda não existe.
class _WaitingRoster extends StatelessWidget {
  const _WaitingRoster();

  @override
  Widget build(BuildContext context) {
    return Text(
      'Elenco definido quando a fase anterior terminar.',
      style: AppTypography.soraRegular(
        fontSize: 13,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _Table extends StatelessWidget {
  const _Table({
    required this.round,
    required this.myTeamIds,
    required this.nameOf,
    required this.showPoints,
  });

  final KocRoundState round;
  final Set<String> myTeamIds;
  final String Function(String teamId) nameOf;
  final bool showPoints;

  @override
  Widget build(BuildContext context) {
    // Antes de começar, a ordem é a de entrada (quem abre no trono). Depois,
    // a tabela.
    final order = showPoints ? round.liveOrder : round.teamIds;
    final cut = round.qualifiersPerRound;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < order.length; i++)
          _Row(
            position: i + 1,
            label: nameOf(order[i]),
            points: showPoints ? round.pointsOf(order[i]) : null,
            isMine: myTeamIds.contains(order[i]),
            qualifies: showPoints && i < cut,
            isKing: round.kingTeamId == order[i],
          ),
        if (showPoints && round.hasQualifyingTie) ...[
          const SizedBox(height: 8),
          Text(
            'Empate na vaga — bola de ouro decide.',
            style: AppTypography.soraRegular(
              fontSize: 12,
              color: AppColors.pending,
            ),
          ),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.position,
    required this.label,
    required this.points,
    required this.isMine,
    required this.qualifies,
    required this.isKing,
  });

  final int position;
  final String label;
  final int? points;
  final bool isMine;
  final bool qualifies;
  final bool isKing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: isMine
            ? AppColors.brand.withValues(alpha: 0.12)
            : Colors.transparent,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 22,
            child: Text(
              points == null ? '$position' : '$positionº',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: qualifies ? FontWeight.w800 : FontWeight.w400,
                color: qualifies ? AppColors.brand : colors.onSurfaceMuted,
              ),
            ),
          ),
          if (isKing)
            const Padding(
              padding: EdgeInsets.only(right: 6),
              child: Text('👑', style: TextStyle(fontSize: 13)),
            ),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: isMine ? FontWeight.w800 : FontWeight.w400,
                color: colors.onSurface,
              ),
            ),
          ),
          if (points != null)
            Text(
              '$points',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
        ],
      ),
    );
  }
}

/// Quem está na quadra agora — o que o atleta na fila mais quer saber.
class _ThroneStrip extends StatelessWidget {
  const _ThroneStrip({required this.round, required this.nameOf});

  final KocRoundState round;
  final String Function(String teamId) nameOf;

  @override
  Widget build(BuildContext context) {
    if (round.kingTeamId.isEmpty || round.challengerTeamId.isEmpty) {
      return const SizedBox.shrink();
    }
    return Text(
      'Na quadra: 👑 ${nameOf(round.kingTeamId)} '
      'vs ${nameOf(round.challengerTeamId)}'
      '${round.queue.isEmpty ? '' : '  ·  fila: ${round.queue.map(nameOf).join(', ')}'}',
      style: AppTypography.soraRegular(
        fontSize: 12,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}
