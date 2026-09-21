import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_campaign_ended.dart';
import '../../../domain/focus/focus_now_state.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';
import '../../../../athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';

/// Arte de fundo do Agora (protótipo Focus) — full-bleed atrás da lista.
const kFocusNowHeroBackgroundAsset =
    'assets/images/sports/match_detail_live_bg.webp';

/// Arte de fundo do herói "eliminada" — high-five no pôr do sol.
const kFocusEliminadaBackgroundAsset =
    'assets/images/sports/focus_eliminada_bg.webp';

/// Arte de fundo da seção Grupo — pôr do sol / rede / bola.
const kFocusGrupoBackgroundAsset =
    'assets/images/sports/focus_grupo_bg.webp';

/// Mesma arte do Grupo: Arena compartilha a imersão foto + glass.
const kFocusArenaBackgroundAsset = kFocusGrupoBackgroundAsset;

/// Arte de fundo da seção Palpites — pôr do sol / celular / odds.
const kFocusPalpitesBackgroundAsset =
    'assets/images/sports/focus_palpites_bg.webp';

/// Foto + gradiente cobrindo a seção Agora inteira.
///
/// Com [eliminated] usa a arte de despedida; senão a do próximo jogo / ao vivo.
class FocusAgoraScreenBackground extends StatelessWidget {
  const FocusAgoraScreenBackground({super.key, this.eliminated = false});

  final bool eliminated;

  @override
  Widget build(BuildContext context) {
    return FocusPhotoScreenBackground(
      asset: eliminated
          ? kFocusEliminadaBackgroundAsset
          : kFocusNowHeroBackgroundAsset,
      // High-five e sol no centro vertical do asset eliminada.
      alignment: eliminated
          ? const Alignment(0, -0.05)
          : const Alignment(0, -0.15),
    );
  }
}

/// Foto + gradiente cobrindo a seção Grupo inteira (glass da classificação).
class FocusGrupoScreenBackground extends StatelessWidget {
  const FocusGrupoScreenBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const FocusPhotoScreenBackground(
      asset: kFocusGrupoBackgroundAsset,
      // Bola e areia no terço inferior — mantém o céu atrás do hero da seção.
      alignment: Alignment(0, 0.2),
    );
  }
}

/// Foto + gradiente da seção Arena (mesmo asset do Grupo).
class FocusArenaScreenBackground extends StatelessWidget {
  const FocusArenaScreenBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const FocusPhotoScreenBackground(
      asset: kFocusArenaBackgroundAsset,
      alignment: Alignment(0, 0.2),
    );
  }
}

/// Foto + gradiente da seção Palpites (glass dos cards de partida).
class FocusPalpitesScreenBackground extends StatelessWidget {
  const FocusPalpitesScreenBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const FocusPhotoScreenBackground(
      asset: kFocusPalpitesBackgroundAsset,
      // Celular e bola no terço inferior — céu atrás do seletor.
      alignment: Alignment(0, 0.25),
    );
  }
}

/// Foto + gradiente da seção Chave — mesma arte do Agora (próximo jogo / ao vivo).
class FocusChaveScreenBackground extends StatelessWidget {
  const FocusChaveScreenBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const FocusPhotoScreenBackground(
      asset: kFocusNowHeroBackgroundAsset,
      alignment: Alignment(0, -0.15),
    );
  }
}

/// Foto full-bleed + vinheta escura para legibilidade dos cards glass.
class FocusPhotoScreenBackground extends StatelessWidget {
  const FocusPhotoScreenBackground({
    super.key,
    required this.asset,
    this.alignment = const Alignment(0, -0.15),
  });

  final String asset;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          asset,
          fit: BoxFit.cover,
          alignment: alignment,
          errorBuilder: (_, __, ___) =>
              const ColoredBox(color: Color(0xFF0A0A0A)),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x99000000),
                Color(0x66000000),
                Color(0xB3000000),
                Color(0xF2050505),
              ],
              stops: [0, 0.18, 0.55, 1],
            ),
          ),
        ),
      ],
    );
  }
}

/// O bloco principal da seção "Agora".
///
/// Protótipo: foto full-bleed no topo com "PRÓXIMO JOGO" + countdown, depois
/// confronto horizontal, faixa glass de horário/quadra/fase e CTA de chegar.
/// Estado [FocusNowState.eliminated]: manchete motivacional + card "NOSSA
/// CAMPANHA".
///
/// [accent] pinta CTA e destaques: laranja no fluxo normal, amarelo na
/// repescagem, vermelho na chamada de quadra.
class FocusNowHero extends StatelessWidget {
  const FocusNowHero({
    super.key,
    required this.state,
    required this.view,
    required this.card,
    required this.contextTag,
    required this.calledAt,
    required this.walkAwayLabel,
    required this.accent,
    required this.firstMatchStarted,
    required this.onAcknowledge,
    required this.onOpenMatch,
    required this.onOpenMaps,
    required this.onShare,
    this.leadIn,
    this.phaseEyebrow,
    this.phaseValue,
    this.timeEyebrow,
    this.timeLabel,
    this.campaign,
  });

  final FocusNowState state;
  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;

  /// "GRUPO B • R3" — contexto curto no canto do herói.
  final String contextTag;

  final String? calledAt;
  final String? walkAwayLabel;
  final Color accent;

  /// True quando alguma partida do atleta hoje já começou/terminou — aí o
  /// "Como chegar" some: ele já está na arena.
  final bool firstMatchStarted;
  final String? leadIn;

  /// "Fase de Grupos" / "Mata-mata" — coluna da direita na faixa glass.
  final String? phaseEyebrow;
  final String? phaseValue;

  /// "Hoje" / "Amanhã" / "12/10" — coluna de horário da faixa glass.
  final String? timeEyebrow;

  /// "16/09 · 14:30" — sobrescreve [NextMatchView.timeLabel] quando a seção
  /// precisa mostrar data + hora (próxima partida pode ser outro dia).
  final String? timeLabel;

  /// Só no estado [FocusNowState.eliminated].
  final FocusCampaignSummary? campaign;

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
        FocusNowState.called => _Shell(
          child: _CalledBody(
            view: view,
            calledAt: calledAt,
            walkAwayLabel: walkAwayLabel,
            onAcknowledge: onAcknowledge,
            onOpenMatch: onOpenMatch,
            onOpenMaps: onOpenMaps,
          ),
        ),
        FocusNowState.live || FocusNowState.next => _Shell(
          child: _MatchBody(
            view: view,
            card: card,
            contextTag: contextTag,
            accent: accent,
            leadIn: leadIn,
            phaseEyebrow: phaseEyebrow,
            phaseValue: phaseValue,
            timeEyebrow: timeEyebrow,
            timeLabel: timeLabel,
            firstMatchStarted: firstMatchStarted,
            onOpenMaps: onOpenMaps,
            onShare: onShare,
          ),
        ),
        FocusNowState.pendingKnockout => const _PendingKnockoutBody(),
        FocusNowState.eliminated => _EliminatedBody(
          campaign: campaign ??
              const FocusCampaignSummary(wins: 0, losses: 0),
        ),
        FocusNowState.idle => const _Shell(
          child: _Message(
            title: 'Seu dia acabou por aqui',
            body: 'Você não tem mais partidas pendentes neste torneio.',
          ),
        ),
      },
    );
  }
}

/// Casca glass do herói — mesma linguagem dos cards Arena / Grupo / rail.
class _Shell extends StatelessWidget {
  const _Shell({required this.child});

  final Widget child;

  static const _radius = 20.0;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(_radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(_radius),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _MatchBody extends StatelessWidget {
  const _MatchBody({
    required this.view,
    required this.card,
    required this.contextTag,
    required this.accent,
    required this.leadIn,
    required this.phaseEyebrow,
    required this.phaseValue,
    required this.timeEyebrow,
    required this.timeLabel,
    required this.firstMatchStarted,
    required this.onOpenMaps,
    required this.onShare,
  });

  final NextMatchView? view;
  final TournamentMatchCardViewModel? card;
  final String contextTag;
  final Color accent;
  final String? leadIn;
  final String? phaseEyebrow;
  final String? phaseValue;
  final String? timeEyebrow;
  final String? timeLabel;
  final bool firstMatchStarted;
  final VoidCallback onOpenMaps;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final v = view;
    if (v == null) return const SizedBox.shrink();

    final courtShort = _courtNumber(v.courtLabel);
    // Mapa só na 1ª partida do dia — depois o atleta já está na arena.
    // Compartilhar só fecha o poster com os dois lados preenchidos.
    final showMaps = !firstMatchStarted;
    final showShare = v.sideA.teamId.trim().isNotEmpty &&
        v.sideB.teamId.trim().isNotEmpty;
    final mapsLabel = courtShort != null
        ? 'Como chegar na quadra $courtShort'
        : 'Como chegar';
    final filledStyle = FilledButton.styleFrom(
      backgroundColor: accent,
      foregroundColor: _onAccent(accent),
      minimumSize: const Size(0, 52),
      shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
    );
    final outlineStyle = OutlinedButton.styleFrom(
      foregroundColor: accent,
      side: BorderSide(color: accent.withValues(alpha: 0.85), width: 1.5),
      minimumSize: const Size(0, 52),
      shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _HeroHeadline(
          contextTag: contextTag,
          checkedIn: v.checkedIn,
          live: v.live,
          scheduleTime: v.scheduleTime,
          liveScoreLine: v.liveScoreLine,
          accent: accent,
        ),
        if (leadIn != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            leadIn!,
            style: AppTypography.bodyM.copyWith(color: colors.onSurface),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _Side(
                duo: v.sideA,
                players: card?.teamA.players ?? const [],
              ),
            ),
            SizedBox(
              height: _kFocusHeroAvatarSize,
              child: Center(
                child: Text(
                  'VS',
                  style: AppTypography.monoMeta.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            Expanded(
              child: _Side(
                duo: v.sideB,
                players: card?.teamB.players ?? const [],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        _InfoStrip(
          matchNumber: () {
            final raw = v.numberLabel?.trim() ?? '';
            if (raw.isEmpty) return null;
            // numberLabel vem como "Jogo #12" — o eyebrow já diz "Jogo".
            return raw.replaceFirst(RegExp(r'^Jogo\s*', caseSensitive: false), '');
          }(),
          timeEyebrow: timeEyebrow ?? 'Hoje',
          timeLabel: timeLabel ?? v.timeLabel,
          courtNumber: courtShort,
          phaseEyebrow: phaseEyebrow ?? 'Fase',
          phaseValue: phaseValue ?? v.kicker,
        ),
        if (showMaps || showShare) const SizedBox(height: AppSpacing.md),
        if (showMaps)
          FilledButton.icon(
            onPressed: onOpenMaps,
            style: filledStyle,
            icon: const Icon(Icons.near_me_rounded, size: 18),
            label: Text(mapsLabel),
          ),
        if (showMaps && showShare) const SizedBox(height: AppSpacing.sm),
        if (showShare)
          showMaps
              ? OutlinedButton.icon(
                  onPressed: onShare,
                  style: outlineStyle,
                  icon: const Icon(Icons.ios_share_rounded, size: 18),
                  label: const Text('Compartilhar'),
                )
              : FilledButton.icon(
                  onPressed: onShare,
                  style: filledStyle,
                  icon: const Icon(Icons.ios_share_rounded, size: 18),
                  label: const Text('Compartilhar'),
                ),
      ],
    );
  }
}

class _HeroHeadline extends StatefulWidget {
  const _HeroHeadline({
    required this.contextTag,
    required this.checkedIn,
    required this.live,
    required this.scheduleTime,
    required this.liveScoreLine,
    required this.accent,
  });

  final String contextTag;
  final bool checkedIn;
  final bool live;
  final DateTime? scheduleTime;
  final String? liveScoreLine;
  final Color accent;

  @override
  State<_HeroHeadline> createState() => _HeroHeadlineState();
}

class _HeroHeadlineState extends State<_HeroHeadline> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant _HeroHeadline oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.live != widget.live ||
        oldWidget.scheduleTime != widget.scheduleTime) {
      _syncTicker();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _syncTicker() {
    _ticker?.cancel();
    _ticker = null;
    // Só tica enquanto há contagem regressiva — ao vivo o placar vem do
    // stream da partida, não deste relógio.
    if (widget.live || widget.scheduleTime == null) return;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final clock = widget.live
        ? null
        : countdownClockOf(widget.scheduleTime, DateTime.now());
    final overdue =
        !widget.live && widget.scheduleTime != null && clock == null;
    final statusLabel = widget.live
        ? 'EM QUADRA'
        : overdue
        ? 'ATRASADA'
        : 'COMEÇA EM';
    final valueLabel = widget.live
        ? (widget.liveScoreLine ?? 'Ao vivo')
        : overdue
        ? (countdownLabelOf(widget.scheduleTime, DateTime.now()) ?? '—')
              .replaceFirst('atrasada ', '')
        : (clock ?? '—');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                widget.contextTag,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.eyebrow.copyWith(
                  color: Colors.white.withValues(alpha: 0.85),
                  letterSpacing: 0.8,
                ),
              ),
            ),
            if (widget.checkedIn)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.win.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: AppColors.win.withValues(alpha: 0.7),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.check_rounded,
                      size: 12,
                      color: AppColors.win,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'CHECK-IN LIBERADO',
                      style: AppTypography.eyebrow.copyWith(
                        color: AppColors.win,
                        fontSize: 9,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        Center(
          child: Column(
            children: [
              _PrototypeTitle(live: widget.live),
              const SizedBox(height: 6),
              Text(
                statusLabel,
                style: AppTypography.eyebrow.copyWith(
                  color: Colors.white.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                valueLabel,
                style: AppTypography.monoStat.copyWith(
                  color: overdue ? AppColors.live : widget.accent,
                  fontSize: widget.live || overdue ? 28 : 40,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// "PRÓXIMO JOGO" no estilo do protótipo — Sora pesado (sem fonte brush).
class _PrototypeTitle extends StatelessWidget {
  const _PrototypeTitle({required this.live});

  final bool live;

  @override
  Widget build(BuildContext context) {
    if (live) {
      return Text(
        'AO VIVO',
        style: AppTypography.displayL.copyWith(
          color: AppColors.live,
          fontStyle: FontStyle.italic,
          fontWeight: FontWeight.w800,
          letterSpacing: -1,
        ),
      );
    }

    return Column(
      children: [
        Text.rich(
          TextSpan(
            style: AppTypography.displayL.copyWith(
              fontStyle: FontStyle.italic,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.2,
              height: 1,
            ),
            children: const [
              TextSpan(
                text: 'PRÓXIMO ',
                style: TextStyle(color: Colors.white),
              ),
              TextSpan(
                text: 'JOGO',
                style: TextStyle(color: AppColors.brand),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: 72,
          height: 3,
          decoration: BoxDecoration(
            color: AppColors.brand,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ],
    );
  }
}

class _InfoStrip extends StatelessWidget {
  const _InfoStrip({
    required this.timeEyebrow,
    required this.timeLabel,
    required this.courtNumber,
    required this.phaseEyebrow,
    required this.phaseValue,
    this.matchNumber,
  });

  /// "#12" — número do jogo na categoria. `null` omite a coluna.
  final String? matchNumber;
  final String timeEyebrow;
  final String timeLabel;
  final String? courtNumber;
  final String phaseEyebrow;
  final String phaseValue;

  @override
  Widget build(BuildContext context) {
    // Painel interno translúcido — o blur fica só no `_Shell` (evita double blur).
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          if (matchNumber != null && matchNumber!.isNotEmpty) ...[
            Expanded(
              child: _InfoCell(
                icon: Icons.tag_rounded,
                eyebrow: 'Jogo',
                value: matchNumber!,
              ),
            ),
            _Divider(),
          ],
          Expanded(
            child: _InfoCell(
              icon: Icons.calendar_today_outlined,
              eyebrow: timeEyebrow,
              value: timeLabel,
            ),
          ),
          _Divider(),
          Expanded(
            child: _InfoCell(
              icon: Icons.place_outlined,
              eyebrow: 'Quadra',
              value: courtNumber ?? '—',
            ),
          ),
          _Divider(),
          Expanded(
            child: _InfoCell(
              icon: Icons.account_tree_outlined,
              eyebrow: phaseEyebrow,
              value: phaseValue,
            ),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 36,
      color: Colors.white.withValues(alpha: 0.10),
    );
  }
}

class _InfoCell extends StatelessWidget {
  const _InfoCell({
    required this.icon,
    required this.eyebrow,
    required this.value,
  });

  final IconData icon;
  final String eyebrow;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        Icon(icon, size: 14, color: colors.onSurfaceMuted),
        const SizedBox(height: 4),
        Text(
          eyebrow,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.monoMeta.copyWith(
            color: colors.onSurfaceMuted,
            fontSize: 9,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.titleS.copyWith(
            color: colors.onSurface,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({required this.duo, required this.players});

  static const _avatarSize = _kFocusHeroAvatarSize;

  final DuoView? duo;
  final List<TournamentMatchCardPlayerViewModel> players;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final d = duo;
    final isMe = d?.isMe ?? false;
    final nameList = players
        .map((p) => p.name.trim())
        .where((n) => n.isNotEmpty)
        .take(2)
        .toList();
    // Só o adversário abre o visualizador — o atleta já conhece a própria
    // dupla; o gesto serve para olhar quem vem pela frente.
    final canPreview =
        !isMe && players.any((p) => (p.avatarUrl ?? '').trim().isNotEmpty);

    return Column(
      children: [
        _PressableDuoAvatars(
          players: players,
          size: _avatarSize,
          enabled: canPreview,
          onTap: canPreview
              ? () => openProfilePhotoViewer(
                  context,
                  photoUrls: [
                    for (final p in players)
                      if ((p.avatarUrl ?? '').trim().isNotEmpty)
                        p.avatarUrl!.trim(),
                  ],
                )
              : null,
        ),
        const SizedBox(height: AppSpacing.sm),
        if (isMe)
          Text(
            'Você',
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.titleS.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w800,
            ),
          )
        else if (nameList.isNotEmpty)
          Column(
            children: [
              for (var i = 0; i < nameList.length; i++) ...[
                if (i > 0) const SizedBox(height: 2),
                Text(
                  nameList[i],
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.titleS.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          )
        else
          Text(
            d?.name ?? 'A definir',
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.titleS.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
      ],
    );
  }
}

/// Escala de pressão (0.94 → 1) antes de abrir o viewer — confirma o toque
/// sem bounce exagerado.
class _PressableDuoAvatars extends StatefulWidget {
  const _PressableDuoAvatars({
    required this.players,
    required this.size,
    required this.enabled,
    required this.onTap,
  });

  final List<TournamentMatchCardPlayerViewModel> players;
  final double size;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  State<_PressableDuoAvatars> createState() => _PressableDuoAvatarsState();
}

class _PressableDuoAvatarsState extends State<_PressableDuoAvatars> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (!widget.enabled || _pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.enabled ? (_) => _setPressed(true) : null,
      onTapUp: widget.enabled ? (_) => _setPressed(false) : null,
      onTapCancel: widget.enabled ? () => _setPressed(false) : null,
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1,
        duration: const Duration(milliseconds: 160),
        curve: Curves.easeOutCubic,
        child: NexaDuoAvatars(players: widget.players, size: widget.size),
      ),
    );
  }
}

String? _courtNumber(String? courtLabel) {
  final raw = (courtLabel ?? '').trim();
  if (raw.isEmpty) return null;
  final numbered = RegExp(
    r'(?:quadra\s*)?(\d+)$',
    caseSensitive: false,
  ).firstMatch(raw);
  if (numbered != null) return numbered.group(1);
  final q = RegExp(r'^Q(\d+)$', caseSensitive: false).firstMatch(raw);
  if (q != null) return q.group(1);
  return raw;
}

/// Diâmetro dos avatares da dupla no herói Agora.
const double _kFocusHeroAvatarSize = 80;

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
              if (view?.numberLabel != null) view!.numberLabel!,
              if (opponent?.name != null)
                'Sua partida é contra ${opponent!.name}.',
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
                border: Border.all(
                  color: AppColors.live.withValues(alpha: 0.6),
                ),
              ),
              child: Column(
                children: [
                  Text(
                    'W.O. EM',
                    style: AppTypography.eyebrow.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
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

/// Herói enquanto a chave do mata-mata ainda está sendo montada
/// (`FocusNowState.pendingKnockout`).
class _PendingKnockoutBody extends StatelessWidget {
  const _PendingKnockoutBody();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.85),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.brand.withValues(alpha: 0.22),
                  blurRadius: 18,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: const Icon(
              Icons.hourglass_empty_rounded,
              size: 32,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          Text.rich(
            TextSpan(
              style: AppTypography.displayL.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.8,
                height: 1.1,
                color: Colors.white,
              ),
              children: const [
                TextSpan(text: 'Aguardando\n'),
                TextSpan(
                  text: 'definição da chave',
                  style: TextStyle(color: AppColors.brand),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            'Você já concluiu todos os jogos da fase de grupos. '
            'Agora estamos finalizando os confrontos e em breve '
            'os classificados serão definidos.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyM.copyWith(
              color: Colors.white.withValues(alpha: 0.72),
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

/// Herói de despedida — eliminado no mata-mata ou sem classificação no grupo.
class _EliminatedBody extends StatelessWidget {
  const _EliminatedBody({required this.campaign});

  final FocusCampaignSummary campaign;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text.rich(
          TextSpan(
            style: AppTypography.displayL.copyWith(
              fontStyle: FontStyle.italic,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.2,
              height: 1.05,
              color: Colors.white,
            ),
            children: const [
              TextSpan(text: 'JOGARAM COM\nATITUDE.\n'),
              TextSpan(
                text: 'ISSO JÁ É GRANDE.',
                style: TextStyle(color: AppColors.brand),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xxl),
        Text(
          'SUA DUPLA FOI',
          style: AppTypography.eyebrow.copyWith(
            color: Colors.white.withValues(alpha: 0.85),
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'ELIMINADA',
          style: AppTypography.displayL.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            letterSpacing: -1,
            height: 1,
            fontSize: 40,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Nem todo caminho termina no pódio.\n'
          'O importante é continuar jogando.',
          style: AppTypography.bodyM.copyWith(
            color: Colors.white.withValues(alpha: 0.78),
            height: 1.4,
          ),
        ),
        const SizedBox(height: AppSpacing.xxl),
        _CampaignGlassCard(campaign: campaign),
      ],
    );
  }
}

class _CampaignGlassCard extends StatelessWidget {
  const _CampaignGlassCard({required this.campaign});

  final FocusCampaignSummary campaign;

  @override
  Widget build(BuildContext context) {
    const radius = 20.0;
    final rank = campaign.groupRank;

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'NOSSA CAMPANHA',
                style: AppTypography.eyebrow.copyWith(
                  color: Colors.white.withValues(alpha: 0.55),
                  letterSpacing: 1.1,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: _CampaignStat(
                      icon: Icons.emoji_events_outlined,
                      iconColor: AppColors.win,
                      value: '${campaign.wins}',
                      label: campaign.wins == 1 ? 'VITÓRIA' : 'VITÓRIAS',
                    ),
                  ),
                  _CampaignDivider(),
                  Expanded(
                    child: _CampaignStat(
                      icon: Icons.close_rounded,
                      iconColor: AppColors.live,
                      value: '${campaign.losses}',
                      label: campaign.losses == 1 ? 'DERROTA' : 'DERROTAS',
                    ),
                  ),
                  if (rank != null) ...[
                    _CampaignDivider(),
                    Expanded(
                      child: _CampaignStat(
                        icon: Icons.bar_chart_rounded,
                        iconColor: Colors.white.withValues(alpha: 0.85),
                        value: focusCampaignRankLabel(rank),
                        label: 'NO GRUPO',
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CampaignDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 44,
      color: Colors.white.withValues(alpha: 0.10),
    );
  }
}

class _CampaignStat extends StatelessWidget {
  const _CampaignStat({
    required this.icon,
    required this.iconColor,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final Color iconColor;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 18, color: iconColor),
        const SizedBox(height: 6),
        Text(
          value,
          style: AppTypography.monoStat.copyWith(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: AppTypography.eyebrow.copyWith(
            color: Colors.white.withValues(alpha: 0.7),
            fontSize: 10,
            letterSpacing: 0.6,
          ),
        ),
      ],
    );
  }
}
