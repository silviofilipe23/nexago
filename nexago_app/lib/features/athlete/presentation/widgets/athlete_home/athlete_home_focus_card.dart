import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../tournaments/domain/athlete_tournament_day_logic.dart';
import '../../../../tournaments/domain/athlete_tournament_day_providers.dart';
import '../../../../tournaments/domain/focus/focus_views_logic.dart';
import '../../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../../tournaments/domain/tournament_match_display.dart';
import '../../../../tournaments/presentation/widgets/nexa_duo_avatars.dart';
import '../../../domain/athlete_home_focus_card_logic.dart';

/// Card do Modo Focus na Home, no dia do evento: um mini "Agora".
///
/// Substitui o botão "MODO FOCUS" solto. Mostra o que mais importa no momento
/// (contagem até a partida, chamada da mesa, jogo ao vivo ou intervalo) e
/// leva ao Focus. Some quando [athleteFocusHomeTargetProvider] devolve null
/// (fora do dia do evento ou atleta eliminado no mata-mata).
class AthleteHomeFocusCard extends ConsumerWidget {
  const AthleteHomeFocusCard({
    super.key,
    this.bottomGap = AppSpacing.sectionGap,
  });

  final double bottomGap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final target = ref.watch(athleteFocusHomeTargetProvider).valueOrNull;
    if (target == null) return const SizedBox.shrink();
    final tournamentId = target.tournamentId;

    AthleteNextMatch? ofTarget(AthleteNextMatch? m) =>
        m?.tournamentId == tournamentId ? m : null;
    // A chamada vem do stream ao vivo; a próxima partida, da leitura do dia.
    final picked =
        ofTarget(ref.watch(athleteCourtCallMatchProvider).valueOrNull) ??
            ofTarget(ref.watch(athleteNextMatchProvider).valueOrNull);

    // Os cards do torneio trazem os nomes das duplas e a partida atualizada
    // (placar, status) — o mesmo stream que o Focus abre logo em seguida.
    TournamentMatchCardViewModel? card;
    if (picked != null) {
      final cards =
          ref.watch(tournamentMatchCardsProvider(tournamentId)).valueOrNull ??
              const <TournamentMatchCardViewModel>[];
      for (final c in cards) {
        if (c.match.id == picked.match.id) {
          card = c;
          break;
        }
      }
    }
    final match = card?.match ?? picked?.match;

    final registrations =
        ref.watch(athleteEventDayContextProvider).valueOrNull?.registrations ??
            const [];
    final myTeamIds = <String>{
      for (final r in registrations)
        if (r.tournamentId == tournamentId) r.teamId?.trim() ?? '',
    }..remove('');

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        bottomGap,
      ),
      child: AthleteHomeFocusCardBody(
        tournamentName: target.tournamentName,
        match: match,
        opponent: match == null ? null : _opponentOf(match, card, myTeamIds),
        onOpen: () => context.pushNamed(
          AppRouteNames.tournamentFocus,
          pathParameters: {'tournamentId': tournamentId},
        ),
      ),
    );
  }
}

TournamentMatchCardTeamViewModel? _opponentOf(
  TournamentMatch match,
  TournamentMatchCardViewModel? card,
  Set<String> myTeamIds,
) {
  // King of the Court não tem lado: "vs" uma dupla só seria mentira.
  if (!match.isDuel) return null;
  final iAmA = myTeamIds.contains(match.teamAId.trim());
  if (card != null) return iAmA ? card.teamB : card.teamA;
  final description =
      (iAmA ? match.teamBDescription : match.teamADescription)?.trim() ?? '';
  if (description.isEmpty) return null;
  return TournamentMatchCardTeamViewModel(
    displayName: description,
    players: const [],
  );
}

/// O card em si, sem providers: recebe a partida já escolhida.
@visibleForTesting
class AthleteHomeFocusCardBody extends StatelessWidget {
  const AthleteHomeFocusCardBody({
    super.key,
    required this.tournamentName,
    required this.match,
    required this.opponent,
    required this.onOpen,
  });

  final String tournamentName;
  final TournamentMatch? match;
  final TournamentMatchCardTeamViewModel? opponent;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final mode = homeFocusCardModeOf(match);
    final urgent =
        mode == HomeFocusCardMode.called || mode == HomeFocusCardMode.live;
    final accent = urgent ? AppColors.live : AppColors.brand;

    // Sempre escuro, como o próprio Focus: o card é a porta de entrada dele.
    return Container(
      key: ValueKey('home-focus-card-${mode.name}'),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: mode == HomeFocusCardMode.waiting
              ? Colors.white.withValues(alpha: 0.08)
              : accent.withValues(alpha: urgent ? 0.45 : 0.30),
        ),
        gradient: RadialGradient(
          center: urgent ? Alignment.topLeft : Alignment.topRight,
          radius: 1.3,
          // Com gradiente o `color` não pinta: o fundo opaco vem do fim dele.
          colors: [
            Color.alphaBlend(
              accent.withValues(alpha: urgent ? 0.26 : 0.18),
              AppColors.surfaceCard,
            ),
            AppColors.surfaceCard,
          ],
          stops: const [0, 0.6],
        ),
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(mode: mode, tournamentName: tournamentName),
          const SizedBox(height: 14),
          ...switch (mode) {
            HomeFocusCardMode.called => _called(match!),
            HomeFocusCardMode.live => _live(match!),
            HomeFocusCardMode.countdown ||
            HomeFocusCardMode.unscheduled =>
              _upcoming(match!, mode),
            HomeFocusCardMode.waiting => _waiting(),
          },
          const SizedBox(height: 14),
          _Cta(mode: mode, onPressed: onOpen),
        ],
      ),
    );
  }

  List<Widget> _called(TournamentMatch match) {
    final court = matchCourtLabelForCard(match);
    return [
      Text(
        court.isEmpty ? 'Vá para a quadra agora' : 'Vá para a $court agora',
        style: AppTypography.soraRegular(
          fontSize: 22,
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.4,
          height: 1.15,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        opponent == null
            ? 'A mesa chamou sua dupla. Confirme que está a caminho.'
            : 'A mesa chamou sua partida contra ${opponent!.displayName}.',
        style: _dim(13),
      ),
    ];
  }

  List<Widget> _live(TournamentMatch match) => [
        Text(
          'Sua partida está rolando',
          style: AppTypography.soraRegular(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: AppColors.onSurface,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 14),
        _OpponentRow(match: match, opponent: opponent),
      ];

  List<Widget> _upcoming(TournamentMatch match, HomeFocusCardMode mode) => [
        Text.rich(
          TextSpan(
            children: [
              const TextSpan(text: 'O '),
              TextSpan(
                text: 'Modo Focus',
                style: _dim(13).copyWith(
                  color: AppColors.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const TextSpan(
                text: ' deixa o app só com o que importa hoje: sua partida, a '
                    'quadra e as chamadas da mesa.',
              ),
            ],
          ),
          style: _dim(13),
        ),
        const SizedBox(height: 14),
        if (mode == HomeFocusCardMode.countdown)
          _Countdown(scheduleTime: match.scheduleTime!)
        else ...[
          Text('SUA PRÓXIMA PARTIDA', style: _eyebrow),
          const SizedBox(height: 6),
          Text(
            'Aguardando horário da mesa',
            style: AppTypography.soraRegular(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
              letterSpacing: -0.4,
            ),
          ),
        ],
        const SizedBox(height: 14),
        _OpponentRow(match: match, opponent: opponent, divider: true),
      ];

  List<Widget> _waiting() => [
        Text(
          'Sem partida marcada agora',
          style: AppTypography.soraRegular(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: AppColors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'O Modo Focus avisa quando a mesa chamar e mostra seu grupo e a '
          'chave ao vivo.',
          style: _dim(13),
        ),
      ];
}

TextStyle _dim(double size) => AppTypography.soraRegular(
      fontSize: size,
      fontWeight: FontWeight.w400,
      color: AppColors.onSurface.withValues(alpha: 0.6),
      height: 1.45,
    );

final TextStyle _eyebrow = AppTypography.eyebrow.copyWith(
  color: AppColors.onSurface.withValues(alpha: 0.45),
);

class _Header extends StatelessWidget {
  const _Header({required this.mode, required this.tournamentName});

  final HomeFocusCardMode mode;
  final String tournamentName;

  @override
  Widget build(BuildContext context) {
    final chip = switch (mode) {
      HomeFocusCardMode.called => const _Chip.live('CHAMADO PELA MESA'),
      HomeFocusCardMode.live => const _Chip.live('AO VIVO'),
      _ => const _Chip.brand('MODO FOCUS'),
    };
    return Row(
      children: [
        chip,
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            tournamentName.toUpperCase(),
            textAlign: TextAlign.right,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _eyebrow,
          ),
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip.brand(this.label) : live = false;
  const _Chip.live(this.label) : live = true;

  final String label;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final fg = live ? Colors.white : AppColors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: live ? AppColors.live : AppColors.brand.withValues(alpha: 0.10),
        borderRadius: AppRadii.pillAll,
        border: live
            ? null
            : Border.all(color: AppColors.brand.withValues(alpha: 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (live)
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
            )
          else
            Icon(Icons.local_fire_department_rounded, size: 13, color: fg),
          const SizedBox(width: 5),
          Text(label, style: AppTypography.eyebrow.copyWith(color: fg)),
        ],
      ),
    );
  }
}

/// "42:18" grande, batendo a cada segundo; atrasada vira "30 min" em palavras.
class _Countdown extends StatefulWidget {
  const _Countdown({required this.scheduleTime});

  final DateTime scheduleTime;

  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
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
    final now = DateTime.now();
    final clock = countdownClockOf(widget.scheduleTime, now);
    final spoken = countdownLabelOf(widget.scheduleTime, now) ?? '';
    final overdue = clock == null;
    final progress =
        overdue ? null : homeFocusFinalHourProgress(widget.scheduleTime, now);

    return Semantics(
      // O relógio muda a cada segundo; o leitor de tela ouve a frase.
      label: 'Sua próxima partida $spoken',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            overdue ? 'SUA PARTIDA ESTÁ ATRASADA' : 'SUA PRÓXIMA PARTIDA EM',
            style: _eyebrow,
          ),
          const SizedBox(height: 6),
          Text(
            overdue ? spoken.replaceFirst('atrasada ', '') : clock,
            style: AppTypography.mono(
              fontSize: overdue ? 30 : 42,
              fontWeight: FontWeight.w800,
              color: overdue ? AppColors.pending : AppColors.onSurface,
              letterSpacing: -0.8,
              height: 1,
            ),
          ),
          if (progress != null) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: AppRadii.pillAll,
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 4,
                color: AppColors.brand,
                backgroundColor: AppColors.brand.withValues(alpha: 0.18),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _OpponentRow extends StatelessWidget {
  const _OpponentRow({
    required this.match,
    required this.opponent,
    this.divider = false,
  });

  final TournamentMatch match;
  final TournamentMatchCardTeamViewModel? opponent;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final meta = homeFocusMatchMeta(match);
    final players = opponent?.players ?? const [];
    return Container(
      padding: EdgeInsets.only(top: divider ? 12 : 0),
      decoration: divider
          ? BoxDecoration(
              border: Border(
                top: BorderSide(color: Colors.white.withValues(alpha: 0.07)),
              ),
            )
          : null,
      child: Row(
        children: [
          if (players.isNotEmpty) ...[
            NexaDuoAvatars(players: players, size: 30),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  opponent == null
                      ? 'Adversário a definir'
                      : 'vs ${opponent!.displayName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurface,
                  ),
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: _dim(12),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Cta extends StatelessWidget {
  const _Cta({required this.mode, required this.onPressed});

  final HomeFocusCardMode mode;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final (label, background) = switch (mode) {
      HomeFocusCardMode.called => ('ESTOU INDO', AppColors.live),
      HomeFocusCardMode.live => ('ABRIR MODO FOCUS', AppColors.brand),
      HomeFocusCardMode.waiting => ('ABRIR MODO FOCUS', null),
      _ => ('ENTRAR NO FOCUS', AppColors.brand),
    };
    final ghost = background == null;
    return SizedBox(
      height: 48,
      child: FilledButton.icon(
        key: const Key('home-focus-card-cta'),
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: background ?? Colors.white.withValues(alpha: 0.05),
          foregroundColor: Colors.white,
          side: ghost
              ? BorderSide(color: Colors.white.withValues(alpha: 0.10))
              : null,
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
        ),
        icon: Icon(
          Icons.local_fire_department_rounded,
          size: 18,
          color: ghost ? AppColors.brand : Colors.white,
        ),
        label: Text(
          label,
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
