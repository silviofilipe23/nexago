import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../domain/koc/koc_round_providers.dart';
import '../domain/koc/koc_round_state.dart';
import '../domain/tournament_match.dart';
import '../domain/tournament_match_display.dart';

/// Telão da rodada King of the Court.
///
/// Desenhado para ser lido DE LONGE, por quem está esperando na beira da
/// quadra: fonte grande, sem navegação, sem interação. O que o atleta na fila
/// precisa saber, em ordem de importância — quem está no trono, quanto tempo
/// falta, a tabela, e quem entra depois.
///
/// Mantém a tela acesa (`WakelockPlus` não é dependência do projeto, então usa
/// o caminho nativo já disponível) e não permite rotação forçada: a etapa roda
/// em um tablet ou notebook apoiado na arena.
class PublicKocRoundPage extends ConsumerStatefulWidget {
  const PublicKocRoundPage({
    super.key,
    required this.matchId,
    this.match,
  });

  final String matchId;

  /// Partida já carregada, quando o chamador tem — evita um flash de vazio
  /// enquanto o doc chega. O telão funciona sem ela.
  final TournamentMatch? match;

  @override
  ConsumerState<PublicKocRoundPage> createState() => _PublicKocRoundPageState();
}

class _PublicKocRoundPageState extends ConsumerState<PublicKocRoundPage> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Só redesenha a contagem: o prazo (`endsAtMs`) vem do servidor.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersive);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final roundAsync = ref.watch(kocRoundProvider(widget.matchId));
    final names = ref.watch(kocRosterNamesProvider(widget.matchId)).valueOrNull;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: roundAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: Colors.white)),
          ),
          data: (round) {
            if (round == null) {
              return const _Message('Rodada não encontrada');
            }
            if (round.teamIds.isEmpty) {
              return const _Message('Elenco definido quando a fase anterior terminar');
            }
            return _Board(
              round: round,
              nameOf: (id) => names?[id] ?? 'Dupla',
              phaseLabel: widget.match == null
                  ? 'KING OF THE COURT'
                  : kingOfCourtPhaseLabel(widget.match!).toUpperCase(),
            );
          },
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 28,
            color: Colors.white70,
          ),
        ),
      ),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({
    required this.round,
    required this.nameOf,
    required this.phaseLabel,
  });

  final KocRoundState round;
  final String Function(String teamId) nameOf;
  final String phaseLabel;

  @override
  Widget build(BuildContext context) {
    final finished = round.isFinished;
    final started = round.hasStarted && !finished;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TopBar(round: round, phaseLabel: phaseLabel),
          const SizedBox(height: 18),
          if (started) _OnCourt(round: round, nameOf: nameOf),
          if (started) const SizedBox(height: 18),
          Expanded(
            child: _Standings(
              round: round,
              nameOf: nameOf,
              showPoints: started || finished,
              finished: finished,
            ),
          ),
          // O rodapé responde a pergunta do momento. Encerrada: quem passou.
          // Em jogo: quando eu entro. Antes do apito: como se pontua — a 1ª
          // etapa é o primeiro contato da maioria com o formato.
          if (finished)
            _Qualified(round: round, nameOf: nameOf)
          else if (started && round.queue.isNotEmpty)
            _Queue(round: round, nameOf: nameOf)
          else if (!started)
            const _Legend(),
        ],
      ),
    );
  }
}

/// A regra que o formato inteiro depende, para quem nunca viu King of the Court.
class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(
        'Só quem está no trono pontua · quem destrona assume o trono, sem ponto',
        textAlign: TextAlign.center,
        style: AppTypography.soraRegular(
          fontSize: 18,
          color: Colors.white38,
        ),
      ),
    );
  }
}

/// Quem avançou, dito com todas as letras: na tabela isso é um destaque de cor,
/// e de longe uma faixa colorida não responde "eu passei?".
class _Qualified extends StatelessWidget {
  const _Qualified({required this.round, required this.nameOf});

  final KocRoundState round;
  final String Function(String teamId) nameOf;

  @override
  Widget build(BuildContext context) {
    final names = round.finalTable
        .where((row) => row.place <= round.qualifiersPerRound)
        .map((row) => nameOf(row.teamId))
        .toList();
    if (names.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: AppColors.brand.withValues(alpha: 0.18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Text(
            'AVANÇAM',
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              names.join('   ·   '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.round, required this.phaseLabel});

  final KocRoundState round;
  final String phaseLabel;

  @override
  Widget build(BuildContext context) {
    final clock = round.clock;
    final now = DateTime.now();
    final expired = clock?.isExpired(now) ?? false;
    // Encerrada, o relógio não conta mais nada — o que o telão precisa dizer é
    // que a rodada acabou, senão um cronômetro zerado parece rodada travada.
    final finished = round.isFinished;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Text(
            phaseLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: 1.2,
            ),
          ),
        ),
        if (finished)
          Text(
            'ENCERRADA',
            style: AppTypography.soraRegular(
              fontSize: 30,
              fontWeight: FontWeight.w800,
              color: Colors.white54,
              letterSpacing: 1.2,
            ),
          )
        else if (clock != null)
          Text(
            expired ? 'TEMPO!' : clock.remainingLabel(now),
            style: AppTypography.soraRegular(
              fontSize: expired ? 40 : 56,
              fontWeight: FontWeight.w800,
              color: expired ? AppColors.pending : Colors.white,
              height: 1,
            ),
          )
        else
          Text(
            'A COMEÇAR',
            style: AppTypography.soraRegular(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Colors.white38,
              letterSpacing: 1.2,
            ),
          ),
      ],
    );
  }
}

/// O rally que está acontecendo. É a informação mais perecível do telão, então
/// ocupa o lugar mais alto depois do relógio.
class _OnCourt extends StatelessWidget {
  const _OnCourt({required this.round, required this.nameOf});

  final KocRoundState round;
  final String Function(String teamId) nameOf;

  @override
  Widget build(BuildContext context) {
    if (round.kingTeamId.isEmpty || round.challengerTeamId.isEmpty) {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: AppColors.brand.withValues(alpha: 0.18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          const Text('👑', style: TextStyle(fontSize: 30)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  nameOf(round.kingTeamId),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'vs ${nameOf(round.challengerTeamId)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 20,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${round.pointsOf(round.kingTeamId)}',
            style: AppTypography.soraRegular(
              fontSize: 52,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _Standings extends StatelessWidget {
  const _Standings({
    required this.round,
    required this.nameOf,
    required this.showPoints,
    this.finished = false,
  });

  final KocRoundState round;
  final String Function(String teamId) nameOf;
  final bool showPoints;
  final bool finished;

  @override
  Widget build(BuildContext context) {
    // Antes do apito a ordem é a de entrada (quem abre no trono); em jogo, a
    // tabela ao vivo; encerrada, a tabela OFICIAL, que é a que resolve empate.
    final order = finished
        ? round.finalTable.map((row) => row.teamId).toList()
        : (showPoints ? round.liveOrder : round.teamIds);
    final cut = round.qualifiersPerRound;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < order.length; i++)
          Expanded(
            child: _Row(
              position: i + 1,
              label: nameOf(order[i]),
              points: showPoints ? round.pointsOf(order[i]) : null,
              qualifies: showPoints && i < cut,
              isKing: round.kingTeamId == order[i],
            ),
          ),
        if (showPoints && !finished && round.hasQualifyingTie)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'EMPATE NA VAGA · BOLA DE OURO',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.pending,
                letterSpacing: 0.8,
              ),
            ),
          ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.position,
    required this.label,
    required this.points,
    required this.qualifies,
    required this.isKing,
  });

  final int position;
  final String label;
  final int? points;
  final bool qualifies;
  final bool isKing;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        // A faixa de classificação é o que o atleta procura primeiro na tabela.
        color: qualifies
            ? AppColors.brand.withValues(alpha: 0.14)
            : Colors.white.withValues(alpha: 0.05),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 46,
            child: Text(
              points == null ? '$position' : '$positionº',
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: qualifies ? AppColors.brand : Colors.white54,
              ),
            ),
          ),
          if (isKing)
            const Padding(
              padding: EdgeInsets.only(right: 10),
              child: Text('👑', style: TextStyle(fontSize: 22)),
            ),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
          if (points != null)
            Text(
              '$points',
              style: AppTypography.soraRegular(
                fontSize: 36,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                height: 1,
              ),
            ),
        ],
      ),
    );
  }
}

class _Queue extends StatelessWidget {
  const _Queue({required this.round, required this.nameOf});

  final KocRoundState round;
  final String Function(String teamId) nameOf;

  @override
  Widget build(BuildContext context) {
    // "Quando eu entro?" é a pergunta de quem está na beira da quadra. A fila
    // inteira numa linha só respondia isso por último, no mesmo tamanho do
    // resto — o PRÓXIMO sai da fila e ganha corpo.
    final next = round.queue.first;
    final rest = round.queue.skip(1).map(nameOf).toList();

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'PRÓXIMO',
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(width: 14),
          Text(
            nameOf(next),
            style: AppTypography.soraRegular(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          if (rest.isNotEmpty) ...[
            const SizedBox(width: 20),
            Expanded(
              child: Text(
                'depois   ${rest.join('   →   ')}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  color: Colors.white38,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
