import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_now_state.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';

/// O bloco principal da seção "Agora", nos cinco estados.
///
/// Segue o layout MOBILE do portal, que é o que vale aqui: acima de 720px a web
/// usa três colunas (`1fr auto 1fr`), mas abaixo disso ela mesma colapsa para
/// uma coluna centralizada — dupla A, bloco central, dupla B — com os botões
/// empilhados em largura total. Copiar o desenho de desktop deixaria o app
/// diferente do portal no celular, que é justamente onde os dois se encontram.
///
/// A cópia dos textos é a mesma do portal, palavra por palavra.
class FocusNowHero extends StatelessWidget {
  const FocusNowHero({
    super.key,
    required this.state,
    required this.view,
    required this.card,
    required this.calledAt,
    required this.mapsLabel,
    required this.onAcknowledge,
    required this.onOpenMatch,
    required this.onOpenMaps,
    required this.onShare,
  });

  final FocusNowState state;
  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;

  /// "14:32" — quando a mesa chamou. `null` esconde a linha em vez de mentir.
  final String? calledAt;
  final String mapsLabel;
  final VoidCallback onAcknowledge;
  final VoidCallback onOpenMatch;
  final VoidCallback onOpenMaps;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.lg,
      ),
      child: switch (state) {
        FocusNowState.called => _Called(
            view: view,
            calledAt: calledAt,
            mapsLabel: mapsLabel,
            onAcknowledge: onAcknowledge,
            onOpenMatch: onOpenMatch,
            onOpenMaps: onOpenMaps,
          ),
        FocusNowState.live => _Live(
            view: view,
            card: card,
            onOpenMatch: onOpenMatch,
          ),
        FocusNowState.next => _Next(
            view: view,
            card: card,
            mapsLabel: mapsLabel,
            onOpenMatch: onOpenMatch,
            onOpenMaps: onOpenMaps,
            onShare: onShare,
          ),
        // Fato da CATEGORIA, não promessa ao leitor: nem toda categoria tem
        // fase de grupos, e a checagem de pendência não distingue quem
        // classificou de quem já caiu no próprio mata-mata. Por isso o texto
        // nunca diz "seu adversário" nem menciona grupos.
        FocusNowState.pendingKnockout => const _Idle(
            text: 'O mata-mata desta categoria ainda está sendo definido. '
                'Os confrontos e as quadras saem conforme as partidas '
                'pendentes terminam.',
          ),
        FocusNowState.idle => const _Idle(
            text: 'Você não tem mais partidas pendentes neste torneio.',
          ),
      },
    );
  }
}

/// Card base das variações — mesma moldura do `.now-*` do portal.
class _Card extends StatelessWidget {
  const _Card({required this.child, this.accent = false});

  final Widget child;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: accent ? AppColors.live : colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: accent ? AppColors.live : colors.outline,
        ),
      ),
      child: child,
    );
  }
}

/// Uma dupla: rostos, nome e a linha de classificação do grupo.
class _Side extends StatelessWidget {
  const _Side({required this.duo, required this.players});

  final DuoView? duo;
  final List<TournamentMatchCardPlayerViewModel> players;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final d = duo;

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
            fontWeight: d?.isMe == true ? FontWeight.w800 : FontWeight.w700,
          ),
        ),
        if (d?.standingLine != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              d!.standingLine!,
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs + 2,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}

class _Called extends StatelessWidget {
  const _Called({
    required this.view,
    required this.calledAt,
    required this.mapsLabel,
    required this.onAcknowledge,
    required this.onOpenMatch,
    required this.onOpenMaps,
  });

  final NextMatchView? view;
  final String? calledAt;
  final String mapsLabel;
  final VoidCallback onAcknowledge;
  final VoidCallback onOpenMatch;
  final VoidCallback onOpenMaps;

  @override
  Widget build(BuildContext context) {
    final court = view?.courtLabel ?? 'Sua quadra';

    return _Card(
      accent: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Você foi chamado',
            style: AppTypography.eyebrow.copyWith(color: Colors.white),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '$court liberada. Vai agora.',
            style: AppTypography.titleL.copyWith(color: Colors.white),
          ),
          if (calledAt != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                'A mesa chamou às $calledAt.',
                style: AppTypography.bodyM.copyWith(
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onAcknowledge,
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.live,
              ),
              // Só recolhe o alerta: não existe callable para avisar a mesa, e
              // o rótulo não promete mais do que isso.
              child: const Text('Ok, estou indo'),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.lg,
            runSpacing: AppSpacing.sm,
            children: [
              _WhiteLink(label: mapsLabel, onTap: onOpenMaps),
              if (view != null)
                _WhiteLink(label: 'Ver partida', onTap: onOpenMatch),
            ],
          ),
        ],
      ),
    );
  }
}

class _WhiteLink extends StatelessWidget {
  const _WhiteLink({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: AppTypography.bodyM.copyWith(
          color: Colors.white,
          decoration: TextDecoration.underline,
          decorationColor: Colors.white,
        ),
      ),
    );
  }
}

class _Live extends StatelessWidget {
  const _Live({
    required this.view,
    required this.card,
    required this.onOpenMatch,
  });

  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;
  final VoidCallback onOpenMatch;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    if (v == null) return const SizedBox.shrink();

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            v.kicker,
            style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: AppSpacing.lg),
          _Side(duo: v.sideA, players: card?.teamA.players ?? const []),
          const SizedBox(height: AppSpacing.lg),
          Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AppColors.live,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm - 2),
                  Text(
                    'Ao vivo',
                    style: AppTypography.eyebrow
                        .copyWith(color: AppColors.live),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                v.liveScoreLine ?? 'Em quadra',
                textAlign: TextAlign.center,
                // Mono, como o `--nx-font-mono` do portal: placar que muda a
                // cada ponto não pode dançar de largura.
                style: AppTypography.monoStat.copyWith(color: colors.onSurface),
              ),
              if (v.courtLabel != null)
                Text(
                  v.courtLabel!,
                  style: AppTypography.bodyS
                      .copyWith(color: colors.onSurfaceMuted),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _Side(duo: v.sideB, players: card?.teamB.players ?? const []),
          const SizedBox(height: AppSpacing.xl),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onOpenMatch,
              child: const Text('Ver partida'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Next extends StatelessWidget {
  const _Next({
    required this.view,
    required this.card,
    required this.mapsLabel,
    required this.onOpenMatch,
    required this.onOpenMaps,
    required this.onShare,
  });

  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;
  final String mapsLabel;
  final VoidCallback onOpenMatch;
  final VoidCallback onOpenMaps;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    if (v == null) return const SizedBox.shrink();

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  v.kicker,
                  style: AppTypography.eyebrow
                      .copyWith(color: colors.onSurfaceMuted),
                ),
              ),
              if (v.checkedIn)
                Row(
                  children: [
                    Icon(Icons.check_rounded, size: 12, color: colors.win),
                    const SizedBox(width: 3),
                    Text(
                      'Check-in feito',
                      style: AppTypography.bodyS.copyWith(color: colors.win),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _Side(duo: v.sideA, players: card?.teamA.players ?? const []),
          const SizedBox(height: AppSpacing.lg),
          Column(
            children: [
              Text(
                v.timeLabel,
                style: AppTypography.monoStat.copyWith(
                  color: colors.onSurface,
                  fontSize: 34,
                ),
              ),
              if (v.countdown != null)
                Text(
                  v.countdown!,
                  style: AppTypography.bodyS.copyWith(color: colors.brand),
                ),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm - 2,
                alignment: WrapAlignment.center,
                children: [
                  if (v.numberLabel != null) _Chip(label: v.numberLabel!),
                  if (v.courtLabel != null) _Chip(label: v.courtLabel!),
                  _Chip(label: v.bestOfLabel),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _Side(duo: v.sideB, players: card?.teamB.players ?? const []),
          const SizedBox(height: AppSpacing.xl),
          // Empilhados e em largura total — é o que a web faz abaixo de 720px.
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onOpenMatch,
              child: const Text('Ver partida'),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onOpenMaps,
              icon: const Icon(Icons.place_outlined, size: 16),
              label: Text(mapsLabel),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onShare,
              icon: const Icon(Icons.ios_share_rounded, size: 16),
              label: const Text('Compartilhar'),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Esteja na quadra alguns minutos antes — o organizador pode '
            'declarar W.O. por atraso.',
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

class _Idle extends StatelessWidget {
  const _Idle({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return _Card(
      child: Text(
        text,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}
