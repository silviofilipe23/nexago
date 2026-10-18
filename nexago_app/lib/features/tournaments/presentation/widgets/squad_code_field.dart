import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../squad/application/squad_providers.dart';
import '../../../squad/domain/squad_models.dart';
import '../../../squad/domain/squad_repository.dart';
import '../../../squad/domain/squad_rules.dart';
import '../../../squad/presentation/widgets/squad_ui.dart';

/// Código de embaixador do NexaSquad no checkout PIX da inscrição (App 07 ·
/// Seguidor · código aplicado).
///
/// Recolhido em "Tem código de embaixador?" para não pesar no checkout de
/// quem não tem. "Aplicar" confere com `checkSquadCode` antes de cobrar e
/// mostra de quem é a indicação e o desconto; sem código digitado, mostra a
/// indicação que veio por link/QR (o desconto também vale para ela). A
/// cobrança confere tudo de novo: código digitado e não aplicado segue para
/// ela, que recusa com mensagem se não existir.
class SquadCodeField extends ConsumerStatefulWidget {
  const SquadCodeField({
    super.key,
    required this.controller,
    required this.registrationId,
    required this.onChanged,
    this.athleteUids = const [],
    this.enabled = true,
  });

  /// Rascunho digitado (vai na cobrança quando nenhum código foi aplicado).
  final TextEditingController controller;
  final String registrationId;

  /// Atletas da inscrição: o servidor recusa o código de qualquer um deles.
  final List<String> athleteUids;

  /// Indicação vigente: código aplicado, link/QR ou [SquadCodeCheck.none].
  final ValueChanged<SquadCodeCheck> onChanged;
  final bool enabled;

  @override
  ConsumerState<SquadCodeField> createState() => _SquadCodeFieldState();
}

class _SquadCodeFieldState extends ConsumerState<SquadCodeField> {
  late bool _open = widget.controller.text.isNotEmpty;
  bool _checking = false;
  String? _error;
  SquadCodeCheck _applied = SquadCodeCheck.none;
  SquadCodeCheck _link = SquadCodeCheck.none;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadLinkReferral());
  }

  @override
  void didUpdateWidget(SquadCodeField oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A inscrição pode chegar depois do primeiro frame (rota aberta direto):
    // a consulta com `athleteUids` vazio não pega a autoindicação do parceiro.
    if (!listEquals(oldWidget.athleteUids, widget.athleteUids)) {
      _loadLinkReferral();
    }
  }

  /// Indicação por link/QR guardada na conta: uma consulta por checkout (e de
  /// novo quando os atletas da inscrição chegam).
  Future<void> _loadLinkReferral() async {
    if (widget.registrationId.isEmpty) return;
    try {
      final check = await ref
          .read(squadRepositoryProvider)
          .checkCode(
            code: '',
            athleteUids: widget.athleteUids,
            registrationId: widget.registrationId,
          );
      if (!mounted) return;
      final link = check.viaLink ? check : SquadCodeCheck.none;
      if (!link.viaLink && !_link.viaLink) return;
      setState(() => _link = link);
      if (_applied.code == null) widget.onChanged(link);
    } catch (_) {
      // Melhor esforço: sem a consulta, o checkout segue como antes.
    }
  }

  Future<void> _apply() async {
    final code = normalizeSquadCode(widget.controller.text);
    if (code.isEmpty) return;
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      final check = await ref
          .read(squadRepositoryProvider)
          .checkCode(
            code: code,
            athleteUids: widget.athleteUids,
            registrationId: widget.registrationId,
          );
      if (!mounted) return;
      setState(() {
        _checking = false;
        _applied = check;
        _open = false;
      });
      widget.onChanged(check);
    } on SquadException catch (e) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _error =
            'Não foi possível conferir o código agora. Ele será '
            'conferido ao gerar o PIX.';
      });
    }
  }

  void _remove() {
    widget.controller.clear();
    setState(() {
      _applied = SquadCodeCheck.none;
      _error = null;
    });
    widget.onChanged(_link);
  }

  @override
  Widget build(BuildContext context) {
    if (_applied.code != null) {
      return SquadAppliedCodeCard(
        check: _applied,
        enabled: widget.enabled,
        actionLabel: 'Remover',
        onAction: _remove,
      );
    }
    if (!_open) {
      if (_link.viaLink) {
        return SquadAppliedCodeCard(
          check: _link,
          enabled: widget.enabled,
          actionLabel: 'Tenho outro código',
          onAction: () => setState(() => _open = true),
        );
      }
      return Align(
        child: TextButton(
          onPressed: widget.enabled ? () => setState(() => _open = true) : null,
          child: const Text('Tem código de embaixador?'),
        ),
      );
    }

    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'CÓDIGO DE EMBAIXADOR (OPCIONAL)',
          style: theme.textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: colors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                key: const Key('squad-code-field'),
                controller: widget.controller,
                enabled: widget.enabled && !_checking,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _apply(),
                onChanged: (_) => setState(() => _error = null),
                inputFormatters: const [SquadCodeInputFormatter(maxLength: 20)],
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: colors.onSurface,
                ),
                decoration: InputDecoration(
                  hintText: 'Ex.: JOAO10',
                  errorText: _error,
                  errorMaxLines: 3,
                  prefixIcon: Icon(
                    Icons.sell_outlined,
                    color: colors.onSurfaceMuted,
                    size: 22,
                  ),
                  filled: true,
                  fillColor: colors.surfaceCard,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 16,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: colors.surfaceRaised),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(
                      color: AppColors.brand,
                      width: 2,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 56,
              child: OutlinedButton(
                key: const Key('squad-code-apply'),
                onPressed:
                    widget.enabled &&
                        !_checking &&
                        widget.controller.text.isNotEmpty
                    ? _apply
                    : null,
                style: OutlinedButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _checking
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Aplicar'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'O desconto da indicação aparece no valor do PIX.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: colors.onSurfaceMuted,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

/// Card verde da indicação aplicada (código digitado ou link/QR).
class SquadAppliedCodeCard extends StatelessWidget {
  const SquadAppliedCodeCard({
    super.key,
    required this.check,
    required this.actionLabel,
    required this.onAction,
    this.enabled = true,
  });

  final SquadCodeCheck check;
  final String actionLabel;
  final VoidCallback onAction;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final name = check.ambassadorName?.trim().isNotEmpty == true
        ? check.ambassadorName!.trim()
        : 'um embaixador';
    final typed = check.origin == 'code';
    final offer = check.discountPct > 0
        ? '${squadPercent(check.discountPct)} OFF nesta inscrição'
        : 'O desconto de indicação vale só na primeira inscrição.';
    return Container(
      key: const Key('squad-code-applied'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SquadAvatar(name: name, size: 40, hue: squadHueFor(name)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            typed ? (check.code ?? '') : 'Indicação por link',
                            overflow: TextOverflow.ellipsis,
                            style: typed
                                ? SquadStyle.mono(15, color: colors.onSurface)
                                : theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: colors.onSurface,
                                  ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(
                          Icons.check_rounded,
                          size: 16,
                          color: AppColors.win,
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Convite de $name · Squad',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: enabled ? onAction : null,
                style: TextButton.styleFrom(
                  foregroundColor: colors.onSurfaceMuted,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 36),
                ),
                child: Text(actionLabel),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            offer,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: check.discountPct > 0
                  ? AppColors.win
                  : colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
