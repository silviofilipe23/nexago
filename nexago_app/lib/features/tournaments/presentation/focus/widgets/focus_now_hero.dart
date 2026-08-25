import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_now_state.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';

/// O bloco principal da seção "Agora", nos cinco estados.
///
/// Layout dos protótipos: as duplas ficam LADO A LADO com o "vs" no meio, e a
/// contagem regressiva fica ACIMA delas, com a barra do intervalo. É diferente
/// do portal (que empilha no celular) e é deliberado — a leitura de "quem
/// contra quem" é o que o atleta procura primeiro na tela.
///
/// [accent] pinta a moldura: laranja no fluxo normal, vermelho na chamada de
/// quadra e amarelo na repescagem da dupla eliminação, onde uma derrota
/// elimina.
class FocusNowHero extends StatelessWidget {
  const FocusNowHero({
    super.key,
    required this.state,
    required this.view,
    required this.card,
    required this.kicker,
    required this.progress,
    required this.calledAt,
    required this.walkAwayLabel,
    required this.accent,
    required this.firstMatchStarted,
    required this.onAcknowledge,
    required this.onOpenMatch,
    required this.onOpenMaps,
    required this.onShare,
    this.leadIn,
    this.footnote,
  });

  final FocusNowState state;
  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;

  /// "SUA PRÓXIMA · GRUPO B · R3" — o contexto da partida, montado por quem
  /// chama porque depende do formato (grupo, chave dos vencedores, repescagem).
  final String kicker;

  /// Quanto do intervalo desde o jogo anterior já passou. `null` esconde a
  /// barra — ver [focusCountdownProgress].
  final double? progress;

  /// "11:26" — quando a mesa chamou. `null` esconde a linha.
  final String? calledAt;

  /// "W.O. em 8:42" quando há prazo a mostrar.
  final String? walkAwayLabel;

  final Color accent;

  /// O atleta já começou a jogar hoje — ver [athleteFirstMatchStarted]. Troca a
  /// ação principal do card: rota até a arena antes, compartilhar depois.
  final bool firstMatchStarted;

  /// Parágrafo acima da contagem — usado na repescagem para explicar o que
  /// ainda está em jogo.
  final String? leadIn;

  /// Linha de rodapé do card ("3º jogo do dia · 46 min de descanso").
  final String? footnote;

  final VoidCallback onAcknowledge;
  final VoidCallback onOpenMatch;
  final VoidCallback onOpenMaps;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.lg,
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: accent.withValues(alpha: 0.55)),
          boxShadow: [
            BoxShadow(
              color: accent.withValues(alpha: 0.10),
              blurRadius: 40,
              spreadRadius: -8,
            ),
          ],
        ),
        child: switch (state) {
          FocusNowState.called => _CalledBody(
              view: view,
              calledAt: calledAt,
              walkAwayLabel: walkAwayLabel,
              onAcknowledge: onAcknowledge,
              onOpenMatch: onOpenMatch,
              onOpenMaps: onOpenMaps,
            ),
          FocusNowState.live ||
          FocusNowState.next =>
            _MatchBody(
              view: view,
              card: card,
              kicker: kicker,
              progress: progress,
              accent: accent,
              leadIn: leadIn,
              footnote: footnote,
              firstMatchStarted: firstMatchStarted,
              onOpenMaps: onOpenMaps,
              onOpenMatch: onOpenMatch,
              onShare: onShare,
            ),
          // Fato da CATEGORIA, não promessa ao leitor: a checagem de pendência
          // não distingue quem classificou de quem já caiu no mata-mata, então
          // o texto nunca diz "seu adversário" nem menciona grupos.
          FocusNowState.pendingKnockout => const _Message(
              title: 'A chave ainda está sendo definida',
              body: 'Os confrontos e as quadras saem conforme as partidas '
                  'pendentes terminam.',
            ),
          FocusNowState.idle => const _Message(
              title: 'Seu dia acabou por aqui',
              body: 'Você não tem mais partidas pendentes neste torneio.',
            ),
        },
      ),
    );
  }
}

/// Uma dupla no herói: rostos, nome e a linha de posição/cartel.
class _Side extends StatelessWidget {
  const _Side({
    required this.duo,
    required this.players,
    required this.accent,
  });

  final DuoView? duo;
  final List<TournamentMatchCardPlayerViewModel> players;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final d = duo;
    final isMe = d?.isMe ?? false;

    return Column(
      children: [
        NexaDuoAvatars(players: players, size: 44),
        const SizedBox(height: AppSpacing.sm),
        Text(
          d?.name ?? 'A definir',
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.titleM.copyWith(
            color: colors.onSurface,
            fontWeight: FontWeight.w800,
          ),
        ),
        if (d?.standingLine != null)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Text(
              isMe ? 'VOCÊS · ${d!.standingLine}' : d!.standingLine!,
              textAlign: TextAlign.center,
              style: AppTypography.monoMeta.copyWith(
                color: isMe ? accent : colors.onSurfaceMuted,
              ),
            ),
          ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.accent});

  final String label;
  final IconData? icon;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = accent ?? colors.onSurfaceMuted;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs + 2,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: accent != null ? accent! : colors.outline,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(label, style: AppTypography.monoMeta.copyWith(color: color)),
        ],
      ),
    );
  }
}

class _MatchBody extends StatelessWidget {
  const _MatchBody({
    required this.view,
    required this.card,
    required this.kicker,
    required this.progress,
    required this.accent,
    required this.leadIn,
    required this.footnote,
    required this.firstMatchStarted,
    required this.onOpenMaps,
    required this.onOpenMatch,
    required this.onShare,
  });

  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;
  final String kicker;
  final double? progress;
  final Color accent;
  final String? leadIn;
  final String? footnote;
  final bool firstMatchStarted;
  final VoidCallback onOpenMaps;
  final VoidCallback onOpenMatch;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    if (v == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                kicker,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.eyebrow.copyWith(color: accent),
              ),
            ),
            if (v.checkedIn)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm + 2,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: colors.win),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check_rounded, size: 11, color: colors.win),
                    const SizedBox(width: 3),
                    Text(
                      'CHECK-IN',
                      style:
                          AppTypography.eyebrow.copyWith(color: colors.win),
                    ),
                  ],
                ),
              ),
          ],
        ),
        if (leadIn != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: Text(
              leadIn!,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        Center(
          child: Column(
            children: [
              Text(
                v.live ? 'EM QUADRA' : 'COMEÇA EM',
                style:
                    AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                v.live
                    ? (v.liveScoreLine ?? 'Ao vivo')
                    : (v.countdownClock ?? v.timeLabel),
                style: AppTypography.monoStat.copyWith(
                  color: accent,
                  fontSize: v.live ? 28 : 54,
                ),
              ),
            ],
          ),
        ),
        if (progress != null) ...[
          const SizedBox(height: AppSpacing.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 5,
              backgroundColor: colors.surfaceRaised,
              valueColor: AlwaysStoppedAnimation(accent),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _Side(
                duo: v.sideA,
                players: card?.teamA.players ?? const [],
                accent: accent,
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Text(
                'vs',
                style: AppTypography.monoMeta
                    .copyWith(color: colors.onSurfaceMuted),
              ),
            ),
            Expanded(
              child: _Side(
                duo: v.sideB,
                players: card?.teamB.players ?? const [],
                accent: accent,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Center(
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm - 2,
            alignment: WrapAlignment.center,
            children: [
              _Chip(label: v.timeLabel, accent: accent),
              if (v.courtLabel != null)
                _Chip(label: v.courtLabel!, icon: Icons.place_outlined),
              _Chip(label: v.formatLabel),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        // Uma ação só, e ela muda de dono no meio do dia: até a primeira
        // partida entrar em quadra o atleta está a caminho e quer a rota;
        // depois disso ele já está na areia e o que sobra é mostrar o jogo.
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: firstMatchStarted ? onShare : onOpenMaps,
            style: FilledButton.styleFrom(
              backgroundColor: accent,
              foregroundColor: _onAccent(accent),
              minimumSize: const Size(0, 48),
              shape: const RoundedRectangleBorder(
                borderRadius: AppRadii.mdAll,
              ),
            ),
            icon: Icon(
              firstMatchStarted ? Icons.ios_share_rounded : Icons.place_rounded,
              size: 18,
            ),
            label: Text(
              firstMatchStarted
                  ? 'COMPARTILHAR'
                  : v.courtLabel != null
                  ? 'Como chegar na ${v.courtLabel}'
                  : 'Como chegar',
            ),
          ),
        ),
        if (footnote != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.notifications_none_rounded,
                  size: 14,
                  color: colors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    footnote!,
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Amarelo pede tinta escura; laranja e vermelho pedem branco.
Color _onAccent(Color accent) =>
    accent == AppColors.pending ? const Color(0xFF0A0A0A) : Colors.white;

class _CalledBody extends StatelessWidget {
  const _CalledBody({
    required this.view,
    required this.calledAt,
    required this.walkAwayLabel,
    required this.onAcknowledge,
    required this.onOpenMatch,
    required this.onOpenMaps,
  });

  final NextMatchView? view;
  final String? calledAt;
  final String? walkAwayLabel;
  final VoidCallback onAcknowledge;
  final VoidCallback onOpenMatch;
  final VoidCallback onOpenMaps;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final court = view?.courtLabel ?? 'Sua quadra';
    final opponent = view?.sideB.isMe == true ? view?.sideA : view?.sideB;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: AppColors.live,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 5),
              Text(
                'VOCÊ FOI CHAMADO',
                style: AppTypography.eyebrow.copyWith(color: AppColors.live),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Center(
          child: Text(
            '$court liberada.\nVai agora.',
            textAlign: TextAlign.center,
            style: AppTypography.displayL.copyWith(color: colors.onSurface),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Center(
          child: Text(
            [
              if (opponent?.name != null) 'Sua partida é contra ${opponent!.name}.',
              if (calledAt != null) 'A mesa chamou às $calledAt.',
            ].join(' '),
            textAlign: TextAlign.center,
            style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
          ),
        ),
        if (walkAwayLabel != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.xl,
                vertical: AppSpacing.md,
              ),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.live.withValues(alpha: 0.6)),
              ),
              child: Column(
                children: [
                  Text(
                    'W.O. EM',
                    style: AppTypography.eyebrow
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    walkAwayLabel!,
                    style: AppTypography.monoStat.copyWith(
                      color: AppColors.live,
                      fontSize: 34,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: onAcknowledge,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.live,
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.check_rounded, size: 18),
            // Só recolhe o alerta: não existe callable para avisar a mesa, e o
            // rótulo não promete mais do que isso.
            label: const Text('Estou indo pra quadra'),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onOpenMaps,
                icon: const Icon(Icons.place_outlined, size: 16),
                label: const Text('Mapa'),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onOpenMatch,
                icon: const Icon(Icons.article_outlined, size: 16),
                label: const Text('Partida'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.titleM.copyWith(color: colors.onSurface),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          body,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      ],
    );
  }
}
