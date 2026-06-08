import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_uniform_selection.dart';
import 'widgets/tournament_registration/tournament_registration_uniform_step.dart';

enum _PartnerInviteWizardStep { confirm, uniform }

class TournamentPartnerInvitePage extends ConsumerStatefulWidget {
  const TournamentPartnerInvitePage({super.key, required this.inviteId});

  final String inviteId;

  @override
  ConsumerState<TournamentPartnerInvitePage> createState() =>
      _TournamentPartnerInvitePageState();
}

class _TournamentPartnerInvitePageState
    extends ConsumerState<TournamentPartnerInvitePage> {
  _PartnerInviteWizardStep _wizardStep = _PartnerInviteWizardStep.confirm;
  bool _accepting = false;
  bool _declining = false;
  TournamentUniformSelection _inviteeUniform = const TournamentUniformSelection(
    sizeTop: 'M',
    jerseyNumber: 10,
    sizeShorts: 'M',
  );

  TournamentCategoryOffer? _categoryForInvite(
    TournamentDetail? tournament,
    TournamentPartnerInvite invite,
  ) {
    if (tournament == null) return null;
    for (final c in tournament.categoryOffers) {
      if (c.id == invite.categoryId) return c;
    }
    return null;
  }

  void _initUniformForCategory(TournamentCategoryOffer category) {
    final tops = uniformSizeOptionsTopForCategory(category);
    final shorts = uniformSizeOptionsShortsForCategory(category);
    _inviteeUniform = TournamentUniformSelection(
      sizeTop: tops.contains('M') ? 'M' : tops.first,
      sizeShorts: categoryRequiresShorts(category)
          ? (shorts.contains('M') ? 'M' : shorts.first)
          : null,
      jerseyNumber: category.uniformNumberOnShirt ? 10 : null,
    );
  }

  void _showProfileAccessBlocked() {
    final access = ref.read(tournamentAccessStateProvider);
    final message = access.snackbarMessage;
    if (message != null && mounted) {
      showAppSnackBar(context, message, isError: true);
    }
  }

  Future<void> _acceptInvite({
    required TournamentPartnerInvite invite,
    TournamentCategoryOffer? category,
  }) async {
    if (_accepting) return;

    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }

    setState(() => _accepting = true);

    try {
      final uid = ref.read(authProvider).valueOrNull?.uid;
      if (uid == null || uid.isEmpty) {
        if (!mounted) return;
        showAppSnackBar(
          context,
          'Faça login para aceitar o convite.',
          isError: true,
        );
        return;
      }

      final result = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .acceptInvite(
            widget.inviteId,
            inviteeUniform: category != null &&
                    categoryRequiresUniform(category)
                ? _inviteeUniform
                : null,
          );

      if (!mounted) return;
      showAppSnackBar(context, 'Convite aceito! Sua dupla está formada.');

      context.goNamed(
        AppRouteNames.tournamentRegistration,
        pathParameters: {'tournamentId': result.tournamentId},
        queryParameters: {
          'registrationId': result.registrationId,
          'categoryId': result.categoryId,
          'inviteId': widget.inviteId,
          'step': 'waiting',
        },
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível aceitar o convite.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }

  void _onContinueFromConfirm({
    required TournamentPartnerInvite invite,
    required TournamentCategoryOffer? category,
  }) {
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    if (category != null && categoryRequiresUniform(category)) {
      _initUniformForCategory(category);
      setState(() => _wizardStep = _PartnerInviteWizardStep.uniform);
      return;
    }
    unawaited(_acceptInvite(invite: invite, category: category));
  }

  void _onContinueFromUniform({
    required TournamentPartnerInvite invite,
    required TournamentCategoryOffer category,
  }) {
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    final error = validateUniformSelection(
      category: category,
      selection: _inviteeUniform,
    );
    if (error != null) {
      showAppSnackBar(context, error, isError: true);
      return;
    }
    unawaited(_acceptInvite(invite: invite, category: category));
  }

  Future<void> _decline() async {
    if (_declining) return;
    setState(() => _declining = true);

    try {
      await ref.read(tournamentPartnerInviteServiceProvider).cancelInvite(
            widget.inviteId,
            asDecline: true,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Convite recusado.');
      context.pop();
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _declining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inviteAsync = ref.watch(tournamentPartnerInviteProvider(widget.inviteId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: context.themeColors.canvas,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (_wizardStep == _PartnerInviteWizardStep.uniform) {
              setState(() => _wizardStep = _PartnerInviteWizardStep.confirm);
            } else {
              context.pop();
            }
          },
        ),
        title: Text(
          _wizardStep == _PartnerInviteWizardStep.uniform
              ? 'Seu uniforme'
              : 'Convite de dupla',
        ),
      ),
      body: inviteAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (_, __) => const _MessageBody(
          message: 'Não foi possível carregar o convite.',
        ),
        data: (invite) {
          if (invite == null) {
            return const _MessageBody(message: 'Convite não encontrado.');
          }
          if (invite.isExpired) {
            return const _MessageBody(message: 'Este convite expirou.');
          }
          if (invite.isAccepted) {
            return _MessageBody(
              message: 'Convite já aceito.',
              actionLabel: 'Ir para inscrição',
              onAction: () {
                final regId = invite.registrationId;
                if (regId == null || regId.isEmpty) return;
                context.goNamed(
                  AppRouteNames.tournamentRegistration,
                  pathParameters: {'tournamentId': invite.tournamentId},
                  queryParameters: {
                    'registrationId': regId,
                    'categoryId': invite.categoryId,
                    'inviteId': invite.id,
                    'step': 'waiting',
                  },
                );
              },
            );
          }
          if (invite.isDeclined || invite.isCancelled) {
            return const _MessageBody(
              message: 'Este convite não está mais disponível.',
            );
          }

          final tournamentAsync =
              ref.watch(tournamentDetailProvider(invite.tournamentId));

          return tournamentAsync.when(
            loading: () => Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
            error: (_, __) => _buildWizard(
              invite: invite,
              tournament: null,
              category: null,
            ),
            data: (tournament) {
              final category = _categoryForInvite(tournament, invite);
              return _buildWizard(
                invite: invite,
                tournament: tournament,
                category: category,
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildWizard({
    required TournamentPartnerInvite invite,
    required TournamentDetail? tournament,
    required TournamentCategoryOffer? category,
  }) {
    final access = ref.watch(tournamentAccessStateProvider);
    final profileGate = !access.canAccess
        ? Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: TournamentAccessBanner(
              onboardingCompleted: access.onboardingCompleted,
              blockMessage: access.blockMessage,
              missingStepTitles: access.missingStepTitles,
            ),
          )
        : null;

    if (_wizardStep == _PartnerInviteWizardStep.uniform &&
        tournament != null &&
        category != null) {
      return Column(
        children: [
          if (profileGate != null) profileGate,
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              child: access.canAccess
                  ? TournamentRegistrationUniformStep(
                tournament: tournament,
                category: category,
                selection: _inviteeUniform,
                leagueBadge: tournament.name.toUpperCase(),
                onChanged: (v) => setState(() => _inviteeUniform = v),
              )
                  : const SizedBox.shrink(),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: FilledButton(
                onPressed: !access.canAccess || _accepting
                    ? null
                    : () => _onContinueFromUniform(
                          invite: invite,
                          category: category,
                        ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  minimumSize: const Size.fromHeight(52),
                ),
                child: _accepting
                    ? SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        'Confirmar e formar dupla',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        if (profileGate != null) profileGate,
        Expanded(
          child: _InviteContent(
            invite: invite,
            tournamentName: tournament?.name ?? 'Torneio',
            accepting: _accepting,
            declining: _declining,
            canAccept: access.canAccess,
            onContinue: () => _onContinueFromConfirm(
              invite: invite,
              category: category,
            ),
            onDecline: _decline,
            continueLabel: category != null && categoryRequiresUniform(category)
                ? 'Continuar'
                : 'Aceitar convite',
          ),
        ),
      ],
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.themeColors.onSurfaceMuted),
            ),
            if (actionLabel != null && onAction != null) ...[
              SizedBox(height: 24),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class _InviteContent extends StatelessWidget {
  const _InviteContent({
    required this.invite,
    required this.tournamentName,
    required this.accepting,
    required this.declining,
    required this.canAccept,
    required this.onContinue,
    required this.onDecline,
    required this.continueLabel,
  });

  final TournamentPartnerInvite invite;
  final String tournamentName;
  final bool accepting;
  final bool declining;
  final bool canAccept;
  final VoidCallback onContinue;
  final VoidCallback onDecline;
  final String continueLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inviterFirst = invite.inviterName.split(' ').first;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tournamentName,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Categoria: ${invite.categoryId}',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          SizedBox(height: 24),
          Text(
            '$inviterFirst convidou você para formar dupla neste torneio.',
            style: theme.textTheme.titleMedium?.copyWith(
              color: context.themeColors.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 12),
          Text(
            'Confirme a dupla e escolha seu uniforme. Depois vocês poderão pagar cada um sua parcela.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.45,
            ),
          ),
          Spacer(),
          FilledButton(
            onPressed: !canAccept || accepting || declining ? null : onContinue,
            child: accepting
                ? SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(continueLabel),
          ),
          SizedBox(height: 12),
          OutlinedButton(
            onPressed: accepting || declining ? null : onDecline,
            child: declining
                ? SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text('Recusar'),
          ),
        ],
      ),
    );
  }
}
