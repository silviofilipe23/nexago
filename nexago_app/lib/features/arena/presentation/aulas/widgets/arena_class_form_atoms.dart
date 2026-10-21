import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/profiles/users_repository.dart';
import '../../../../../core/search/search_keywords.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../domain/aulas/arena_class_billing_logic.dart';
import '../../../domain/aulas/arena_class_logic.dart';
import 'arena_class_atoms.dart';

// Peças das telas da fase 2 de Aulas (encaixe, aluno, mensalidades,
// matrícula) — mesmo vocabulário visual do protótipo "NexaGO Arena - Aulas".

/// Rótulo mono em caixa alta ("PLANO", "FREQUÊNCIA · 8 SEMANAS").
class ArenaClassKicker extends StatelessWidget {
  const ArenaClassKicker(this.label, {super.key, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: AppTypography.mono(
        fontSize: 9.5,
        letterSpacing: 1.5,
        fontWeight: FontWeight.w700,
        color: context.themeColors
            .readableTone(color ?? context.themeColors.onSurfaceMuted),
      ),
    );
  }
}

/// Cartão base das telas (fundo de card + borda fina).
class ArenaClassPanel extends StatelessWidget {
  const ArenaClassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.highlight = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  /// Degradê laranja do topo (resumo da chamada, recebido no mês).
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: highlight ? null : colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: highlight
              ? AppColors.brand.withValues(alpha: 0.25)
              : colors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
        gradient: highlight
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                stops: const [0, 0.6],
                colors: [
                  AppColors.brand.withValues(alpha: 0.18),
                  colors.surfaceCard,
                ],
              )
            : null,
      ),
      child: child,
    );
  }
}

/// Chip de filtro/aba (laranja quando escolhido).
class ArenaClassChip extends StatelessWidget {
  const ArenaClassChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? AppColors.brand
            : colors.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: selected
                    ? Colors.transparent
                    : colors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
            child: Center(
              widthFactor: 1,
              child: Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.black : colors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cartão escolhível: radio (escolha única) ou caixinha ([multi]).
class ArenaClassChoiceCard extends StatelessWidget {
  const ArenaClassChoiceCard({
    super.key,
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
    this.trailing,
    this.multi = false,
    this.dimmed = false,
  });

  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool multi;

  /// Indisponível (turma lotada): apagado e sem toque.
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mark = Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: multi ? BoxShape.rectangle : BoxShape.circle,
        borderRadius: multi ? BorderRadius.circular(6) : null,
        color: multi && selected ? AppColors.brand : Colors.transparent,
        border: Border.all(
          width: 1.5,
          color: selected
              ? AppColors.brand
              : colors.onSurfaceMuted.withValues(alpha: 0.35),
        ),
      ),
      child: selected
          ? (multi
              ? const Icon(Icons.check_rounded,
                  size: 14, color: AppColors.black)
              : Center(
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      color: AppColors.brand,
                      shape: BoxShape.circle,
                    ),
                  ),
                ))
          : null,
    );
    return Opacity(
      opacity: dimmed ? 0.5 : 1,
      child: Semantics(
        button: true,
        selected: selected,
        child: Material(
          color: selected
              ? AppColors.brand.withValues(alpha: 0.10)
              : colors.surfaceRaised,
          borderRadius: BorderRadius.circular(15),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: dimmed ? null : onTap,
            child: Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(15),
                border: Border.all(
                  color: selected
                      ? AppColors.brand.withValues(alpha: 0.45)
                      : colors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              ),
              child: Row(
                children: [
                  mark,
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: AppTypography.soraRegular(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle!,
                            style: TextStyle(
                              fontSize: 11.5,
                              height: 1.3,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: 10),
                    trailing!,
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Botão principal laranja (50 px) com estado de envio.
class ArenaClassPrimaryButton extends StatelessWidget {
  const ArenaClassPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.color = AppColors.brand,
    this.foreground = AppColors.black,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final Color color;
  final Color foreground;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: color,
          foregroundColor: foreground,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: busy
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: foreground,
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(fontSize: 15),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Botão secundário escuro com borda (WhatsApp, Cobrar, Pausar plano…).
class ArenaClassGhostButton extends StatelessWidget {
  const ArenaClassGhostButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.height = 42,
    this.color,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final double height;
  final Color? color;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = color ?? colors.onSurface;
    // Texto e ícone no tom legível do tema; o spinner fica no cru.
    final ink = colors.readableTone(fg);
    return SizedBox(
      height: height,
      child: OutlinedButton(
        onPressed: busy ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          backgroundColor: colors.surfaceRaised,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          side: BorderSide(color: colors.onSurfaceMuted.withValues(alpha: 0.2)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: busy
            ? SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: fg),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 15),
                    const SizedBox(width: 6),
                  ],
                  // Encolhe em vez de cortar: "Registrar pagamento" em meia
                  // largura de 375 pt não cabe inteiro em 12,5.
                  Flexible(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        label,
                        maxLines: 1,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: ink,
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

/// Topo das folhas: alça, título, subtítulo e fechar.
class ArenaClassSheetHeader extends StatelessWidget {
  const ArenaClassSheetHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.subtitleColor,
    this.onClose,
  });

  final String title;
  final String? subtitle;
  final Color? subtitleColor;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Center(
          child: Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              color: colors.onSurface.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTypography.soraRegular(
                      fontSize: 18,
                      color: colors.onSurface,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle!,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: subtitleColor == null
                            ? FontWeight.w400
                            : FontWeight.w600,
                        color: colors.readableTone(
                          subtitleColor ?? colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Material(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(10),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onClose ?? () => Navigator.of(context).maybePop(),
                child: SizedBox(
                  width: 32,
                  height: 32,
                  child: Icon(
                    Icons.close_rounded,
                    size: 16,
                    color: colors.onSurfaceMuted,
                    semanticLabel: 'Fechar',
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Campo de texto no estilo das folhas (fundo elevado, sem borda).
InputDecoration arenaClassInputDecoration(
  BuildContext context, {
  required String hint,
  IconData? icon,
}) {
  final colors = context.themeColors;
  return InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(fontSize: 13.5, color: colors.onSurfaceMuted),
    prefixIcon: icon == null ? null : Icon(icon, size: 18),
    filled: true,
    fillColor: colors.surfaceRaised,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
    counterText: '',
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(13),
      borderSide: BorderSide.none,
    ),
  );
}

/// Nome de exibição do atleta (apelido, senão nome completo).
String arenaClassAthleteName(AppUserProfile user) {
  final nick = user.nickname?.trim() ?? '';
  if (nick.isNotEmpty) return nick;
  final full = user.fullName?.trim() ?? '';
  return full.isNotEmpty ? full : 'Atleta';
}

/// Busca de atleta NexaGO (prefixo de palavra, mesma do clubinho) com a
/// lista de resultados como cartões escolhíveis.
class ArenaClassAthleteSearch extends ConsumerStatefulWidget {
  const ArenaClassAthleteSearch({
    super.key,
    required this.selectedUid,
    required this.onSelect,
    this.excludeUids = const {},
    this.hint = 'Buscar atleta NexaGO por nome ou apelido',
    this.enabled = true,
    this.autofocus = false,
    this.collapseOnSelect = false,
  });

  final String? selectedUid;
  final ValueChanged<AppUserProfile> onSelect;

  /// Quem já está na aula/turma — sai dos resultados.
  final Set<String> excludeUids;
  final String hint;
  final bool enabled;
  final bool autofocus;

  /// Escolheu: some a busca e a lista, fica só o atleta escolhido (com "Trocar aluno").
  final bool collapseOnSelect;

  @override
  ConsumerState<ArenaClassAthleteSearch> createState() =>
      _ArenaClassAthleteSearchState();
}

class _ArenaClassAthleteSearchState
    extends ConsumerState<ArenaClassAthleteSearch> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  String? _error;

  /// Atleta tocado por último (para mostrar sozinho quando recolhe).
  AppUserProfile? _picked;
  bool _collapsed = false;

  void _pick(AppUserProfile user) {
    setState(() {
      _picked = user;
      _collapsed = widget.collapseOnSelect;
    });
    widget.onSelect(user);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  Future<void> _search(String term) async {
    if (!isSearchTermLongEnough(term)) {
      if (mounted) setState(() => _results = const []);
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final users = await ref
          .read(usersRepositoryProvider)
          .searchAthletesByKeywords(term, max: 15);
      if (!mounted) return;
      setState(() {
        _results = users
            .where((u) => !widget.excludeUids.contains(u.uid))
            .toList(growable: false);
        _searching = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = 'Não foi possível buscar agora. Tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final term = _controller.text;
    final picked = _picked;
    if (_collapsed && picked != null && picked.uid == widget.selectedUid) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _card(picked),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              key: const Key('arena-class-athlete-search-change'),
              onPressed: widget.enabled
                  ? () => setState(() => _collapsed = false)
                  : null,
              child: const Text('Trocar aluno'),
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: _controller,
          enabled: widget.enabled,
          autofocus: widget.autofocus,
          onChanged: _onChanged,
          textInputAction: TextInputAction.search,
          style: TextStyle(fontSize: 14, color: colors.onSurface),
          decoration: arenaClassInputDecoration(
            context,
            hint: widget.hint,
            icon: Icons.search_rounded,
          ),
        ),
        if (_searching) ...[
          const SizedBox(height: 6),
          const LinearProgressIndicator(minHeight: 2),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: TextStyle(
              color: colors.live,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ] else if (isSearchTermLongEnough(term) &&
            !_searching &&
            _results.isEmpty) ...[
          const SizedBox(height: 10),
          Text(
            'Nenhum atleta encontrado com "$term".',
            style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
          ),
        ],
        for (final user in _results) ...[
          const SizedBox(height: 8),
          _card(user),
        ],
      ],
    );
  }

  Widget _card(AppUserProfile user) => ArenaClassChoiceCard(
        title: arenaClassAthleteName(user),
        subtitle: _subtitle(user),
        selected: user.uid == widget.selectedUid,
        onTap: widget.enabled ? () => _pick(user) : null,
        // A foto ampliada ajuda a achar o atleta certo antes de escolher.
        trailing: ArenaClassAvatar(
          initials: arenaClassInitials(arenaClassAthleteName(user)),
          photoUrl: user.profilePhotoUrl,
          size: 32,
          zoomName: arenaClassAthleteName(user),
          zoomRole: 'Atleta',
        ),
      );

  String _subtitle(AppUserProfile user) {
    final full = user.fullName?.trim() ?? '';
    final name = arenaClassAthleteName(user);
    final city = [user.city, user.state]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join('/');
    final parts = [
      if (full.isNotEmpty && full != name) full,
      if (city.isNotEmpty) city,
    ];
    return parts.isEmpty ? 'Atleta NexaGO' : parts.join(' · ');
  }
}

/// Abre o WhatsApp do [phone] com a [message]. Sem número válido, avisa.
Future<void> openArenaClassWhatsApp(
  BuildContext context, {
  required String? phone,
  String message = '',
}) async {
  final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
    phone: phone,
    message: message,
  );
  if (url == null) {
    showAppSnackBar(
      context,
      'Sem telefone válido para abrir o WhatsApp.',
      isError: true,
    );
    return;
  }
  final ok =
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    showAppSnackBar(context, 'Não foi possível abrir o WhatsApp.',
        isError: true);
  }
}

/// Copia o link da fatura online para a arena mandar por onde quiser.
Future<void> copyArenaClassInvoiceLink(BuildContext context, String url) async {
  await Clipboard.setData(ClipboardData(text: url));
  if (context.mounted) showAppSnackBar(context, 'Link de pagamento copiado.');
}

/// Cor do rótulo da fatura online ("Fatura vencida" em vermelho…).
Color arenaClassOnlineToneColor(
  BuildContext context,
  ArenaClassOnlineTone tone,
) =>
    switch (tone) {
      ArenaClassOnlineTone.info => AppColors.brand,
      ArenaClassOnlineTone.muted => context.themeColors.onSurfaceMuted,
      ArenaClassOnlineTone.warning => AppColors.pending,
      ArenaClassOnlineTone.danger => AppColors.live,
      ArenaClassOnlineTone.success => AppColors.win,
    };

/// Barra de passos da matrícula (4 segmentos).
class ArenaClassStepBar extends StatelessWidget {
  const ArenaClassStepBar({super.key, required this.step, this.total = 4});

  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        for (var i = 1; i <= total; i++) ...[
          if (i > 1) const SizedBox(width: 4),
          Expanded(
            child: Container(
              height: 4,
              decoration: BoxDecoration(
                color: i <= step ? AppColors.brand : colors.surfaceRaised,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Linha chave → valor dos cartões ("Horários fixos  Seg e Qua · 07:00").
class ArenaClassInfoRow extends StatelessWidget {
  const ArenaClassInfoRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: colors.readableTone(valueColor ?? colors.onSurface),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
