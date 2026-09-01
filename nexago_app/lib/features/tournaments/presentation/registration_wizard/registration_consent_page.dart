import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/nexa_async_view.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../domain/lgpd_term.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/tournament_registration/tournament_registration_sticky_bar.dart';

const String _dataTitle = 'Autorizo o uso dos meus dados para esta inscrição';
const String _dataBody =
    'Inclui cadastro na chave, súmulas e ranking da competição.';
const String _imageTitle = 'Autorizo o uso da minha imagem nos jogos';
const String _imageBody =
    'Fotos e vídeos da competição em canais do organizador e da nexaGO.';
const String _marketingTitle = 'Quero receber avisos de novos torneios';
const String _marketingBody =
    'Comunicações de marketing. Pode desativar quando quiser.';

/// Passo 2 do wizard: o consentimento LGPD.
///
/// As duas caixas obrigatórias (dados + imagem) são as duas METADES do
/// mesmo termo que já existe — marcar as duas manda o mesmo
/// `lgpdAccepted: true` que a callable já espera, carregado na URL das
/// condições (`lgpd=1`). A terceira caixa (marketing) é consentimento de
/// PLATAFORMA, não do evento: grava `marketingOptIn` direto no perfil do
/// atleta, fora do fluxo de inscrição — falhar ali nunca trava o avanço,
/// porque o aceite que IMPORTA pra inscrição é o do termo.
class RegistrationConsentPage extends ConsumerStatefulWidget {
  const RegistrationConsentPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<RegistrationConsentPage> createState() =>
      _RegistrationConsentPageState();
}

class _RegistrationConsentPageState
    extends ConsumerState<RegistrationConsentPage> {
  bool _dataConsent = true;
  bool _imageConsent = true;
  bool _marketing = false;
  bool _showTerm = false;
  bool _saving = false;

  void _exit() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.goNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': widget.tournamentId},
    );
  }

  /// Grava o opt-in de marketing (best-effort) e segue pras condições
  /// carregando o aceite do termo na URL — é assim que ele atravessa até a
  /// callable, no próximo passo.
  Future<void> _confirm() async {
    setState(() => _saving = true);
    final uid = ref.read(authServiceProvider).currentUser?.uid ?? '';
    if (uid.isNotEmpty) {
      try {
        await ref
            .read(athleteProfileRepositoryProvider)
            .saveMarketingOptIn(uid: uid, optIn: _marketing);
      } catch (_) {
        // O opt-in de marketing não pode travar a inscrição: falhou, segue.
        // O aceite que IMPORTA é o do termo, e ele viaja na callable.
      }
    }
    if (!mounted) return;
    setState(() => _saving = false);
    context.pushNamed(
      AppRouteNames.tournamentRegistrationTerms,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {'categoryId': widget.categoryId, 'lgpd': '1'},
    );
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );

    // Mesma guarda da tela 1 (`registration_category_page.dart`): SÓ
    // `hasError`, sem `&& !hasValue` — erro numa assinatura já estabelecida
    // preserva o valor anterior no mesmo `AsyncValue`
    // (`AsyncError.copyWithPrevious`), e o `.when()` do `NexaAsyncView` cai
    // no ramo de erro mesmo assim. Resolver ANTES do `NexaAsyncView` evita
    // que esse caso escape sem `Scaffold`.
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
      emptyWhen: (value) => value == null,
      empty: _wizardChrome(
        context,
        AppEmptyView(
          icon: Icons.privacy_tip_outlined,
          title: 'Torneio não encontrado',
          subtitle: 'Ele pode ter sido removido ou o link está desatualizado.',
          actionLabel: 'Voltar',
          onAction: _exit,
        ),
      ),
      data: (value) {
        final tournament = value!;
        final canConfirm = _dataConsent && _imageConsent;

        return RegistrationWizardScaffold(
          title: 'Consentimento',
          subtitle: tournament.name,
          onBack: _exit,
          stickyBar: _ConsentStickyBar(
            enabled: canConfirm,
            submitting: _saving,
            onConfirm: _confirm,
            onCancel: _exit,
          ),
          children: [
            Text(
              'Como usamos\nseus dados',
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                height: 1.15,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Para te inscrever, a nexaGO compartilha alguns dados com o '
              'organizador do ${tournament.name}. Você decide o que é '
              'opcional.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.5,
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const _OrganizerReceivesCard(),
            const SizedBox(height: AppSpacing.xl),
            _ConsentTile(
              title: _dataTitle,
              body: _dataBody,
              isRequired: true,
              value: _dataConsent,
              onChanged: (v) => setState(() => _dataConsent = v),
            ),
            const SizedBox(height: AppSpacing.md),
            _ConsentTile(
              title: _imageTitle,
              body: _imageBody,
              isRequired: true,
              value: _imageConsent,
              onChanged: (v) => setState(() => _imageConsent = v),
            ),
            const SizedBox(height: AppSpacing.md),
            _ConsentTile(
              title: _marketingTitle,
              body: _marketingBody,
              isRequired: false,
              value: _marketing,
              onChanged: (v) => setState(() => _marketing = v),
            ),
            const SizedBox(height: AppSpacing.lg),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _showTerm = !_showTerm),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  _showTerm ? 'Ocultar termo' : 'Ler termo completo',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),
            if (_showTerm) ...[
              const SizedBox(height: AppSpacing.md),
              Text(
                lgpdTermTitle,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              for (final paragraph in lgpdTermParagraphs) ...[
                Text(
                  paragraph,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
            ],
          ],
        );
      },
    );
  }
}

/// Casca mínima para os estados de carregando/erro/vazio: `Scaffold` +
/// `SafeArea`, igual à tela 1 (`registration_category_page.dart`). Só usada
/// em `skeleton`/`empty`/erro — o ramo `data` já devolve
/// `RegistrationWizardScaffold` (que É um `Scaffold`).
Widget _wizardChrome(BuildContext context, Widget child) {
  return Scaffold(
    backgroundColor: context.themeColors.canvas,
    body: SafeArea(child: child),
  );
}

/// Cartão "O ORGANIZADOR RECEBE": a lista real de dados compartilhados.
///
/// O protótipo desta tela listava "data de nascimento e CPF" e falava em
/// cartão — nenhum dos três chega ao organizador (CPF só existe no app como
/// dado de pagador de reserva de arena) e não existe pagamento por cartão
/// (só PIX). A lista abaixo é a correção deliberada; não "restaurar" o texto
/// do protótipo.
class _OrganizerReceivesCard extends StatelessWidget {
  const _OrganizerReceivesCard();

  static const _organizerReceives = <(IconData, String)>[
    (Icons.person_outline_rounded, 'Nome completo e apelido'),
    (Icons.notifications_none_rounded, 'Telefone para avisos do torneio'),
    (
      Icons.emoji_events_outlined,
      'Nível, categoria e histórico de resultados',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
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
            'O ORGANIZADOR RECEBE',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          for (final item in _organizerReceives) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(item.$1, size: 18, color: AppColors.brand),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    item.$2,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.onSurface,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          Divider(color: colors.onSurface.withValues(alpha: 0.08), height: 1),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'O pagamento é processado pela nexaGO — o organizador vê a baixa '
            'da inscrição, não seus dados de pagamento.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// Um dos três aceites: checkbox + título + descrição + selo `OBRIGATÓRIO`
/// (dados e imagem). O cartão INTEIRO alterna a caixa ao toque — não só o
/// quadradinho — pra dar um alvo de toque decente.
class _ConsentTile extends StatelessWidget {
  const _ConsentTile({
    required this.title,
    required this.body,
    required this.value,
    required this.onChanged,
    required this.isRequired,
  });

  final String title;
  final String body;
  final bool value;
  final bool isRequired;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => onChanged(!value),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Checkbox(
                  value: value,
                  onChanged: (v) => onChanged(v ?? false),
                  activeColor: AppColors.brand,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: colors.onSurface,
                                  fontWeight: FontWeight.w700,
                                  height: 1.3,
                                ),
                          ),
                        ),
                        if (isRequired) ...[
                          const SizedBox(width: AppSpacing.sm),
                          const _RequiredBadge(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      body,
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
        ),
      ),
    );
  }
}

/// Selo âmbar (`AppColors.pending`) dos dois aceites obrigatórios.
class _RequiredBadge extends StatelessWidget {
  const _RequiredBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.4)),
      ),
      child: Text(
        'OBRIGATÓRIO',
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: AppColors.pending,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

/// Barra fixa: CTA "Concordar e continuar" + "Cancelar inscrição" abaixo.
///
/// Um único `SafeArea(top: false)` por fora cobre os dois — aninhar outro por
/// dentro (o de `TournamentRegistrationStickyBar`) é idempotente, então o
/// botão de cancelar também ganha o respiro do inset do sistema sem dobrar o
/// padding.
class _ConsentStickyBar extends StatelessWidget {
  const _ConsentStickyBar({
    required this.enabled,
    required this.submitting,
    required this.onConfirm,
    required this.onCancel,
  });

  final bool enabled;
  final bool submitting;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

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
              enabled: enabled,
              submitting: submitting,
              ctaLabel: 'Concordar e continuar',
              onConfirm: onConfirm,
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: TextButton(
                onPressed: submitting ? null : onCancel,
                child: Text(
                  'Cancelar inscrição',
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
