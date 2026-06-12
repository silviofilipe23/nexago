import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/team_discover_models.dart';
import '../../../domain/team_discover_providers.dart';
import '../../../domain/team_follow_logic.dart';
import '../../../domain/team_follow_providers.dart';
import '../../../domain/tournament_team.dart';

class TeamFollowButton extends ConsumerStatefulWidget {
  const TeamFollowButton({
    super.key,
    required this.entry,
    this.followLabel = 'Seguir',
    this.followingLabel = 'Seguindo',
    this.height = 44,
    this.borderRadius = 12,
    this.compact = true,
  });

  final TeamDiscoverEntry entry;
  final String followLabel;
  final String followingLabel;
  final double height;
  final double borderRadius;
  final bool compact;

  @override
  ConsumerState<TeamFollowButton> createState() => _TeamFollowButtonState();
}

class _TeamFollowButtonState extends ConsumerState<TeamFollowButton>
    with SingleTickerProviderStateMixin {
  var _loading = false;
  var _pressed = false;
  late final AnimationController _pressController;
  late final Animation<double> _pressScale;

  @override
  void initState() {
    super.initState();
    _pressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
    );
    _pressScale = Tween<double>(begin: 1, end: 0.97).animate(
      CurvedAnimation(parent: _pressController, curve: Curves.easeOutCubic),
    );
  }

  @override
  void dispose() {
    _pressController.dispose();
    super.dispose();
  }

  bool get _animationsEnabled {
    final media = MediaQuery.maybeOf(context);
    return media == null || !media.disableAnimations;
  }

  void _setPressed(bool value) {
    if (!_animationsEnabled || _loading) return;
    if (_pressed == value) return;
    setState(() => _pressed = value);
    if (value) {
      _pressController.forward();
    } else {
      _pressController.reverse();
    }
  }

  Future<void> _toggle() async {
    if (widget.entry.isCurrentUserTeam || _loading) return;

    final uid = ref.read(authProvider).valueOrNull?.uid.trim();
    if (uid == null || uid.isEmpty) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para seguir duplas.');
      return;
    }

    if (!canFollowTeam(widget.entry.team, uid)) return;

    final follow = !widget.entry.isFollowing;
    ref
        .read(teamDiscoverProvider.notifier)
        .updateFollowing(widget.entry.teamId, follow);
    setState(() => _loading = true);
    try {
      await ref.read(teamFollowServiceProvider).setTeamFollowing(
            followerId: uid,
            team: widget.entry.team,
            follow: follow,
          );
      if (mounted && _animationsEnabled) {
        HapticFeedback.lightImpact();
      }
    } catch (e) {
      ref
          .read(teamDiscoverProvider.notifier)
          .updateFollowing(widget.entry.teamId, !follow);
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível atualizar o follow.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.entry.isCurrentUserTeam) {
      return const SizedBox.shrink();
    }

    final following = widget.entry.isFollowing;
    final bgColor = following
        ? context.themeColors.surfaceRaised
        : AppColors.brand;
    final fgColor = following
        ? context.themeColors.onSurfaceMuted
        : AppColors.black;

    return GestureDetector(
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: _loading ? null : _toggle,
      child: ScaleTransition(
        scale: _animationsEnabled ? _pressScale : const AlwaysStoppedAnimation(1),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          height: widget.height,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(widget.borderRadius),
          ),
          padding: EdgeInsets.symmetric(
            horizontal: widget.compact ? 16 : 20,
          ),
          child: Center(
            child: _loading
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: fgColor,
                    ),
                  )
                : AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (child, animation) {
                      return FadeTransition(opacity: animation, child: child);
                    },
                    child: Text(
                      following ? widget.followingLabel : widget.followLabel,
                      key: ValueKey(following),
                      style: AppTypography.soraRegular(
                        fontSize: widget.compact ? 14 : 15,
                        fontWeight: FontWeight.w900,
                        color: fgColor,
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

/// Botão de follow para o perfil público da dupla (sem estado do discover).
class TeamProfileFollowButton extends ConsumerStatefulWidget {
  const TeamProfileFollowButton({
    super.key,
    required this.teamId,
    required this.team,
    required this.isFollowing,
    required this.isCurrentUserTeam,
    this.followLabel = 'Seguir dupla',
    this.followingLabel = 'Seguindo',
    this.onFollowStateChanged,
  });

  final String teamId;
  final TournamentTeam team;
  final bool isFollowing;
  final bool isCurrentUserTeam;
  final String followLabel;
  final String followingLabel;
  final VoidCallback? onFollowStateChanged;

  @override
  ConsumerState<TeamProfileFollowButton> createState() =>
      _TeamProfileFollowButtonState();
}

class _TeamProfileFollowButtonState
    extends ConsumerState<TeamProfileFollowButton>
    with SingleTickerProviderStateMixin {
  var _loading = false;
  var _pressed = false;
  late final AnimationController _pressController;
  late final Animation<double> _pressScale;
  late bool _following;

  @override
  void initState() {
    super.initState();
    _following = widget.isFollowing;
    _pressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
    );
    _pressScale = Tween<double>(begin: 1, end: 0.97).animate(
      CurvedAnimation(parent: _pressController, curve: Curves.easeOutCubic),
    );
  }

  @override
  void didUpdateWidget(covariant TeamProfileFollowButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isFollowing != widget.isFollowing && !_loading) {
      _following = widget.isFollowing;
    }
  }

  @override
  void dispose() {
    _pressController.dispose();
    super.dispose();
  }

  bool get _animationsEnabled {
    final media = MediaQuery.maybeOf(context);
    return media == null || !media.disableAnimations;
  }

  void _setPressed(bool value) {
    if (!_animationsEnabled || _loading) return;
    if (_pressed == value) return;
    setState(() => _pressed = value);
    if (value) {
      _pressController.forward();
    } else {
      _pressController.reverse();
    }
  }

  Future<void> _toggle() async {
    if (widget.isCurrentUserTeam || _loading) return;

    final uid = ref.read(authProvider).valueOrNull?.uid.trim();
    if (uid == null || uid.isEmpty) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para seguir duplas.');
      return;
    }

    final team = widget.team;
    if (!canFollowTeam(team, uid)) return;

    final follow = !_following;
    setState(() {
      _loading = true;
      _following = follow;
    });
    try {
      await ref.read(teamFollowServiceProvider).setTeamFollowing(
            followerId: uid,
            team: team,
            follow: follow,
          );
      if (mounted && _animationsEnabled) {
        HapticFeedback.lightImpact();
      }
      widget.onFollowStateChanged?.call();
    } catch (e) {
      if (mounted) {
        setState(() => _following = !follow);
        showAppSnackBar(context, 'Não foi possível atualizar o follow.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isCurrentUserTeam) return const SizedBox.shrink();

    final bgColor = _following
        ? context.themeColors.surfaceRaised
        : AppColors.brand;
    final fgColor = _following
        ? context.themeColors.onSurfaceMuted
        : AppColors.black;

    return GestureDetector(
      onTapDown: (_) => _setPressed(true),
      onTapUp: (_) => _setPressed(false),
      onTapCancel: () => _setPressed(false),
      onTap: _loading ? null : _toggle,
      child: ScaleTransition(
        scale: _animationsEnabled ? _pressScale : const AlwaysStoppedAnimation(1),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          height: 48,
          width: double.infinity,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Center(
            child: _loading
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: fgColor,
                    ),
                  )
                : AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (child, animation) {
                      return FadeTransition(opacity: animation, child: child);
                    },
                    child: Text(
                      _following ? widget.followingLabel : widget.followLabel,
                      key: ValueKey(_following),
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: fgColor,
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
