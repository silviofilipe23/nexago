import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../tournaments/domain/koc/koc_round_providers.dart';
import '../../../tournaments/domain/koc/koc_round_state.dart';
import '../../data/organizer_koc_ops_service.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_match_navigation.dart';

/// Mesa da rodada King of the Court.
///
/// A tela é desenhada para o ritmo do formato: um rally acaba a cada ~20s e o
/// mesário registra olhando a quadra, não o telefone. Por isso só existem dois
/// alvos grandes — quem venceu o rally — e o desfazer fica à mão.
class OrganizerKocTablePage extends ConsumerStatefulWidget {
  const OrganizerKocTablePage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    required this.matchId,
  });

  final String tournamentId;
  final String categoryId;
  final String matchId;

  @override
  ConsumerState<OrganizerKocTablePage> createState() =>
      _OrganizerKocTablePageState();
}

class _OrganizerKocTablePageState extends ConsumerState<OrganizerKocTablePage> {
  Timer? _ticker;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // O relógio é derivado de `endsAtMs`: nada é calculado aqui, só redesenhado.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Envolve as ações da mesa: trava o duplo toque e mostra a recusa do
  /// servidor como ela veio (o texto é em português e já é acionável).
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        showAppSnackBar(
          context,
          e.message?.trim().isNotEmpty == true
              ? e.message!.trim()
              : 'Não foi possível registrar. Tente de novo.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  OrganizerKocOpsService get _ops =>
      ref.read(organizerKocOpsServiceProvider);

  Future<void> _finish(KocRoundState round) async {
    // Empate que decide vaga: a bola de ouro é jogada na areia. A mesa escolhe
    // entre voltar e registrar o rally ou aceitar o desempate automático.
    if (round.hasQualifyingTie) {
      final accepted = await _confirmTiebreak(round);
      if (accepted != true) return;
      await _run(
        () => _ops.finishRound(matchId: widget.matchId, acceptTiebreak: true),
      );
    } else {
      await _run(() => _ops.finishRound(matchId: widget.matchId));
    }
    // Sem `pop`: a mesa continua aberta e vira LEITURA, com a tabela final. É o
    // que a mesa precisa na mão logo depois do apito, para anunciar quem avança.
  }

  Future<bool?> _confirmTiebreak(KocRoundState round) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Empate decidindo a classificação'),
        content: const Text(
          'Duas ou mais duplas empataram em pontos na vaga de classificação.\n\n'
          'O regulamento resolve na areia: joguem a bola de ouro e registrem o '
          'rally. Se preferir encerrar agora, a vaga sai pelo desempate '
          'automático (quem foi rei por último).',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Voltar e jogar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Encerrar assim'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final roundAsync = ref.watch(kocRoundProvider(widget.matchId));
    final teamsAsync = ref.watch(
      organizerCategoryRegistrationsProvider(
        OrganizerCategoryKey(
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
        ),
      ),
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        title: const Text('Mesa — King of the Court'),
        actions: [
          IconButton(
            tooltip: 'Abrir telão',
            icon: const Icon(Icons.cast_rounded),
            onPressed: () => context.push(
              publicKocBoardPath(widget.tournamentId, widget.categoryId),
            ),
          ),
        ],
      ),
      body: roundAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (round) {
          if (round == null) {
            return const Center(child: Text('Rodada não encontrada.'));
          }
          final labels = _labelsFrom(teamsAsync.valueOrNull);
          // Inscrição sem perfil resolvido cai no mesmo resolver do telão, em
          // vez de a mesa inteira virar "Dupla".
          final fallback =
              ref.watch(kocRosterNamesProvider(widget.matchId)).valueOrNull;
          return _KocTableBody(
            round: round,
            labelFor: (teamId) =>
                labels[teamId] ?? fallback?[teamId] ?? 'Dupla',
            busy: _busy,
            onStart: () => _run(() => _ops.startRound(matchId: widget.matchId)),
            onRally: (kingWon) => _run(
              () => _ops.registerRally(
                matchId: widget.matchId,
                kingWon: kingWon,
                expectedSeq: round.rallies + 1,
              ),
            ),
            onUndo: () => _run(() => _ops.undoRally(matchId: widget.matchId)),
            onTogglePause: () => _run(
              () => round.clock?.isPaused == true
                  ? _ops.resumeClock(matchId: widget.matchId)
                  : _ops.pauseClock(matchId: widget.matchId),
            ),
            onNudge: (deltaSec) => _run(
              () => _ops.nudgeClock(
                matchId: widget.matchId,
                deltaSec: deltaSec,
              ),
            ),
            onFinish: () => _finish(round),
          );
        },
      ),
    );
  }

  /// Nome curto por `teamId`, das inscrições da categoria. Sem elas a mesa ainda
  /// funciona — mostra "Dupla" e os pontos, que é o que decide a rodada.
  Map<String, String> _labelsFrom(List<OrganizerCategoryTeamRow>? teams) {
    final out = <String, String>{};
    for (final team in teams ?? const <OrganizerCategoryTeamRow>[]) {
      final first = _firstName(team.player1.name);
      final second = _firstName(team.player2.name);
      final label = [first, second].where((n) => n.isNotEmpty).join(' / ');
      if (team.teamId.isNotEmpty && label.isNotEmpty) {
        out[team.teamId] = label;
      }
    }
    return out;
  }

  static String _firstName(String full) {
    final parts = full.trim().split(RegExp(r'\s+'));
    return parts.isEmpty ? '' : parts.first;
  }
}

class _KocTableBody extends StatelessWidget {
  const _KocTableBody({
    required this.round,
    required this.labelFor,
    required this.busy,
    required this.onStart,
    required this.onRally,
    required this.onUndo,
    required this.onTogglePause,
    required this.onNudge,
    required this.onFinish,
  });

  final KocRoundState round;
  final String Function(String teamId) labelFor;
  final bool busy;
  final VoidCallback onStart;
  final void Function(bool kingWon) onRally;
  final VoidCallback onUndo;
  final VoidCallback onTogglePause;
  final void Function(int deltaSec) onNudge;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    if (round.isFinished) {
      // Rodada concluída: o servidor já recusa rally, então manter os alvos
      // vivos só renderia erro. Fica a tabela final, que é o que se volta a
      // consultar.
      return _FinishedPanel(round: round, labelFor: labelFor);
    }
    if (!round.hasStarted) {
      return _StartPanel(round: round, labelFor: labelFor, onStart: onStart, busy: busy);
    }
    return Column(
      children: [
        _ClockBar(
          round: round,
          busy: busy,
          onTogglePause: onTogglePause,
          onNudge: onNudge,
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              const SizedBox(height: 8),
              _RallyButtons(
                round: round,
                labelFor: labelFor,
                busy: busy,
                onRally: onRally,
              ),
              const SizedBox(height: 16),
              _QueueStrip(round: round, labelFor: labelFor),
              const SizedBox(height: 20),
              _LiveTable(round: round, labelFor: labelFor),
              const SizedBox(height: 24),
            ],
          ),
        ),
        _BottomActions(
          round: round,
          busy: busy,
          onUndo: onUndo,
          onFinish: onFinish,
        ),
      ],
    );
  }
}

class _StartPanel extends StatelessWidget {
  const _StartPanel({
    required this.round,
    required this.labelFor,
    required this.onStart,
    required this.busy,
  });

  final KocRoundState round;
  final String Function(String teamId) labelFor;
  final VoidCallback onStart;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final minutes = round.configuredDurationSec ~/ 60;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Elenco da rodada',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'O primeiro entra no trono, o segundo desafia, os outros formam a '
            'fila. Rodada de $minutes min.',
            style: AppTypography.soraRegular(
              fontSize: 13,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < round.teamIds.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Text(
                    i == 0 ? '👑' : '${i + 1}º',
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      labelFor(round.teamIds[i]),
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const Spacer(),
          FilledButton(
            onPressed: busy ? null : onStart,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              minimumSize: const Size.fromHeight(52),
            ),
            child: const Text('Iniciar rodada'),
          ),
        ],
      ),
    );
  }
}

/// Mesa em leitura, depois do encerramento.
class _FinishedPanel extends StatelessWidget {
  const _FinishedPanel({required this.round, required this.labelFor});

  final KocRoundState round;
  final String Function(String teamId) labelFor;

  @override
  Widget build(BuildContext context) {
    final table = round.finalTable;
    // As coroas só existem no que o encerramento gravou; sem `kocStandings` a
    // coluna some, em vez de mostrar zero para todo mundo.
    final showCrowns = round.standings.isNotEmpty;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
      children: [
        Text(
          'Rodada encerrada',
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          showCrowns
              ? '${round.rallies} rallies · coroas = vezes que assumiu o trono'
              : '${round.rallies} rallies',
          style: AppTypography.soraRegular(
            fontSize: 13,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'TABELA FINAL',
          style: AppTypography.soraRegular(
            fontSize: 11,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 8),
        for (final row in table)
          _TableRow(
            place: row.place,
            label: labelFor(row.teamId),
            points: row.points,
            qualifies: row.place <= round.qualifiersPerRound,
            tied: false,
            crowns: showCrowns ? row.crowns : null,
          ),
        const SizedBox(height: 14),
        Text(
          'Destacadas: as ${round.qualifiersPerRound} que avançam.',
          style: AppTypography.soraRegular(
            fontSize: 12,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _ClockBar extends StatelessWidget {
  const _ClockBar({
    required this.round,
    required this.busy,
    required this.onTogglePause,
    required this.onNudge,
  });

  final KocRoundState round;
  final bool busy;
  final VoidCallback onTogglePause;
  final void Function(int deltaSec) onNudge;

  @override
  Widget build(BuildContext context) {
    final clock = round.clock!;
    final now = DateTime.now();
    final expired = clock.isExpired(now);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: expired
          ? AppColors.pending.withValues(alpha: 0.16)
          : context.themeColors.surfaceRaised,
      child: Row(
        children: [
          Text(
            clock.remainingLabel(now),
            style: AppTypography.soraRegular(
              fontSize: 30,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(width: 10),
          if (expired)
            Expanded(
              child: Text(
                // Regra do formato: o rally em andamento no apito é concluído.
                'Tempo! Conclua o rally em andamento e encerre.',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  color: context.themeColors.onSurface,
                ),
              ),
            )
          else if (clock.isPaused)
            Expanded(
              child: Text(
                'Pausado',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            )
          else
            const Spacer(),
          IconButton(
            tooltip: '-1 min',
            onPressed: busy ? null : () => onNudge(-60),
            icon: const Icon(Icons.remove_circle_outline),
          ),
          IconButton(
            tooltip: '+1 min',
            onPressed: busy ? null : () => onNudge(60),
            icon: const Icon(Icons.add_circle_outline),
          ),
          IconButton(
            tooltip: clock.isPaused ? 'Retomar' : 'Pausar',
            onPressed: busy ? null : onTogglePause,
            icon: Icon(
              clock.isPaused ? Icons.play_arrow_rounded : Icons.pause_rounded,
            ),
          ),
        ],
      ),
    );
  }
}

/// Os dois alvos da mesa. Grandes porque o mesário toca olhando a quadra.
class _RallyButtons extends StatelessWidget {
  const _RallyButtons({
    required this.round,
    required this.labelFor,
    required this.busy,
    required this.onRally,
  });

  final KocRoundState round;
  final String Function(String teamId) labelFor;
  final bool busy;
  final void Function(bool kingWon) onRally;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _RallyButton(
          crown: true,
          title: labelFor(round.kingTeamId),
          subtitle: 'Defendeu o trono · +1 ponto',
          points: round.pointsOf(round.kingTeamId),
          color: AppColors.brand,
          onTap: busy ? null : () => onRally(true),
        ),
        const SizedBox(height: 12),
        _RallyButton(
          crown: false,
          title: labelFor(round.challengerTeamId),
          subtitle: 'Destronou · assume o trono, sem ponto',
          points: round.pointsOf(round.challengerTeamId),
          color: context.themeColors.surfaceRaised,
          onTap: busy ? null : () => onRally(false),
        ),
      ],
    );
  }
}

class _RallyButton extends StatelessWidget {
  const _RallyButton({
    required this.crown,
    required this.title,
    required this.subtitle,
    required this.points,
    required this.color,
    required this.onTap,
  });

  final bool crown;
  final String title;
  final String subtitle;
  final int points;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final onColor = crown ? Colors.white : context.themeColors.onSurface;
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          child: Row(
            children: [
              Text(crown ? '👑' : '⬆️', style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: onColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        color: onColor.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                '$points',
                style: AppTypography.soraRegular(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: onColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QueueStrip extends StatelessWidget {
  const _QueueStrip({required this.round, required this.labelFor});

  final KocRoundState round;
  final String Function(String teamId) labelFor;

  @override
  Widget build(BuildContext context) {
    if (round.queue.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        Text(
          'FILA',
          style: AppTypography.soraRegular(
            fontSize: 11,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            round.queue.map(labelFor).join('  →  '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
      ],
    );
  }
}

class _LiveTable extends StatelessWidget {
  const _LiveTable({required this.round, required this.labelFor});

  final KocRoundState round;
  final String Function(String teamId) labelFor;

  @override
  Widget build(BuildContext context) {
    final order = round.liveOrder;
    final cut = round.qualifiersPerRound;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'TABELA',
              style: AppTypography.soraRegular(
                fontSize: 11,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.6,
              ),
            ),
            const Spacer(),
            Text(
              '${round.rallies} rallies',
              style: AppTypography.soraRegular(
                fontSize: 11,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < order.length; i++)
          _TableRow(
            place: i + 1,
            label: labelFor(order[i]),
            points: round.pointsOf(order[i]),
            qualifies: i < cut,
            tied: round.tiedWith(order[i]).isNotEmpty,
          ),
        if (round.hasQualifyingTie) ...[
          const SizedBox(height: 10),
          Text(
            // A bola de ouro é um rally na areia, não uma conta: a mesa precisa
            // ver que o empate existe para decidir.
            'Empate na vaga de classificação — bola de ouro entre as empatadas.',
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

class _TableRow extends StatelessWidget {
  const _TableRow({
    required this.place,
    required this.label,
    required this.points,
    required this.qualifies,
    required this.tied,
    this.crowns,
  });

  final int place;
  final String label;
  final int points;
  final bool qualifies;
  final bool tied;

  /// Nulo na tabela ao vivo: a contagem de coroas só sai no encerramento.
  final int? crowns;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 26,
            child: Text(
              '$placeº',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: qualifies ? FontWeight.w800 : FontWeight.w400,
                color: qualifies
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 14,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          if (tied)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Text(
                'empate',
                style: AppTypography.soraRegular(
                  fontSize: 11,
                  color: AppColors.pending,
                ),
              ),
            ),
          if (crowns != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Text(
                '👑 $crowns',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
          Text(
            '$points',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomActions extends StatelessWidget {
  const _BottomActions({
    required this.round,
    required this.busy,
    required this.onUndo,
    required this.onFinish,
  });

  final KocRoundState round;
  final bool busy;
  final VoidCallback onUndo;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy || round.rallies == 0 ? null : onUndo,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                icon: const Icon(Icons.undo_rounded, size: 18),
                label: const Text('Desfazer'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: busy ? null : onFinish,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text('Encerrar rodada'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
