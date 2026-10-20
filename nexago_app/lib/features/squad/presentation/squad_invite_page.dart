import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/squad_providers.dart';
import '../domain/squad_models.dart';
import '../domain/squad_repository.dart';
import '../domain/squad_rules.dart';
import 'widgets/squad_sheets.dart';
import 'widgets/squad_ui.dart';

/// App 06 · Convite recebido. Abrir a tela abre o convite (o card do time vai
/// para "Contrato enviado"); "Entrar no Squad" cria o contrato com o código.
class SquadInvitePage extends ConsumerWidget {
  const SquadInvitePage({super.key, required this.inviteId});

  final String inviteId;

  void _close(BuildContext context) => squadBack(context);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(squadInviteProvider(inviteId));
    return Scaffold(
      backgroundColor: colors.canvas,
      body: async.when(
        loading: () => Stack(
          children: [
            const _InviteArt(),
            _CloseButton(onTap: () => _close(context)),
            const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ],
        ),
        error: (e, _) => SafeArea(
          child: Stack(
            children: [
              SquadMessage(
                title: 'Não foi possível abrir o convite',
                message: e.toString(),
                actionLabel: 'Tentar de novo',
                onAction: () => ref.invalidate(squadInviteProvider(inviteId)),
                icon: Icons.wifi_off_rounded,
              ),
              _CloseButton(onTap: () => _close(context)),
            ],
          ),
        ),
        data: (invite) => invite.isOpen
            ? _OpenInvite(invite: invite, onClose: () => _close(context))
            : SafeArea(
                child: Stack(
                  children: [
                    _ClosedInvite(invite: invite),
                    _CloseButton(onTap: () => _close(context)),
                  ],
                ),
              ),
      ),
    );
  }
}

class _ClosedInvite extends StatelessWidget {
  const _ClosedInvite({required this.invite});

  final SquadInvite invite;

  @override
  Widget build(BuildContext context) {
    switch (invite.status) {
      case 'accepted':
        return SquadMessage(
          title: 'Você já está no Squad',
          message:
              'Este convite já foi aceito. Seu painel de embaixador está no Squad.',
          actionLabel: 'Abrir o Squad',
          onAction: () => context.goNamed(AppRouteNames.squad),
          icon: Icons.check_circle_outline_rounded,
        );
      case 'expired':
        return const SquadMessage(
          title: 'Este convite expirou',
          message:
              'O prazo para aceitar acabou. Se ainda quiser entrar, fale com '
              'o time NexaGO: o convite pode ser reenviado.',
          icon: Icons.timer_off_outlined,
        );
      default:
        return const SquadMessage(
          title: 'Este convite não está mais disponível',
          message: 'O time NexaGO cancelou ou ainda não liberou este convite.',
          icon: Icons.mail_outline_rounded,
        );
    }
  }
}

class _OpenInvite extends ConsumerStatefulWidget {
  const _OpenInvite({required this.invite, required this.onClose});

  final SquadInvite invite;
  final VoidCallback onClose;

  @override
  ConsumerState<_OpenInvite> createState() => _OpenInviteState();
}

class _OpenInviteState extends ConsumerState<_OpenInvite> {
  late final TextEditingController _code = TextEditingController(
    text: widget.invite.suggestedCode,
  );
  bool _editing = false;
  bool _accepted = false;
  bool _saving = false;
  String? _codeError;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  String get _normalized => normalizeSquadCode(_code.text);

  bool get _canSubmit =>
      _accepted && isValidSquadPersonalCode(_normalized) && !_saving;

  Future<void> _submit() async {
    final code = _normalized;
    if (!isValidSquadPersonalCode(code)) {
      setState(() {
        _editing = true;
        _codeError = 'Use de 4 a 12 letras (A–Z) ou números.';
      });
      return;
    }
    setState(() {
      _saving = true;
      _codeError = null;
    });
    try {
      await ref
          .read(squadRepositoryProvider)
          .acceptInvite(inviteId: widget.invite.id, code: code);
      ref.invalidate(mySquadProvider);
      if (!mounted) return;
      showAppSnackBar(context, 'Bem-vindo ao NexaGO Squad!');
      context.goNamed(AppRouteNames.squad);
    } on SquadException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        if (e.field == 'code') {
          _editing = true;
          _codeError = e.message;
        }
      });
      if (e.field != 'code') showAppSnackBar(context, e.message);
    } catch (_) {
      // Qualquer outra falha também devolve o botão (senão gira para sempre).
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        'Não foi possível concluir agora. Tente de novo em instantes.',
      );
    }
  }

  String _intro() {
    final invite = widget.invite;
    final message = invite.message?.trim();
    final until = invite.periodEnd == null
        ? ''
        : ' até ${squadDayKeyLabel(invite.periodEnd!)}';
    final terms = 'Ciclo$until, sem mensalidade e sem meta de posts.';
    if (message != null && message.isNotEmpty) return '$message $terms';
    final n = invite.tournaments;
    final history = n != null && n > 0
        ? 'Seus $n ${n == 1 ? 'torneio chamou' : 'torneios chamaram'} atenção. '
        : '';
    return '$history$terms';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final invite = widget.invite;
    final pkg = invite.package;
    final name = invite.firstName.trim();
    final periodEnd = invite.periodEnd == null
        ? null
        : squadDayKeyLabel(invite.periodEnd!);
    return Stack(
      children: [
        const _InviteArt(),
        // Como no desenho, a lista começa em 236 e corta ali (com 24px de
        // esmaecido): rolar não leva o texto para cima da arte e da barra.
        Positioned(
          top: 236,
          left: 0,
          right: 0,
          bottom: 0,
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (rect) => LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: const [Colors.transparent, Colors.white],
              stops: [0, 24 / rect.height],
            ).createShader(rect),
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                20,
                14,
                20,
                150 + MediaQuery.paddingOf(context).bottom,
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: SquadTierBadge(pkg.tier, solid: true),
                ),
                const SizedBox(height: 14),
                Text.rich(
                  key: const Key('squad-invite-title'),
                  TextSpan(
                    text: name.isEmpty
                        ? 'Você foi convidado pro '
                        : '$name, você foi convidado pro ',
                    children: [
                      const TextSpan(
                        text: 'NexaGO Squad',
                        style: TextStyle(color: AppColors.brand),
                      ),
                      const TextSpan(text: '.'),
                    ],
                  ),
                  style: SquadStyle.display(
                    32,
                    color: colors.onSurface,
                  ).copyWith(height: 1.05),
                ),
                const SizedBox(height: 10),
                Text(
                  _intro(),
                  style: AppTypography.bodyM.copyWith(
                    color: SquadStyle.mute(colors),
                    height: 1.5,
                  ),
                ),
                const SquadSection('O que você recebe'),
                SquadBenefitList(
                  benefits: squadBenefits(pkg, periodEnd: periodEnd),
                  dividers: false,
                ),
                const SizedBox(height: 14),
                _CodeBox(
                  controller: _code,
                  editing: _editing,
                  error: _codeError,
                  enabled: !_saving,
                  onEdit: () => setState(() => _editing = true),
                  onChanged: (_) => setState(() => _codeError = null),
                ),
                const SizedBox(height: 14),
                _ContractCheck(
                  value: _accepted,
                  onChanged: _saving
                      ? null
                      : (v) => setState(() => _accepted = v),
                  onOpenContract: () => showSquadContractSheet(
                    context,
                    package: pkg,
                    followerDiscountFirstOnly: invite.followerDiscountFirstOnly,
                    periodLabel: periodEnd == null ? null : 'até $periodEnd',
                  ),
                ),
              ],
            ),
          ),
        ),
        _CloseButton(onTap: widget.onClose),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: SquadBottomBar(
            children: [
              Expanded(
                child: SquadPrimaryButton(
                  key: const Key('squad-invite-accept'),
                  label: 'Entrar no Squad',
                  loading: _saving,
                  onPressed: _canSubmit ? _submit : null,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CodeBox extends StatelessWidget {
  const _CodeBox({
    required this.controller,
    required this.editing,
    required this.error,
    required this.enabled,
    required this.onEdit,
    required this.onChanged,
  });

  final TextEditingController controller;
  final bool editing;
  final String? error;
  final bool enabled;
  final VoidCallback onEdit;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final codeStyle = SquadStyle.mono(22, color: colors.onSurface);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: error != null ? AppColors.live : SquadStyle.line(colors),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SquadLabel('Seu código vai ser'),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: editing
                    ? TextField(
                        key: const Key('squad-invite-code-field'),
                        controller: controller,
                        enabled: enabled,
                        autofocus: true,
                        autocorrect: false,
                        textCapitalization: TextCapitalization.characters,
                        inputFormatters: const [
                          SquadCodeInputFormatter(maxLength: 12),
                        ],
                        onChanged: onChanged,
                        style: codeStyle,
                        decoration: const InputDecoration(
                          isDense: true,
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.zero,
                        ),
                      )
                    : Text(
                        controller.text,
                        key: const Key('squad-invite-code'),
                        style: codeStyle,
                      ),
              ),
              if (!editing)
                GestureDetector(
                  onTap: enabled ? onEdit : null,
                  child: Text(
                    'Editar',
                    style: AppTypography.labelL.copyWith(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.brand,
                    ),
                  ),
                ),
            ],
          ),
          if (editing) ...[
            const SizedBox(height: 6),
            Text(
              error ??
                  '4 a 12 letras ou números. É o que seus seguidores digitam.',
              style: AppTypography.bodyS.copyWith(
                color: error != null ? colors.live : SquadStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ContractCheck extends StatelessWidget {
  const _ContractCheck({
    required this.value,
    required this.onChanged,
    required this.onOpenContract,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final VoidCallback onOpenContract;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      checked: value,
      child: GestureDetector(
        key: const Key('squad-invite-contract-check'),
        behavior: HitTestBehavior.opaque,
        onTap: onChanged == null ? null : () => onChanged!(!value),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: value ? AppColors.brand : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: value ? AppColors.brand : SquadStyle.line2(colors),
                  width: 1.5,
                ),
              ),
              child: value
                  ? const Icon(
                      Icons.check_rounded,
                      size: 14,
                      color: SquadStyle.onBrand,
                    )
                  : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  text: 'Li e aceito o ',
                  children: [
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        key: const Key('squad-invite-contract-link'),
                        onTap: onOpenContract,
                        child: Text(
                          'contrato do Squad',
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12.5,
                            color: colors.onSurface,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ),
                    const TextSpan(
                      text:
                          ', incluindo uso de imagem e identificação de publicidade.',
                    ),
                  ],
                ),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  color: SquadStyle.mute(colors),
                  height: 1.45,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.paddingOf(context).top + 10,
      right: 20,
      child: SquadRoundButton(
        icon: Icons.close_rounded,
        semanticLabel: 'Fechar',
        background: context.themeColors.canvas.withValues(alpha: 0.6),
        onTap: onTap,
      ),
    );
  }
}

/// Topo do convite: arte da marca (sem foto de banco) que se dissolve no fundo.
class _InviteArt extends StatelessWidget {
  const _InviteArt();

  @override
  Widget build(BuildContext context) {
    final canvas = context.themeColors.canvas;
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: 380,
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(-0.6, -0.4),
                radius: 1.2,
                colors: [
                  AppColors.brand.withValues(alpha: 0.55),
                  AppColors.brand.withValues(alpha: 0.08),
                  canvas,
                ],
                stops: const [0, 0.55, 1],
              ),
            ),
          ),
          Positioned(
            right: -30,
            top: 70,
            child: Icon(
              Icons.groups_rounded,
              size: 220,
              color: Colors.white.withValues(alpha: 0.06),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  canvas.withValues(alpha: 0.3),
                  canvas.withValues(alpha: 0),
                  canvas,
                ],
                stops: const [0, 0.3, 1],
              ),
            ),
          ),
          Positioned(
            left: 20,
            top: MediaQuery.paddingOf(context).top + 22,
            child: const SquadWordmark(size: 15),
          ),
        ],
      ),
    );
  }
}
