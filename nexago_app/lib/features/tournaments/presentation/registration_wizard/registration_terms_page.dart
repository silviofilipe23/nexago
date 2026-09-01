import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/nexa_async_view.dart';
import '../../data/tournament_partner_invite_service.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_invite_announcer.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_logic.dart';
import '../widgets/registration_wizard/registration_wizard_notice.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/tournament_partner_invite_error_feedback.dart';
import '../widgets/tournament_registration/tournament_registration_sticky_bar.dart';
import '../../domain/registration_terms_copy.dart';

/// Passo 3 do wizard: condições da inscrição.
///
/// Quatro variantes, todas na MESMA tela — só muda a cópia
/// ([registrationTermsCopy], `domain/registration_terms_copy.dart`) e o que a
/// barra fixa oferece: dupla obrigatória, dupla com reserva solo permitida,
/// equipe trio+, e o caso de quem RECEBEU um convite para esta categoria
/// (resolvido por [receivedInviteForCategory] a partir dos convites
/// pendentes do atleta — não há corte de sessão aqui, diferente do anúncio
/// automático: o atleta já está olhando esta categoria).
///
/// O aceite LGPD chegou pela URL (`?lgpd=1`) na tela anterior e SEGUE
/// adiante daqui: viaja de novo na URL do próximo passo (parceiro/elenco) e é
/// carimbado como `lgpdAccepted` quando a própria tela dispara a reserva
/// solo.
class RegistrationTermsPage extends ConsumerStatefulWidget {
  const RegistrationTermsPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    required this.lgpdAccepted,
  });

  final String tournamentId;
  final String categoryId;
  final bool lgpdAccepted;

  @override
  ConsumerState<RegistrationTermsPage> createState() =>
      _RegistrationTermsPageState();
}

class _RegistrationTermsPageState extends ConsumerState<RegistrationTermsPage> {
  bool _processing = false;

  void _exit() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    _goToTournamentDetail();
  }

  void _goToTournamentDetail() {
    context.goNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': widget.tournamentId},
    );
  }

  void _advance(RegistrationTermsCopy copy) {
    if (_processing) return;
    context.pushNamed(
      AppRouteNames.tournamentRegistrationPartner,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        if (widget.lgpdAccepted) 'lgpd': '1',
      },
    );
  }

  /// Guarda a vaga sem parceiro definido — mesma callable que a tela única
  /// usa hoje (`registerSolo`, via `TournamentPartnerInviteService`).
  Future<void> _reserveSolo() async {
    if (_processing) return;
    setState(() => _processing = true);
    try {
      final registrationId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .registerSolo(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            lgpdAccepted: widget.lgpdAccepted,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Vaga reservada! Falta formar a dupla — convide seu parceiro.',
      );
      context.pushNamed(
        AppRouteNames.tournamentRegistration,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: {
          'categoryId': widget.categoryId,
          'registrationId': registrationId,
        },
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível reservar a vaga. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );

    // Mesma guarda das telas 1 e 2: SÓ `hasError`, sem `&& !hasValue` — erro
    // numa assinatura já estabelecida preserva o valor anterior no mesmo
    // `AsyncValue` (`AsyncError.copyWithPrevious`), e o `.when()` do
    // `NexaAsyncView` cai no ramo de erro mesmo assim.
    if (tournamentAsync.hasError) {
      return _wizardChrome(
        context,
        AppErrorView(
          title: 'Não foi possível carregar',
          message: 'Não foi possível carregar o torneio.',
          onRetry: () =>
              ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
        ),
      );
    }

    return NexaAsyncView<TournamentDetail?>(
      value: tournamentAsync,
      onRetry: () =>
          ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
      errorTitle: 'Não foi possível carregar',
      errorMessage: 'Não foi possível carregar o torneio.',
      skeleton: _wizardChrome(context, const AppLoadingView()),
      emptyWhen: (value) =>
          value == null ||
          !value.categoryOffers.any((c) => c.id == widget.categoryId),
      empty: _wizardChrome(
        context,
        AppEmptyView(
          icon: Icons.category_outlined,
          title: 'Categoria não encontrada',
          subtitle: 'Ela pode ter sido removida ou o link está desatualizado.',
          actionLabel: 'Voltar',
          onAction: _exit,
        ),
      ),
      data: (value) {
        final tournament = value!;
        final category = tournament.categoryOffers.firstWhere(
          (c) => c.id == widget.categoryId,
        );

        final pendingInvites = ref
                .watch(pendingTournamentPartnerInvitesProvider)
                .valueOrNull ??
            const [];
        final receivedInvite = receivedInviteForCategory(
          pending: pendingInvites,
          tournamentId: widget.tournamentId,
          categoryId: widget.categoryId,
        );

        final copy = registrationTermsCopy(
          category: category,
          requireFormedPair: tournament.requireFormedPair,
          hasReceivedInvite: receivedInvite != null,
          inviterName: receivedInvite?.inviterName,
          isTeamInvite: receivedInvite?.isTeamInvite ?? false,
        );

        final closesAt = tournament.registrationClosesAt;

        // "Ver outras categorias" é uma saída de troca de categoria — faz
        // sentido em toda variante em que o atleta ainda não se comprometeu
        // com uma ação específica (dupla obrigatória, dupla com reserva
        // solo, equipe). NÃO depende de `copy.secondaryLabel` (que só é
        // não-nulo na variante de reserva solo) — prender o botão a esse
        // gate deixava quem está em "dupla obrigatória" sem saída de um
        // toque, justamente quem mais precisa dela por não poder reservar
        // sozinho. Só fica de fora em "convite recebido": ali a decisão é
        // aceitar ou recusar o convite, não trocar de categoria.
        final showOtherCategories = receivedInvite == null;

        return RegistrationWizardScaffold(
          title: 'Condições',
          subtitle: tournament.name,
          onBack: _exit,
          stickyBar: _TermsStickyBar(
            ctaLabel: copy.ctaLabel,
            secondaryLabel: copy.secondaryLabel,
            submitting: _processing,
            onConfirm: () => _advance(copy),
            onSecondary: copy.secondaryLabel == null ? null : _reserveSolo,
            onOtherCategories:
                showOtherCategories ? _goToTournamentDetail : null,
          ),
          children: [
            RegistrationWizardNotice(
              icon: Icons.info_outline_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    copy.eyebrow,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.pending,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    copy.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: context.themeColors.onSurface,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(copy.body),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            _GuaranteeRow(
              icon: Icons.groups_outlined,
              title: 'Parceiro definido antes de pagar',
              subtitle:
                  'Nenhum valor é cobrado enquanto a dupla não estiver '
                  'formada',
            ),
            if (closesAt != null)
              _GuaranteeRow(
                icon: Icons.schedule_outlined,
                title:
                    'Inscrições até ${tournamentRegistrationClosesLabel(closesAt)}',
                subtitle: 'Depois desse prazo a chave é sorteada',
              ),
            _GuaranteeRow(
              icon: Icons.verified_outlined,
              title: 'Os dois precisam caber na categoria',
              subtitle: 'Nível compatível com ${category.name}',
            ),
            const SizedBox(height: AppSpacing.lg),
            _PriceCard(category: category),
          ],
        );
      },
    );
  }
}

/// Casca mínima para os estados de carregando/erro/vazio: `Scaffold` +
/// `SafeArea`, igual às telas 1 e 2. Só usada em `skeleton`/`empty`/erro — o
/// ramo `data` já devolve `RegistrationWizardScaffold` (que É um `Scaffold`).
Widget _wizardChrome(BuildContext context, Widget child) {
  return Scaffold(
    backgroundColor: context.themeColors.canvas,
    body: SafeArea(child: child),
  );
}

/// Uma das três garantias, com ícone + título + subtítulo.
class _GuaranteeRow extends StatelessWidget {
  const _GuaranteeRow({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.brand),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w700,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Cartão de preço: as duas formas de fechar a vaga.
///
/// O total (`category.entryFee`) só aparece UMA vez na tela, na linha "Ou
/// tudo por você" — não existe um cabeçalho repetindo o mesmo valor por
/// cima, senão "R$ 220" apareceria duas vezes para uma categoria de R$ 220.
///
/// Em categoria de EQUIPE (trio+), o valor "por atleta" divide pelo elenco
/// inteiro (`teamSize`), não por 2 — mesma regra de negócio, denominador
/// diferente.
class _PriceCard extends StatelessWidget {
  const _PriceCard({required this.category});

  final TournamentCategoryOffer category;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final teamSize = category.teamSize;
    final isTeam = teamSize != null && teamSize > 2;
    final splitBy = isTeam ? teamSize : 2;
    final perAthlete = category.entryFee / splitBy;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'VALOR DA INSCRIÇÃO',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          _PriceOption(
            // "Metade e metade" só é verdade para dupla — em equipe de N o
            // valor divide pelo elenco inteiro, não em duas partes.
            label: isTeam ? 'Dividido pelo elenco' : 'Metade e metade',
            value: formatRegistrationMoney(perAthlete),
            badge: 'POR ATLETA',
          ),
          const SizedBox(height: AppSpacing.sm),
          _PriceOption(
            label: 'Ou tudo por você',
            value: formatRegistrationMoney(category.entryFee),
            badge: 'INTEGRAL',
          ),
        ],
      ),
    );
  }
}

class _PriceOption extends StatelessWidget {
  const _PriceOption({
    required this.label,
    required this.value,
    required this.badge,
  });

  final String label;
  final String value;
  final String badge;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              Text(
                label,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: AppColors.brand.withValues(alpha: 0.4),
                  ),
                ),
                child: Text(
                  badge,
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
            ],
          ),
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: colors.onSurface,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

/// Barra fixa: CTA principal + duas ações abaixo, cada uma com seu próprio
/// gate — NÃO amarradas uma à outra:
/// - "Guardar minha vaga sem parceiro" só quando `secondaryLabel != null`
///   (variante dupla com reserva solo — a única que oferece essa ação).
/// - "Ver outras categorias" quando `onOtherCategories != null` (toda
///   variante em que trocar de categoria faz sentido — ver o comentário em
///   `showOtherCategories`, no `build()` da tela). Prender as duas ao mesmo
///   gate deixava "dupla obrigatória" sem saída de categoria, que é
///   justamente quem mais precisa dela.
class _TermsStickyBar extends StatelessWidget {
  const _TermsStickyBar({
    required this.ctaLabel,
    required this.secondaryLabel,
    required this.submitting,
    required this.onConfirm,
    required this.onSecondary,
    required this.onOtherCategories,
  });

  final String ctaLabel;
  final String? secondaryLabel;
  final bool submitting;
  final VoidCallback onConfirm;
  final VoidCallback? onSecondary;
  final VoidCallback? onOtherCategories;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.canvas.withValues(alpha: 0.98),
        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TournamentRegistrationStickyBar(
              enabled: !submitting,
              submitting: submitting,
              ctaLabel: ctaLabel,
              onConfirm: onConfirm,
            ),
            if (secondaryLabel != null)
              TextButton(
                onPressed: submitting ? null : onSecondary,
                child: Text(
                  secondaryLabel!,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            if (onOtherCategories != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: TextButton(
                  onPressed: submitting ? null : onOtherCategories,
                  child: Text(
                    'Ver outras categorias',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
