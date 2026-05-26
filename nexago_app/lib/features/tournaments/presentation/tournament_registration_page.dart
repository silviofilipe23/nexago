import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../data/tournament_registration_service.dart';
import '../domain/tournament_detail_logic.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_registration_providers.dart';
import 'widgets/tournament_registration/tournament_registration_category_card.dart';
import 'widgets/tournament_registration/tournament_registration_header.dart';
import 'widgets/tournament_registration/tournament_registration_hero_card.dart';
import 'widgets/tournament_registration/tournament_registration_partner_step.dart';
import 'widgets/tournament_registration/tournament_registration_payment_step.dart';
import 'widgets/tournament_registration/tournament_registration_price_summary.dart';
import 'widgets/tournament_registration/tournament_registration_sticky_bar.dart';
import 'widgets/tournament_registration/tournament_registration_waiting_step.dart';

class TournamentRegistrationPage extends ConsumerStatefulWidget {
  const TournamentRegistrationPage({
    super.key,
    required this.tournamentId,
    this.initialCategoryId,
    this.initialRegistrationId,
    this.initialStep,
  });

  final String tournamentId;
  final String? initialCategoryId;
  final String? initialRegistrationId;
  final TournamentRegistrationStep? initialStep;

  @override
  ConsumerState<TournamentRegistrationPage> createState() =>
      _TournamentRegistrationPageState();
}

class _TournamentRegistrationPageState
    extends ConsumerState<TournamentRegistrationPage> {
  TournamentRegistrationStep _step = TournamentRegistrationStep.category;
  TournamentCategoryOffer? _category;
  String? _partnerUserId;
  TournamentRegistrationPartnerCandidate? _selectedPartner;
  String? _inviteId;
  String? _registrationId;
  bool _submitting = false;
  bool _appliedInitialCategory = false;
  bool _appliedInitialRegistration = false;
  bool _paidPopHandled = false;

  @override
  void initState() {
    super.initState();
    final regId = widget.initialRegistrationId?.trim();
    if (regId != null && regId.isNotEmpty) {
      _registrationId = regId;
      _step = widget.initialStep ?? TournamentRegistrationStep.payment;
    }
  }

  void _scheduleInitialCategory(List<TournamentCategoryOffer> categories) {
    if (_appliedInitialCategory) return;
    final id = widget.initialCategoryId?.trim();
    if (id == null || id.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _appliedInitialCategory) return;
      TournamentCategoryOffer? match;
      for (final c in categories) {
        if (c.id == id) {
          match = c;
          break;
        }
      }
      if (match == null || !isCategorySelectable(match)) return;
      setState(() {
        _appliedInitialCategory = true;
        _category = match;
        if (_registrationId == null) {
          _step = TournamentRegistrationStep.summary;
        }
      });
    });
  }

  void _scheduleInitialRegistration(List<TournamentCategoryOffer> categories) {
    if (_appliedInitialRegistration) return;
    final regId = _registrationId;
    if (regId == null || regId.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _appliedInitialRegistration) return;
      final categoryId = widget.initialCategoryId?.trim();
      if (categoryId != null && categoryId.isNotEmpty) {
        for (final c in categories) {
          if (c.id == categoryId) {
            setState(() {
              _appliedInitialRegistration = true;
              _category = c;
            });
            return;
          }
        }
      }
      setState(() => _appliedInitialRegistration = true);
    });
  }

  void _selectCategory(TournamentCategoryOffer category) {
    setState(() => _category = category);
  }

  void _goToStep(TournamentRegistrationStep step) {
    setState(() => _step = step);
  }

  void _handleBack() {
    switch (_step) {
      case TournamentRegistrationStep.category:
        context.pop();
      case TournamentRegistrationStep.summary:
        _goToStep(TournamentRegistrationStep.category);
      case TournamentRegistrationStep.partner:
        _goToStep(TournamentRegistrationStep.summary);
      case TournamentRegistrationStep.waiting:
        _goToStep(TournamentRegistrationStep.partner);
      case TournamentRegistrationStep.payment:
        if (_inviteId != null) {
          _goToStep(TournamentRegistrationStep.waiting);
        } else {
          context.pop();
        }
    }
  }

  Future<void> _sendInvite(TournamentDetail tournament) async {
    final cat = _category;
    final partner = _selectedPartner;
    if (cat == null || partner == null) return;

    final athlete = _athleteDisplay();
    setState(() => _submitting = true);

    try {
      final inviteService = ref.read(tournamentPartnerInviteServiceProvider);
      final inviteId = await inviteService.sendInvite(
        tournamentId: tournament.id,
        categoryId: cat.id,
        inviteeUid: partner.userId,
        inviteeName: partner.name,
        inviterName: athlete.name,
      );
      if (!mounted) return;
      setState(() {
        _inviteId = inviteId;
        _step = TournamentRegistrationStep.waiting;
      });
      showAppSnackBar(
        context,
        'Convite enviado para ${partner.name.split(' ').first}.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível enviar o convite. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancelInvite() async {
    final id = _inviteId;
    if (id == null || id.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref.read(tournamentPartnerInviteServiceProvider).cancelInvite(id);
      if (!mounted) return;
      showAppSnackBar(context, 'Convite cancelado.');
      setState(() {
        _inviteId = null;
        _registrationId = null;
        _step = TournamentRegistrationStep.partner;
      });
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _handleStickyAction({
    required TournamentDetail tournament,
    required bool canAccess,
    required bool inviteAccepted,
  }) {
    switch (_step) {
      case TournamentRegistrationStep.category:
        if (_category != null) {
          _goToStep(TournamentRegistrationStep.summary);
        }
      case TournamentRegistrationStep.summary:
        _goToStep(TournamentRegistrationStep.partner);
      case TournamentRegistrationStep.partner:
        if (_partnerUserId != null && !_submitting) {
          _sendInvite(tournament);
        }
      case TournamentRegistrationStep.waiting:
        if (registrationWaitingCanProceed(
          inviteAccepted: inviteAccepted,
          registrationId: _registrationId,
        )) {
          _goToStep(TournamentRegistrationStep.payment);
        }
      case TournamentRegistrationStep.payment:
        if (canAccess && !_submitting && _registrationId != null) {
          _submitPayment();
        }
    }
  }

  ({bool enabled, String ctaLabel, String? metaLabel, String? totalLabel})
      _stickyConfig({
    required TournamentRegistrationQuote? quote,
    required bool inviteAccepted,
    required bool isFullyPaid,
  }) {
    switch (_step) {
      case TournamentRegistrationStep.category:
        return (
          enabled: _category != null,
          ctaLabel: 'Continuar',
          metaLabel: null,
          totalLabel: null,
        );
      case TournamentRegistrationStep.summary:
        return (
          enabled: _category != null,
          ctaLabel: 'Escolher parceiro',
          metaLabel: null,
          totalLabel: quote != null
              ? formatRegistrationMoney(quote.displayTotal)
              : null,
        );
      case TournamentRegistrationStep.partner:
        return (
          enabled: _partnerUserId != null && !_submitting,
          ctaLabel: 'Enviar convite',
          metaLabel: null,
          totalLabel: null,
        );
      case TournamentRegistrationStep.waiting:
        final canPay = registrationWaitingCanProceed(
          inviteAccepted: inviteAccepted,
          registrationId: _registrationId,
        );
        return (
          enabled: canPay,
          ctaLabel: 'Ir para pagamento',
          metaLabel: inviteAccepted ? null : 'Aguardando parceiro',
          totalLabel: quote != null && canPay
              ? formatRegistrationMoney(quote.shareAmount)
              : null,
        );
      case TournamentRegistrationStep.payment:
        return (
          enabled: _registrationId != null && !isFullyPaid && !_submitting,
          ctaLabel: isFullyPaid ? 'Inscrição confirmada' : 'Confirmar e pagar',
          metaLabel: 'Sua parcela',
          totalLabel: quote != null
              ? formatRegistrationMoney(quote.shareAmount)
              : null,
        );
    }
  }

  ({String name, String initials}) _athleteDisplay() {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final name = profile?.name.trim();
    if (name != null && name.isNotEmpty) {
      return (name: name, initials: _initialsFromName(name));
    }
    return (name: 'Você', initials: 'VC');
  }

  static String _initialsFromName(String name) {
    final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.length >= 2
          ? parts.first.substring(0, 2).toUpperCase()
          : parts.first.toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync =
        ref.watch(tournamentDetailProvider(widget.tournamentId));
    final access = ref.watch(tournamentAccessStateProvider);

    final inviteId = _inviteId ?? '';
    if (inviteId.isNotEmpty) {
      ref.listen(tournamentPartnerInviteProvider(inviteId), (prev, next) {
        final invite = next.valueOrNull;
        if (invite == null || !mounted) return;

        if (invite.isAccepted &&
            invite.registrationId != null &&
            invite.registrationId!.isNotEmpty) {
          if (_registrationId != invite.registrationId) {
            setState(() => _registrationId = invite.registrationId);
          }
          if (_step == TournamentRegistrationStep.waiting) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              showAppSnackBar(
                context,
                '${invite.inviteeName.split(' ').first} aceitou! Sigam para o pagamento.',
              );
              setState(() => _step = TournamentRegistrationStep.payment);
            });
          }
        } else if (invite.isDeclined || invite.isCancelled) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            showAppSnackBar(
              context,
              invite.isDeclined
                  ? 'Seu parceiro recusou o convite.'
                  : 'Convite cancelado.',
              isError: true,
            );
            setState(() {
              _inviteId = null;
              _registrationId = null;
              _step = TournamentRegistrationStep.partner;
            });
          });
        } else if (invite.isExpired) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            showAppSnackBar(context, 'Convite expirado.', isError: true);
            setState(() {
              _inviteId = null;
              _step = TournamentRegistrationStep.partner;
            });
          });
        }
      });
    }

    final regId = _registrationId ?? '';
    if (regId.isNotEmpty) {
      ref.listen(tournamentRegistrationSnapshotProvider(regId), (prev, next) {
        final snap = next.valueOrNull;
        if (snap?.isPaid == true &&
            mounted &&
            !_paidPopHandled &&
            _step == TournamentRegistrationStep.payment) {
          _paidPopHandled = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            showAppSnackBar(
              context,
              'Dupla inscrita! Pagamento confirmado.',
            );
            context.pop();
          });
        }
      });
    }

    final registrationAsync = regId.isNotEmpty
        ? ref.watch(tournamentRegistrationSnapshotProvider(regId))
        : null;
    final registrationSnap = registrationAsync?.valueOrNull;
    final isFullyPaid = registrationSnap?.isPaid == true;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: tournamentAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o torneio.\n$e',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.live),
            ),
          ),
        ),
        data: (tournament) {
          if (tournament == null) {
            return const Center(child: Text('Torneio não encontrado.'));
          }

          final categories = tournament.categoryOffers;
          if (categories.isEmpty) {
            return const Center(
              child: Text('Nenhuma categoria disponível para inscrição.'),
            );
          }

          _scheduleInitialCategory(categories);
          _scheduleInitialRegistration(categories);

          final enrollment = ref
                  .watch(
                    tournamentCategoryEnrollmentCountsProvider(
                      widget.tournamentId,
                    ),
                  )
                  .valueOrNull ??
              const <String, int>{};
          final stats = tournamentDetailStats(
            tournament,
            enrollmentByCategoryId: enrollment,
          );
          final quote = _category != null
              ? buildRegistrationQuote(entryFee: _category!.entryFee)
              : null;

          final inviteAsync = inviteId.isNotEmpty
              ? ref.watch(tournamentPartnerInviteProvider(inviteId))
              : null;
          final invite = inviteAsync?.valueOrNull;
          final inviteAccepted = invite?.isAccepted == true;

          final paidAmount = registrationSnap?.paidAmount ?? 0;
          final progressLabel = quote != null
              ? registrationDualPaymentProgressLabel(
                  quote: quote,
                  paidAmount: paidAmount,
                  isPaid: isFullyPaid,
                )
              : null;

          final sticky = _stickyConfig(
            quote: quote,
            inviteAccepted: inviteAccepted,
            isFullyPaid: isFullyPaid,
          );
          final showHero = registrationStepShowsHero(_step);
          final athlete = _athleteDisplay();
          final partner = _selectedPartner;

          return Column(
            children: [
              TournamentRegistrationHeader(
                onBack: _handleBack,
                title: registrationHeaderTitle(_step),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
                  children: [
                    if (!access.canAccess)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                        child: TournamentAccessBanner(
                          onboardingCompleted: access.onboardingCompleted,
                          profileStepsComplete: access.profileStepsComplete,
                        ),
                      ),
                    if (showHero) ...[
                      TournamentRegistrationHeroCard(
                        tournament: tournament,
                        stats: stats,
                      ),
                      const SizedBox(height: 16),
                    ],
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: _buildStepContent(
                          tournament: tournament,
                          categories: categories,
                          enrollmentByCategoryId: enrollment,
                          quote: quote,
                          athleteName: athlete.name,
                          athleteInitials: athlete.initials,
                          partner: partner,
                          inviteAccepted: inviteAccepted,
                          progressLabel: progressLabel,
                          isFullyPaid: isFullyPaid,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              TournamentRegistrationStickyBar(
                enabled: sticky.enabled &&
                    (_step != TournamentRegistrationStep.payment ||
                        access.canAccess),
                onConfirm: () => _handleStickyAction(
                  tournament: tournament,
                  canAccess: access.canAccess,
                  inviteAccepted: inviteAccepted,
                ),
                ctaLabel: sticky.ctaLabel,
                metaLabel: sticky.metaLabel,
                totalLabel: sticky.totalLabel,
                submitting: _submitting,
              ),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _buildStepContent({
    required TournamentDetail tournament,
    required List<TournamentCategoryOffer> categories,
    required Map<String, int> enrollmentByCategoryId,
    required TournamentRegistrationQuote? quote,
    required String athleteName,
    required String athleteInitials,
    required TournamentRegistrationPartnerCandidate? partner,
    required bool inviteAccepted,
    required String? progressLabel,
    required bool isFullyPaid,
  }) {
    switch (_step) {
      case TournamentRegistrationStep.category:
          return [
            Text(
              'Escolha a categoria',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
          ),
          const SizedBox(height: 16),
          for (final cat in categories) ...[
            TournamentRegistrationCategoryCard(
              offer: cat,
              format: tournament.format,
              inscriptionCount: inscriptionCountForCategory(
                enrollmentByCategoryId,
                cat.id,
              ),
              selected: _category?.id == cat.id,
              onTap: () => _selectCategory(cat),
            ),
            const SizedBox(height: 10),
          ],
        ];
      case TournamentRegistrationStep.summary:
        final category = _category;
        if (category == null || quote == null) {
          return const [
            Text('Selecione uma categoria para continuar.'),
          ];
        }
        return [
          TournamentRegistrationCategorySection(
            label: 'SUA CATEGORIA',
            child: TournamentRegistrationCategoryCard(
              offer: category,
              format: tournament.format,
              inscriptionCount: inscriptionCountForCategory(
                enrollmentByCategoryId,
                category.id,
              ),
              selected: true,
              showChangeAction: true,
              onChange: () => _goToStep(TournamentRegistrationStep.category),
            ),
          ),
          const SizedBox(height: 24),
          TournamentRegistrationPriceSummary(quote: quote),
        ];
      case TournamentRegistrationStep.partner:
        final category = _category;
        if (category == null) {
          return const [
            Text('Selecione uma categoria para continuar.'),
          ];
        }
        return [
          TournamentRegistrationPartnerStep(
            category: category,
            selectedUserId: _partnerUserId,
            onSelected: (candidate) {
              setState(() {
                _partnerUserId = candidate.userId;
                _selectedPartner = candidate;
              });
            },
            onInviteByPhone: () {
              showAppSnackBar(context, 'Convite por celular em breve.');
            },
          ),
        ];
      case TournamentRegistrationStep.waiting:
        if (partner == null) {
          return const [
            Text('Selecione um parceiro para continuar.'),
          ];
        }
        final inviteLink =
            _inviteId != null ? '/torneios-convite/${_inviteId!}' : null;
        return [
          TournamentRegistrationWaitingStep(
            partner: partner,
            athleteDisplayName: athleteName,
            athleteInitials: athleteInitials,
            inviteAccepted: inviteAccepted,
            onResendInvite: () {
              if (inviteLink != null) {
                showAppSnackBar(
                  context,
                  'Convite pendente. Compartilhe: $inviteLink',
                );
              } else {
                showAppSnackBar(context, 'Aguardando envio do convite.');
              }
            },
            onCancelRegistration: _cancelInvite,
          ),
        ];
      case TournamentRegistrationStep.payment:
        final category = _category;
        if (category == null || quote == null) {
          return const [
            Text('Selecione uma categoria para continuar.'),
          ];
        }
        if (_registrationId == null || _registrationId!.isEmpty) {
          return const [
            Text('Aguarde o parceiro aceitar o convite para pagar.'),
          ];
        }
        return [
          TournamentRegistrationPaymentStep(
            category: category,
            quote: quote,
            paymentType: 'share',
            onPaymentTypeChanged: (_) {},
            dualPaymentOnly: true,
            progressLabel: progressLabel,
            isFullyPaid: isFullyPaid,
          ),
        ];
    }
  }

  Future<void> _submitPayment() async {
    final regId = _registrationId;
    if (regId == null || regId.isEmpty) return;

    setState(() => _submitting = true);
    final service = ref.read(tournamentRegistrationServiceProvider);

    try {
      await service.payShare(regId);
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Complete o pagamento no navegador. O parceiro também deve pagar a parcela dele.',
      );
    } on TournamentRegistrationException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível iniciar o pagamento. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
