import 'dart:async';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/deep_link/deep_link_providers.dart';
import '../../../core/router/routes.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/ui/feedback/show_feedback_page.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/category_level_eligibility.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_partner_invite_ui_logic.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_uniform_selection.dart';
import 'widgets/tournament_partner_invite/partner_invite_bottom_actions.dart';
import 'widgets/tournament_partner_invite_error_feedback.dart';
import 'widgets/tournament_partner_invite/partner_invite_hero_card.dart';
import 'widgets/tournament_partner_invite/partner_invite_metrics_row.dart';
import 'widgets/lgpd_consent_sheet.dart';
import 'widgets/tournament_partner_invite/partner_invite_tournament_card.dart';
import 'widgets/tournament_registration/level_confirmation_sheet.dart';
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
  /// Aceite do termo de uso de imagem/LGPD já confirmado nesta tela.
  bool _lgpdAccepted = false;
  TournamentUniformSelection _inviteeUniform = const TournamentUniformSelection(
    sizeTop: 'M',
    jerseyNumber: 10,
    sizeShorts: 'M',
  );
  bool _inviteRememberedForOnboarding = false;

  /// `markSubstitutionInviteViewed` só pode ser chamado UMA vez por sessão de
  /// tela — é o read-receipt do "Lembrar" na tela de acompanhamento
  /// (Task 6), não algo pra regravar a cada rebuild do `watchInvite`.
  bool _viewedMarked = false;

  @override
  void initState() {
    super.initState();
    // Cadastro inicial incompleto: o banner manda pro onboarding, e o fim do
    // onboarding retoma o deep link pendente — sem isto o atleta concluía o
    // cadastro e caía na home, perdendo o convite de novo.
    ref.listenManual<TournamentAccessState>(
      tournamentAccessStateProvider,
      fireImmediately: true,
      (previous, access) {
        if (_inviteRememberedForOnboarding) return;
        if (access.isLoading ||
            access.canAccess ||
            access.onboardingCompleted) {
          return;
        }
        _inviteRememberedForOnboarding = true;
        // Microtask: fireImmediately dispara ainda no initState, e mutar
        // provider durante o build é proibido pelo Riverpod.
        Future.microtask(() {
          if (!mounted) return;
          ref.read(pendingDeepLinkPathProvider.notifier).state = AppRoutes
              .tournamentPartnerInvite
              .replaceAll(':inviteId', widget.inviteId);
        });
      },
    );
  }

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

  /// Última chance de revisar o nível antes de travar o ratchet "nível só
  /// sobe" (plano de calibração de nível, Task 6) — mesma regra e mesma
  /// sheet do passo 1 do wizard (`registration_category_page.dart`, método
  /// `_advance`), aplicada aqui porque aceitar um convite TAMBÉM pode ser
  /// a 1ª inscrição ativa do atleta naquele esporte. Retorna false se não
  /// confirmou (fechou o sheet ou pediu para ajustar o nível — nesse caso já
  /// navega para "Esportes e níveis"); `_acceptInvite` NÃO deve chamar
  /// `acceptInvite` nesse caso.
  ///
  /// Usa `resolveLevelConfirmationPromptForTournament` com
  /// `athleteProfileProvider.future` (não `.valueOrNull`) E o torneio buscado
  /// FRESCO por `tournamentId` (não o `TournamentDetail?` já resolvido pela
  /// árvore de widgets) — fix pós-review (F2): no branch de ERRO de
  /// `tournamentAsync.when(...)` no `build()`, `_buildWizard` é chamado com
  /// `tournament: null`, e passar isso direto pra cá fazia
  /// `needsLevelConfirmation` tratar "não sei o esporte" como "esporte sem
  /// equivalente no perfil" — pulava a confirmação em SILÊNCIO exatamente no
  /// aceite que pode travar a janela. Perfil (ou torneio) ainda carregando
  /// também não pode virar "sem perfil"/"sem esporte" — isso faria o gate
  /// pular em silêncio. Erro em qualquer um dos dois bloqueia a aceitação
  /// com o aviso genérico já usado pelas outras ações desta tela.
  Future<bool> _ensureLevelConfirmed(String tournamentId) async {
    final LevelConfirmationPrompt? prompt;
    try {
      prompt = await CategoryLevelEligibility
          .resolveLevelConfirmationPromptForTournament(
            ref.read(athleteProfileProvider.future),
            ref
                .read(tournamentDetailProvider(tournamentId).future)
                .then((t) => t?.sport),
          );
    } catch (_) {
      if (!mounted) return false;
      showAppSnackBar(
        context,
        'Não foi possível confirmar seu nível. Tente novamente.',
        isError: true,
      );
      return false;
    }
    if (!mounted) return false;
    if (prompt == null) return true;
    final confirmed = await showLevelConfirmationSheet(
      context,
      levelLabel: prompt.levelLabel,
      sportLabel: prompt.sportLabel,
    );
    if (!mounted) return false;
    if (confirmed != true) {
      if (confirmed == false) {
        context.pushNamed(AppRouteNames.athleteSportsLevels);
      }
      return false;
    }
    return true;
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

    // Termo de uso de imagem/LGPD obrigatório antes de formar a dupla.
    if (!_lgpdAccepted) {
      final accepted = await showLgpdConsentSheet(context);
      if (!accepted || !mounted) return;
      setState(() => _lgpdAccepted = true);
    }

    // Aceitar um convite é, para quem convidou, uma das duas formas de
    // ativar a inscrição (a outra é `_registerSolo` na tela de inscrição) —
    // `acceptTournamentPartnerInvite` é nomeada no trigger de backend
    // (`tournament-level-lock.ts`) como caminho que trava `levelLocked` na
    // 1ª inscrição ATIVA do esporte. Sem este gate aqui, quem entra numa
    // dupla via convite nunca via o último aviso (achado do review, C1).
    if (!await _ensureLevelConfirmed(invite.tournamentId)) return;

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
            inviteeUniform:
                category != null && categoryRequiresUniform(category)
                ? _inviteeUniform
                : null,
            lgpdAccepted: true,
          );

      if (!mounted) return;
      await pushSuccessFeedback(
        context,
        title: 'Convite aceito!',
        description: 'Sua dupla está formada. Conclua o pagamento da inscrição.',
        primaryAction: FeedbackAction(
          label: 'Continuar inscrição',
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
      if (!mounted) return;

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
      await showTournamentPartnerInviteError(context, e);
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
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelInvite(widget.inviteId, asDecline: true);
      if (!mounted) return;
      await pushInfoFeedback(
        context,
        title: 'Convite recusado',
        description: 'O organizador será notificado.',
        primaryAction: FeedbackAction(
          label: 'Voltar',
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
      if (!mounted) return;
      context.pop();
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } finally {
      if (mounted) setState(() => _declining = false);
    }
  }

  /// Read-receipt do convite de substituição: dispara `markSubstitutionInviteViewed`
  /// a 1ª vez que o CONVIDADO abre um convite pendente — a tela de
  /// acompanhamento (Task 6) usa isso pra mostrar "visualizado há X min" pro
  /// convidante. Fire-and-forget: nunca pode quebrar a tela do convite, então
  /// falha (rede, rate limit, o que for) é engolida em silêncio.
  void _maybeMarkViewed(TournamentPartnerInvite? invite) {
    if (_viewedMarked || invite == null) return;
    if (!invite.isSubstitutionInvite || !invite.isPending) return;
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid != invite.inviteeUid) return;
    _viewedMarked = true;
    ref
        .read(tournamentPartnerInviteServiceProvider)
        .markSubstitutionInviteViewed(invite.id)
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final inviteAsync = ref.watch(
      tournamentPartnerInviteProvider(widget.inviteId),
    );
    // `ref.listen` cobre mudanças depois do 1º frame; a chamada direta
    // abaixo cobre o caso do 1º valor já chegar pronto (mesma dupla
    // checagem de `TournamentInviteAnnouncer._maybeAnnounce`).
    ref.listen<AsyncValue<TournamentPartnerInvite?>>(
      tournamentPartnerInviteProvider(widget.inviteId),
      (previous, next) => _maybeMarkViewed(next.valueOrNull),
    );
    _maybeMarkViewed(inviteAsync.valueOrNull);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        forceMaterial: true,
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        elevation: 0,
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
        centerTitle: false,
        titleSpacing: 8,
        title: Text(
          _wizardStep == _PartnerInviteWizardStep.uniform
              ? 'Seu uniforme'
              : 'Convite de dupla',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
            height: 1.1,
          ),
        ),
      ),
      body: inviteAsync.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: AppColors.brand)),
        error: (_, __) =>
            const _MessageBody(message: 'Não foi possível carregar o convite.'),
        data: (invite) {
          if (invite == null) {
            return const _MessageBody(message: 'Convite não encontrado.');
          }
          if (invite.isExpired) {
            return FeedbackPage.alert(
              title: 'Convite expirado',
              description: 'Peça um novo convite ao seu parceiro.',
              primaryAction: FeedbackAction(
                label: 'Voltar',
                onPressed: () => context.pop(),
              ),
            );
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
            return FeedbackPage.info(
              title: 'Convite indisponível',
              description: 'Este convite não está mais disponível.',
              primaryAction: FeedbackAction(
                label: 'Voltar',
                onPressed: () => context.pop(),
              ),
            );
          }

          final tournamentAsync = ref.watch(
            tournamentDetailProvider(invite.tournamentId),
          );

          return tournamentAsync.when(
            loading: () => Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
            error: (_, __) =>
                _buildWizard(invite: invite, tournament: null, category: null),
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
              clipBehavior: Clip.hardEdge,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
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
                        invite.isSubstitutionInvite
                            ? 'Confirmar e entrar na vaga'
                            : 'Confirmar e formar dupla',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ),
        ],
      );
    }

    final continueLabel = category != null && categoryRequiresUniform(category)
        ? 'Continuar'
        : invite.isSubstitutionInvite
            ? 'Aceitar e entrar na vaga'
            : 'Aceitar e formar dupla';

    final inviterProfile = ref
        .watch(athleteProfileByIdProvider(invite.inviterUid))
        .valueOrNull;
    final inviteeProfile = ref.watch(athleteProfileProvider).valueOrNull;

    final inviterInitials = inviterProfile != null
        ? athleteInitials(inviterProfile)
        : _initialsFromName(invite.inviterName);
    final inviteeInitials = inviteeProfile != null
        ? athleteInitials(inviteeProfile)
        : _initialsFromName(invite.inviteeName);

    return Column(
      children: [
        if (profileGate != null) profileGate,
        Expanded(
          child: SingleChildScrollView(
            clipBehavior: Clip.hardEdge,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (invite.isSubstitutionInvite) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      'Convite de substituição — você entraria no lugar de '
                      '${invite.replacedName ?? 'um atleta'}'
                      '${invite.teamName != null ? ' na equipe ${invite.teamName}' : ''}. '
                      'A vaga (e o pagamento dela) passa a ser sua ao aceitar.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurface,
                            height: 1.4,
                          ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                PartnerInviteHeroCard(
                  inviterName: invite.inviterName,
                  inviterInitials: inviterInitials,
                  inviterAvatarUrl: inviterProfile?.avatarUrl,
                  inviteeInitials: inviteeInitials,
                  inviteeAvatarUrl: inviteeProfile?.avatarUrl,
                ),
                const SizedBox(height: 12),
                PartnerInviteMetricsRow(
                  prizeLabel: partnerInvitePrizeLabel(category),
                  shareFeeLabel: partnerInviteShareFeeLabel(category),
                ),
                const SizedBox(height: 12),
                PartnerInviteTournamentCard(
                  tournamentName: tournament?.name ?? 'Torneio',
                  categoryBadge: category != null
                      ? partnerInviteCategoryBadge(category)
                      : invite.categoryId,
                  dateLabel: tournament != null
                      ? partnerInviteCompactDate(tournament)
                      : '',
                  locationLabel: tournament?.location.trim() ?? '',
                  imageUrl: tournament?.imageUrl,
                ),
              ],
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: PartnerInviteBottomActions(
              primaryLabel: continueLabel,
              enabled: access.canAccess,
              primaryLoading: _accepting,
              declineLoading: _declining,
              onPrimary: () => _onContinueFromConfirm(
                invite: invite,
                category: category,
              ),
              onDecline: _decline,
            ),
          ),
        ),
      ],
    );
  }

  static String _initialsFromName(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) {
      final p = parts.first;
      return p.length >= 2 ? p.substring(0, 2).toUpperCase() : p.toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({required this.message, this.actionLabel, this.onAction});

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
