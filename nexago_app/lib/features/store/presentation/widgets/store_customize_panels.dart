import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/store_customize_rules.dart';
import '../../domain/store_customize_service.dart';
import '../../domain/store_models.dart';
import '../../domain/store_rules.dart';
import '../store_copy.dart';
import 'store_customize_preview.dart';
import 'store_product_options.dart';
import 'store_style.dart';

/// Vermelho de erro dos campos (o mesmo do snackbar de erro).
const Color kStoreErrorColor = Color(0xFFFF5A4F);

/// Abas da personalização.
enum StoreCustomizeTab { name, image, back, variant }

/// Abas segmentadas "Nome · Imagem · Costas · Cor e tam." (ativa = pílula
/// clara; ✓ verde quando preenchida).
class StoreCustomizeTabs extends StatelessWidget {
  const StoreCustomizeTabs({
    super.key,
    required this.tabs,
    required this.current,
    required this.done,
    required this.onTap,
  });

  final List<StoreCustomizeTab> tabs;
  final StoreCustomizeTab current;
  final Set<StoreCustomizeTab> done;
  final ValueChanged<StoreCustomizeTab> onTap;

  static (IconData, String) _meta(StoreCustomizeTab tab) => switch (tab) {
        StoreCustomizeTab.name => (
            Icons.title_rounded,
            StoreCopy.customizeTabName,
          ),
        StoreCustomizeTab.image => (
            Icons.image_outlined,
            StoreCopy.customizeTabImage,
          ),
        StoreCustomizeTab.back => (
            Icons.tag_rounded,
            StoreCopy.customizeTabBack,
          ),
        StoreCustomizeTab.variant => (
            Icons.sell_outlined,
            StoreCopy.customizeTabVariant,
          ),
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final textScaler = MediaQuery.textScalerOf(context);
    // O Text herda o DefaultTextStyle (letterSpacing do tema): mede com ele.
    final inherited = DefaultTextStyle.of(context).style;
    return Container(
      height: 56,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: BorderRadius.circular(18),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final layout = _layout(
            constraints.maxWidth,
            tabs.length,
            (i, scale) => _TabButton.contentWidth(
              _meta(tabs[i]).$2,
              done: done.contains(tabs[i]),
              inherited: inherited,
              textScaler: textScaler,
              scale: scale,
            ),
          );
          return Row(
            children: [
              for (var i = 0; i < tabs.length; i++)
                Expanded(
                  flex: layout.flex[i],
                  child: _TabButton(
                    key: ValueKey('store-customize-tab-${tabs[i].name}'),
                    icon: _meta(tabs[i]).$1,
                    label: _meta(tabs[i]).$2,
                    active: tabs[i] == current,
                    done: done.contains(tabs[i]),
                    scale: layout.scale,
                    onTap: () => onTap(tabs[i]),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Fatias iguais quando todo rótulo cabe; senão, fatias proporcionais ao
  /// rótulo e **uma escala só** para todos (com 4 abas, cada uma encolhendo
  /// sozinha deixava "Nome" grande e "Cor e tam." miúdo).
  static ({List<int> flex, double scale}) _layout(
    double width,
    int n,
    double Function(int i, double scale) measure,
  ) {
    final equal = (flex: List.filled(n, 1), scale: 1.0);
    if (n == 0 || !width.isFinite) return equal;
    const pad = _TabButton.horizontalPadding * 2;
    List<double> widthsAt(double scale) =>
        [for (var i = 0; i < n; i++) measure(i, scale)];
    double sumOf(List<double> ws) => ws.fold(0, (a, w) => a + w);

    var widths = widthsAt(1);
    if (widths.every((w) => w <= width / n - pad)) return equal;
    final room = width - n * pad;
    if (room <= 0) return equal;
    // O texto não encolhe linear com a fonte: mede de novo na escala e
    // corrige até caber (converge em 1–2 passos).
    var scale = 1.0;
    for (var pass = 0; pass < 4 && sumOf(widths) > room; pass++) {
      scale = (scale * room / sumOf(widths)).clamp(0.0, 1.0);
      widths = widthsAt(scale);
    }
    final extra = ((room - sumOf(widths)) / n).clamp(0.0, double.infinity);
    return (
      flex: [for (final w in widths) ((w + pad + extra) * 100).floor()],
      scale: scale,
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    super.key,
    required this.icon,
    required this.label,
    required this.active,
    required this.done,
    required this.onTap,
    this.scale = 1,
  });

  final IconData icon;
  final String label;
  final bool active;
  final bool done;
  final VoidCallback onTap;

  /// Escala comum a todas as abas (ver [StoreCustomizeTabs._layout]).
  final double scale;

  static const double horizontalPadding = 8;
  static const double _iconSize = 18;
  static const double _gap = 6;
  static const double _checkSize = 16;
  static const double _fontSize = 14.5;

  static TextStyle _labelStyle({double scale = 1, Color? color}) =>
      AppTypography.soraRegular(
        fontSize: _fontSize * scale,
        fontWeight: FontWeight.w700,
        color: color,
      );

  /// Largura do conteúdo (ícone + rótulo + ✓) na [scale].
  static double contentWidth(
    String label, {
    required bool done,
    required TextStyle inherited,
    required TextScaler textScaler,
    double scale = 1,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        text: label,
        style: inherited.merge(_labelStyle(scale: scale)),
      ),
      textDirection: TextDirection.ltr,
      textScaler: textScaler,
      maxLines: 1,
    )..layout();
    final text = painter.width;
    painter.dispose();
    return (_iconSize + _gap + (done ? _gap + _checkSize : 0)) * scale + text;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = active ? StoreStyle.onBrand : StoreStyle.secondary(colors);
    return Semantics(
      button: true,
      selected: active,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          decoration: BoxDecoration(
            color: active ? AppColors.onSurface : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
          ),
          padding: const EdgeInsets.symmetric(horizontal: horizontalPadding),
          child: Center(
            // Rede de segurança para arredondamento da medida.
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: _iconSize * scale, color: fg),
                  SizedBox(width: _gap * scale),
                  Text(
                    label,
                    style: _labelStyle(
                      scale: scale,
                      color: active ? StoreStyle.onBrand : colors.onSurface,
                    ),
                  ),
                  if (done) ...[
                    SizedBox(width: _gap * scale),
                    Icon(
                      Icons.check_rounded,
                      size: _checkSize * scale,
                      color: colors.win,
                    ),
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

/// Rótulo "eyebrow" da seção com o preço da opção sozinha à direita.
class StoreCustomizeEyebrow extends StatelessWidget {
  const StoreCustomizeEyebrow(this.title, {super.key, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final trailing = this.trailing;
    return Row(
      children: [
        Expanded(
          child: Text(
            title.toUpperCase(),
            style: AppTypography.eyebrow.copyWith(
              fontSize: 11,
              color: StoreStyle.secondary(colors),
            ),
          ),
        ),
        if (trailing != null)
          Text(
            trailing,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: StoreStyle.tertiary(colors),
            ),
          ),
      ],
    );
  }
}

/// "Pular" no fim de uma aba vazia.
class StoreCustomizeSkip extends StatelessWidget {
  const StoreCustomizeSkip({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Align(
      alignment: Alignment.centerRight,
      child: TextButton.icon(
        key: const ValueKey('store-customize-skip'),
        onPressed: onTap,
        style: TextButton.styleFrom(foregroundColor: colors.onSurface),
        iconAlignment: IconAlignment.end,
        icon: const Icon(Icons.chevron_right_rounded, size: 20),
        label: const Text(
          StoreCopy.customizeSkip,
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

/// Filtra o nome a cada tecla (maiúsculas, caracteres, espaços, limite) e
/// avisa quando algum caractere não entrou.
class StoreNameInputFormatter extends TextInputFormatter {
  StoreNameInputFormatter({required this.maxChars, required this.onResult});

  final int maxChars;

  /// `true` = algum caractere foi recusado (o campo treme).
  final ValueChanged<bool> onResult;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    // Acento composto (tecla morta) ainda em edição: espera fechar.
    if (newValue.composing.isValid && !newValue.composing.isCollapsed) {
      return newValue;
    }
    final result = formatStoreCustomNameInput(newValue.text, maxChars);
    onResult(result.rejected);
    if (result.text == newValue.text) return newValue;
    if (result.text == oldValue.text) return oldValue;
    final removed = newValue.text.length - result.text.length;
    final offset =
        (newValue.selection.end - removed).clamp(0, result.text.length);
    return TextEditingValue(
      text: result.text,
      selection: TextSelection.collapsed(offset: offset),
    );
  }
}

/// Aba Nome: campo, hint/contador, fontes e cores.
class StoreCustomizeNamePanel extends StatelessWidget {
  const StoreCustomizeNamePanel({
    super.key,
    required this.options,
    required this.aloneCents,
    required this.controller,
    required this.focusNode,
    required this.formatter,
    required this.shakeTick,
    required this.invalidChar,
    required this.problem,
    required this.font,
    required this.color,
    required this.onChanged,
    required this.onFont,
    required this.onColor,
    this.onSkip,
  });

  final StoreCustomNameOptions options;
  final int aloneCents;
  final TextEditingController controller;
  final FocusNode focusNode;
  final TextInputFormatter formatter;
  final int shakeTick;

  /// O último toque trouxe caractere inválido.
  final bool invalidChar;

  /// O que `checkStoreCustomName` reprovou (empty não conta).
  final StoreNameProblem? problem;
  final StoreCustomFont font;
  final String? color;
  final ValueChanged<String> onChanged;
  final ValueChanged<StoreCustomFont> onFont;
  final ValueChanged<String> onColor;

  /// "Pular" (só com o campo vazio).
  final VoidCallback? onSkip;

  String? _problemText() => switch (problem) {
        StoreNameProblem.blocked => StoreCopy.customizeNameBlocked,
        StoreNameProblem.chars => StoreCopy.customizeNameInvalidChar,
        StoreNameProblem.length => StoreCopy.customizeNameTooLong,
        StoreNameProblem.disabled => StoreCopy.customizeNameDisabled,
        StoreNameProblem.empty || null => null,
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final problemText = _problemText();
    final count =
        storeCustomNameLength(normalizeStoreCustomName(controller.text));
    final String hint;
    final Color hintColor;
    if (problemText != null) {
      hint = problemText;
      hintColor = kStoreErrorColor;
    } else if (invalidChar) {
      hint = StoreCopy.customizeNameInvalidChar;
      hintColor = kStoreErrorColor;
    } else {
      hint = StoreCopy.customizeNameCounter(count, options.maxChars);
      hintColor = storeCustomNameNearLimit(count, options.maxChars)
          ? AppColors.brand
          : StoreStyle.secondary(colors);
    }
    final borderColor =
        problemText != null ? kStoreErrorColor : AppColors.brand;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: color, width: width),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StoreCustomizeEyebrow(
          storeNameStepTitle(options.placement),
          trailing:
              aloneCents > 0 ? StoreCopy.customizeAlone(aloneCents) : null,
        ),
        const SizedBox(height: 12),
        StoreShake(
          tick: shakeTick,
          child: TextField(
            key: const ValueKey('store-customize-name-field'),
            controller: controller,
            focusNode: focusNode,
            inputFormatters: [formatter],
            onChanged: onChanged,
            onSubmitted: (_) => focusNode.unfocus(),
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
              color: colors.onSurface,
            ),
            cursorColor: AppColors.brand,
            decoration: InputDecoration(
              hintText: StoreCopy.customizeNameHint,
              hintStyle: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: StoreStyle.tertiary(colors),
              ),
              filled: true,
              fillColor: StoreStyle.surface(colors),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              enabledBorder: border(
                problemText != null
                    ? kStoreErrorColor
                    : colors.onSurface.withValues(alpha: 0.12),
                problemText != null ? 1.6 : 1,
              ),
              focusedBorder: border(borderColor, 1.6),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          hint,
          key: const ValueKey('store-customize-name-hint'),
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: hintColor,
          ),
        ),
        const SizedBox(height: 24),
        const StoreCustomizeEyebrow(StoreCopy.customizeFont),
        const SizedBox(height: 12),
        Row(
          children: [
            for (var i = 0; i < options.fonts.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(
                child: _FontCard(
                  font: options.fonts[i],
                  selected: options.fonts[i] == font,
                  onTap: () => onFont(options.fonts[i]),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 24),
        const StoreCustomizeEyebrow(StoreCopy.customizeNameColor),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final hex in options.colors)
              _ColorDot(
                key: ValueKey('store-customize-color-$hex'),
                hex: hex,
                selected: hex == color,
                onTap: () => onColor(hex),
              ),
          ],
        ),
        if (onSkip != null) ...[
          const SizedBox(height: 12),
          StoreCustomizeSkip(onTap: onSkip!),
        ],
      ],
    );
  }
}

class _FontCard extends StatelessWidget {
  const _FontCard({
    required this.font,
    required this.selected,
    required this.onTap,
  });

  final StoreCustomFont font;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      label: font.label,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.14)
            : StoreStyle.surface(colors),
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(
            color: selected
                ? AppColors.brand
                : colors.onSurface.withValues(alpha: 0.10),
            width: selected ? 1.6 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey('store-customize-font-${font.id}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Column(
              children: [
                Text(
                  'ABC',
                  style: storeCustomFontStyle(
                    font,
                    fontSize: 24,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  font.label,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: selected
                        ? colors.onSurface
                        : StoreStyle.secondary(colors),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ColorDot extends StatelessWidget {
  const _ColorDot({
    super.key,
    required this.hex,
    required this.selected,
    required this.onTap,
  });

  final String hex;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fill = storeHexColor(hex) ?? colors.onSurface;
    return Semantics(
      button: true,
      selected: selected,
      label: hex,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          width: 46,
          height: 46,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? AppColors.brand : Colors.transparent,
              width: 2,
            ),
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: fill,
              shape: BoxShape.circle,
              border: Border.all(
                color: colors.onSurface.withValues(alpha: 0.18),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Estado do envio da imagem no card.
enum StoreImageDraftStatus { preparing, invalid, uploading, failed, ready }

/// A imagem escolhida pelo atleta, do arquivo até o Storage.
class StoreImageDraft {
  const StoreImageDraft({
    required this.fileName,
    required this.status,
    this.bytes,
    this.format,
    this.widthPx,
    this.heightPx,
    this.progress = 0,
    this.path,
    this.error,
  });

  final String fileName;
  final StoreImageDraftStatus status;
  final Uint8List? bytes;
  final String? format;
  final int? widthPx;
  final int? heightPx;

  /// 0–1 durante o envio.
  final double progress;

  /// Caminho no Storage depois de enviada.
  final String? path;

  /// A regra que reprovou ([StoreImageDraftStatus.invalid]).
  final String? error;

  bool get isVector => format == 'svg';

  double get aspect => widthPx != null && heightPx != null && heightPx! > 0
      ? widthPx! / heightPx!
      : 1;

  StoreImageDraft copyWith({
    StoreImageDraftStatus? status,
    double? progress,
    String? path,
  }) =>
      StoreImageDraft(
        fileName: fileName,
        status: status ?? this.status,
        bytes: bytes,
        format: format,
        widthPx: widthPx,
        heightPx: heightPx,
        progress: progress ?? this.progress,
        path: path ?? this.path,
        error: error,
      );
}

/// Aba Imagem: card do arquivo, posição, aviso de revisão.
class StoreCustomizeImagePanel extends StatelessWidget {
  const StoreCustomizeImagePanel({
    super.key,
    required this.options,
    required this.aloneCents,
    required this.draft,
    required this.area,
    required this.onPick,
    required this.onRetry,
    required this.onArea,
    this.onSkip,
  });

  final StoreCustomImageOptions options;
  final int aloneCents;
  final StoreImageDraft? draft;
  final StoreCustomArea area;
  final VoidCallback onPick;
  final VoidCallback onRetry;
  final ValueChanged<StoreCustomArea> onArea;
  final VoidCallback? onSkip;

  @override
  Widget build(BuildContext context) {
    final draft = this.draft;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StoreCustomizeEyebrow(
          storeImageStepTitle(area),
          trailing: aloneCents > 0
              ? StoreCopy.customizeAlone(aloneCents, feminine: true)
              : null,
        ),
        const SizedBox(height: 12),
        if (draft == null)
          _UploadCard(options: options, onTap: onPick)
        else
          _FileCard(
            draft: draft,
            area: area,
            onChange: onPick,
            onRetry: onRetry,
          ),
        const SizedBox(height: 24),
        const StoreCustomizeEyebrow(StoreCopy.customizePosition),
        const SizedBox(height: 12),
        _AreaCards(areas: options.areas, selected: area, onTap: onArea),
        const SizedBox(height: 18),
        const _ReviewNotice(),
        if (onSkip != null) ...[
          const SizedBox(height: 12),
          StoreCustomizeSkip(onTap: onSkip!),
        ],
      ],
    );
  }
}

class _UploadCard extends StatelessWidget {
  const _UploadCard({required this.options, required this.onTap});

  final StoreCustomImageOptions options;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: StoreStyle.surface(colors),
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.lgAll,
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.55)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const ValueKey('store-customize-upload'),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.14),
                  borderRadius: AppRadii.mdAll,
                ),
                child: const Icon(
                  Icons.add_photo_alternate_outlined,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      StoreCopy.customizeSendImage,
                      style: AppTypography.titleS.copyWith(
                        fontSize: 15,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      StoreCopy.customizeImageRules(
                        storeImageFormatsLabel(options.formats),
                        options.maxSizeMb,
                        options.minWidthPx,
                        options.minHeightPx,
                      ),
                      style: AppTypography.bodyS.copyWith(
                        color: StoreStyle.secondary(colors),
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

class _FileCard extends StatelessWidget {
  const _FileCard({
    required this.draft,
    required this.area,
    required this.onChange,
    required this.onRetry,
    this.warnText,
  });

  final StoreImageDraft draft;
  final StoreCustomArea area;
  final VoidCallback onChange;
  final VoidCallback onRetry;

  /// Aviso de resolução; `null` = "… no tamanho {área}".
  final String? warnText;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bad = draft.status == StoreImageDraftStatus.invalid ||
        draft.status == StoreImageDraftStatus.failed;
    final bytes = draft.bytes;
    final Widget status;
    switch (draft.status) {
      case StoreImageDraftStatus.preparing:
        status = _statusLine(
          colors,
          StoreCopy.customizePreparing,
          StoreStyle.secondary(colors),
        );
      case StoreImageDraftStatus.uploading:
        status = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _statusLine(
              colors,
              StoreCopy.customizeUploading(draft.progress),
              StoreStyle.secondary(colors),
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: AppRadii.pillAll,
              child: LinearProgressIndicator(
                key: const ValueKey('store-customize-upload-progress'),
                value: draft.progress <= 0 ? null : draft.progress,
                minHeight: 4,
                color: AppColors.brand,
                backgroundColor: colors.onSurface.withValues(alpha: 0.10),
              ),
            ),
          ],
        );
      case StoreImageDraftStatus.invalid:
        status = _statusLine(
          colors,
          draft.error ?? '',
          kStoreErrorColor,
          icon: Icons.error_outline_rounded,
        );
      case StoreImageDraftStatus.failed:
        status = _statusLine(
          colors,
          StoreCopy.customizeUploadFailed,
          kStoreErrorColor,
          icon: Icons.error_outline_rounded,
        );
      case StoreImageDraftStatus.ready:
        final dpi = storeEffectiveDpi(
          widthPx: draft.widthPx,
          heightPx: draft.heightPx,
          area: area,
        );
        if (draft.isVector) {
          status = _statusLine(
            colors,
            StoreCopy.customizeVector,
            AppColors.win,
            icon: Icons.check_rounded,
          );
        } else if (storeImageQuality(dpi) == StoreImageQuality.good) {
          status = _statusLine(
            colors,
            StoreCopy.customizeQualityGood(
              draft.widthPx ?? 0,
              draft.heightPx ?? 0,
            ),
            AppColors.win,
            icon: Icons.check_rounded,
          );
        } else {
          status = _statusLine(
            colors,
            warnText ?? StoreCopy.customizeQualityWarn(area.name),
            AppColors.pending,
            icon: Icons.warning_amber_rounded,
          );
        }
    }

    final action = draft.status == StoreImageDraftStatus.failed
        ? (StoreCopy.retry, onRetry)
        : (StoreCopy.customizeChange, onChange);
    return Container(
      key: const ValueKey('store-customize-file-card'),
      padding: const EdgeInsets.fromLTRB(14, 14, 6, 14),
      decoration: BoxDecoration(
        color: bad
            ? kStoreErrorColor.withValues(alpha: 0.10)
            : StoreStyle.surface(colors),
        borderRadius: AppRadii.lgAll,
        border: Border.all(
          color:
              bad ? kStoreErrorColor : colors.onSurface.withValues(alpha: 0.10),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: AppRadii.mdAll,
            child: SizedBox.square(
              dimension: 56,
              child: bytes == null || draft.isVector
                  ? const StoreStripedBox(color: Color(0xFF2A1A12))
                  : Image.memory(
                      bytes,
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      cacheWidth: 168,
                      errorBuilder: (_, _, _) =>
                          const StoreStripedBox(color: Color(0xFF2A1A12)),
                    ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  draft.fileName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.titleS.copyWith(
                    fontSize: 15,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                status,
              ],
            ),
          ),
          TextButton(
            key: const ValueKey('store-customize-file-action'),
            onPressed: draft.status == StoreImageDraftStatus.preparing
                ? null
                : action.$2,
            style: TextButton.styleFrom(foregroundColor: AppColors.brand),
            child: Text(
              action.$1,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusLine(
    AppThemeColors colors,
    String text,
    Color color, {
    IconData? icon,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (icon != null) ...[
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 15, color: colors.readableTone(color)),
          ),
          const SizedBox(width: 6),
        ],
        Expanded(
          child: Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: colors.readableTone(color),
            ),
          ),
        ),
      ],
    );
  }
}

/// Aba Costas (abaixo do nome): seletor Número · Imagem (com os dois
/// liberados), o número com teclado numérico ou a imagem pelo mesmo fluxo
/// da frente — sem ajuste fino, centralizada na área das costas.
class StoreCustomizeBackPanel extends StatelessWidget {
  const StoreCustomizeBackPanel({
    super.key,
    required this.options,
    required this.title,
    required this.priceCents,
    required this.type,
    required this.numberController,
    required this.numberFocus,
    required this.draft,
    required this.imageOptions,
    required this.onType,
    required this.onNumberChanged,
    required this.onPick,
    required this.onRetry,
    this.onSkip,
  });

  final StoreCustomBackOptions options;
  final String title;

  /// `backCents`: "+ R$ X" ao lado do título.
  final int priceCents;
  final StoreBackType type;
  final TextEditingController numberController;
  final FocusNode numberFocus;

  /// Imagem das costas (independente da imagem da frente).
  final StoreImageDraft? draft;

  /// Formatos, peso e resolução: os do bloco Imagem.
  final StoreCustomImageOptions imageOptions;
  final ValueChanged<StoreBackType> onType;
  final ValueChanged<String> onNumberChanged;
  final VoidCallback onPick;
  final VoidCallback onRetry;

  /// "Pular" (só com as costas vazias).
  final VoidCallback? onSkip;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final draft = this.draft;
    final both = options.allowNumber && options.allowImage;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: color, width: width),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StoreCustomizeEyebrow(
          title,
          trailing: priceCents > 0
              ? StoreCopy.customizeBackPrice(priceCents)
              : null,
        ),
        const SizedBox(height: 12),
        if (both) ...[
          _BackTypeSelector(type: type, onType: onType),
          const SizedBox(height: 16),
        ],
        if (type == StoreBackType.number) ...[
          TextField(
            key: const ValueKey('store-customize-back-number-field'),
            controller: numberController,
            focusNode: numberFocus,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(options.numberMaxDigits),
            ],
            onChanged: onNumberChanged,
            onSubmitted: (_) => numberFocus.unfocus(),
            keyboardType: TextInputType.number,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
              color: colors.onSurface,
            ),
            cursorColor: AppColors.brand,
            decoration: InputDecoration(
              hintText: StoreCopy.customizeBackNumberHintText,
              hintStyle: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: StoreStyle.tertiary(colors),
              ),
              filled: true,
              fillColor: StoreStyle.surface(colors),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              enabledBorder:
                  border(colors.onSurface.withValues(alpha: 0.12), 1),
              focusedBorder: border(AppColors.brand, 1.6),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            StoreCopy.customizeBackNumberHint(options.numberMaxDigits),
            key: const ValueKey('store-customize-back-number-hint'),
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: StoreStyle.secondary(colors),
            ),
          ),
        ] else ...[
          if (draft == null)
            _UploadCard(options: imageOptions, onTap: onPick)
          else
            _FileCard(
              draft: draft,
              area: storeBackArea(options),
              onChange: onPick,
              onRetry: onRetry,
              warnText: StoreCopy.customizeBackQualityWarn,
            ),
          const SizedBox(height: 10),
          Text(
            StoreCopy.customizeBackImageArea(options.widthCm, options.heightCm),
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: StoreStyle.secondary(colors),
            ),
          ),
          const SizedBox(height: 18),
          const _ReviewNotice(),
        ],
        if (onSkip != null) ...[
          const SizedBox(height: 12),
          StoreCustomizeSkip(onTap: onSkip!),
        ],
      ],
    );
  }
}

/// Número · Imagem (só com os dois liberados).
class _BackTypeSelector extends StatelessWidget {
  const _BackTypeSelector({required this.type, required this.onType});

  final StoreBackType type;
  final ValueChanged<StoreBackType> onType;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      height: 48,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.pillAll,
      ),
      child: Row(
        children: [
          for (final (value, label) in const [
            (StoreBackType.number, StoreCopy.customizeBackNumber),
            (StoreBackType.image, StoreCopy.customizeBackImage),
          ])
            Expanded(
              child: Semantics(
                button: true,
                selected: value == type,
                label: label,
                child: GestureDetector(
                  key: ValueKey('store-customize-back-type-${value.id}'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onType(value),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    decoration: BoxDecoration(
                      color: value == type
                          ? AppColors.onSurface
                          : Colors.transparent,
                      borderRadius: AppRadii.pillAll,
                    ),
                    child: Center(
                      child: Text(
                        label,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: value == type
                              ? StoreStyle.onBrand
                              : colors.onSurface,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// "A equipe NexaGO revisa a arte antes de produzir…" (imagem da frente e
/// das costas).
class _ReviewNotice extends StatelessWidget {
  const _ReviewNotice();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 1),
          child: Icon(
            Icons.info_outline_rounded,
            size: 18,
            color: AppColors.brand,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            StoreCopy.customizeReviewNotice,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              color: StoreStyle.secondary(colors),
            ),
          ),
        ),
      ],
    );
  }
}

class _AreaCards extends StatelessWidget {
  const _AreaCards({
    required this.areas,
    required this.selected,
    required this.onTap,
  });

  final List<StoreCustomArea> areas;
  final StoreCustomArea selected;
  final ValueChanged<StoreCustomArea> onTap;

  @override
  Widget build(BuildContext context) {
    Widget card(StoreCustomArea area) => _AreaCard(
          area: area,
          selected: area.id == selected.id,
          onTap: () => onTap(area),
        );
    if (areas.length <= 3) {
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < areas.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(child: card(areas[i])),
            ],
            // Uma ou duas áreas não esticam o card na linha toda.
            for (var i = areas.length; i < 3; i++) ...[
              const SizedBox(width: 10),
              const Expanded(child: SizedBox.shrink()),
            ],
          ],
        ),
      );
    }
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final area in areas) SizedBox(width: 150, child: card(area)),
      ],
    );
  }
}

class _AreaCard extends StatelessWidget {
  const _AreaCard({
    required this.area,
    required this.selected,
    required this.onTap,
  });

  final StoreCustomArea area;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.14)
            : StoreStyle.surface(colors),
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(
            color: selected
                ? AppColors.brand
                : colors.onSurface.withValues(alpha: 0.10),
            width: selected ? 1.6 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey('store-customize-area-${area.id}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  area.name,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                    color: selected
                        ? colors.onSurface
                        : StoreStyle.secondary(colors),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  StoreCopy.customizeAreaSize(area.widthCm, area.heightCm),
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: StoreStyle.tertiary(colors),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Feito sob demanda: fica pronto em **5 dias úteis** depois que a arte é
/// aprovada. Personalizados só têm troca em caso de defeito."
class StoreCustomizeProductionNote extends StatelessWidget {
  const StoreCustomizeProductionNote({
    super.key,
    required this.leadDays,
    required this.defectOnlyReturns,
  });

  final int leadDays;
  final bool defectOnlyReturns;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: StoreStyle.surface(colors),
        borderRadius: AppRadii.lgAll,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.schedule_rounded,
            size: 16,
            color: StoreStyle.tertiary(colors),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: StoreCopy.customizeLeadPrefix),
                  if (leadDays > 0) ...[
                    const TextSpan(text: 'em '),
                    TextSpan(
                      text: StoreCopy.businessDays(leadDays),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                  const TextSpan(text: StoreCopy.customizeLeadSuffix),
                  if (defectOnlyReturns)
                    const TextSpan(text: StoreCopy.customizeDefectOnly),
                ],
              ),
              style: AppTypography.bodyS.copyWith(
                fontSize: 12.5,
                color: StoreStyle.secondary(colors),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra fixa: "Com personalização · R$ X" (e o Pix) + **Adicionar**.
class StoreCustomizeBottomBar extends StatelessWidget {
  const StoreCustomizeBottomBar({
    super.key,
    required this.totalCents,
    required this.customized,
    required this.enabled,
    required this.busy,
    required this.onAdd,
    this.pixDiscountPct,
  });

  final int totalCents;

  /// Tem nome, imagem ou costas: "Com personalização".
  final bool customized;
  final bool enabled;
  final bool busy;
  final VoidCallback onAdd;
  final num? pixDiscountPct;

  /// Altura sem a safe area (o conteúdo reserva esse espaço no fim).
  static const double height = 28 + 56 + 12;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final pix = pixDiscountPct;
    return Container(
      padding: EdgeInsets.fromLTRB(20, 28, 20, 12 + bottom),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          // Opaco antes do texto (28 px de respiro no topo): com 0,38 o
          // "Sem personalização" ficava em cima dos cards de fonte.
          stops: const [0, 0.2],
          colors: [colors.canvas.withValues(alpha: 0), colors.canvas],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  customized
                      ? StoreCopy.customizeWith
                      : StoreCopy.customizeWithout,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    StoreCopy.price(totalCents),
                    key: const ValueKey('store-customize-total'),
                    style: AppTypography.soraRegular(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      height: 1.15,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                if (pix != null)
                  Text(
                    '${StoreCopy.price(pixPriceCents(totalCents, pix))}'
                    '${StoreCopy.pixSuffix}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.brand,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 6,
            child: FilledButton(
              key: const ValueKey('store-customize-add'),
              onPressed: enabled && !busy ? onAdd : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: StoreStyle.onBrand,
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.3),
                disabledForegroundColor: StoreStyle.onBrand.withValues(
                  alpha: 0.6,
                ),
                minimumSize: const Size.fromHeight(56),
                shape: const RoundedRectangleBorder(
                  borderRadius: AppRadii.pillAll,
                ),
              ),
              child: busy
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: StoreStyle.onBrand,
                      ),
                    )
                  : Text(
                      StoreCopy.customizeAdd,
                      style: AppTypography.soraRegular(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.2,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// O que a folha de imagem devolve: uma origem ou o pedido de remover.
class StoreImageSheetResult {
  const StoreImageSheetResult.source(StoreImageSource this.source)
      : remove = false;
  const StoreImageSheetResult.remove()
      : source = null,
        remove = true;

  final StoreImageSource? source;
  final bool remove;
}

Future<T?> _showStoreSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
}) {
  return showModalBottomSheet<T>(
    context: context,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      return Padding(
        padding: EdgeInsets.only(
          bottom: 16 + MediaQuery.paddingOf(sheetContext).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 10),
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            builder(sheetContext),
          ],
        ),
      );
    },
  );
}

/// Folha Fotos · Arquivos · Câmera (e "Remover imagem" quando já tem uma).
Future<StoreImageSheetResult?> showStoreImageSourceSheet({
  required BuildContext context,
  required bool canRemove,
}) {
  return _showStoreSheet<StoreImageSheetResult>(
    context: context,
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      Widget tile(
        IconData icon,
        String label,
        StoreImageSheetResult result, {
        Color? color,
      }) =>
          ListTile(
            key: ValueKey('store-customize-source-$label'),
            leading: Icon(icon, color: color ?? AppColors.brand),
            title: Text(
              label,
              style: AppTypography.titleS.copyWith(
                fontSize: 15,
                color: color ?? colors.onSurface,
              ),
            ),
            onTap: () => Navigator.pop(sheetContext, result),
          );
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Text(
              StoreCopy.customizeSendImage,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
          ),
          tile(
            Icons.photo_library_outlined,
            StoreCopy.customizeSourcePhotos,
            const StoreImageSheetResult.source(StoreImageSource.photos),
          ),
          tile(
            Icons.folder_open_outlined,
            StoreCopy.customizeSourceFiles,
            const StoreImageSheetResult.source(StoreImageSource.files),
          ),
          tile(
            Icons.photo_camera_outlined,
            StoreCopy.customizeSourceCamera,
            const StoreImageSheetResult.source(StoreImageSource.camera),
          ),
          if (canRemove)
            tile(
              Icons.delete_outline_rounded,
              StoreCopy.customizeRemoveImage,
              const StoreImageSheetResult.remove(),
              color: kStoreErrorColor,
            ),
        ],
      );
    },
  );
}

/// "Descartar personalização?" — `true` = descartar e sair.
Future<bool> showStoreDiscardSheet(BuildContext context) async {
  final discard = await _showStoreSheet<bool>(
    context: context,
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              StoreCopy.customizeDiscardTitle,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
            const SizedBox(height: 8),
            Text(
              StoreCopy.customizeDiscardBody,
              style: AppTypography.bodyM.copyWith(
                color: StoreStyle.secondary(colors),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              key: const ValueKey('store-customize-discard'),
              onPressed: () => Navigator.pop(sheetContext, true),
              style: FilledButton.styleFrom(
                backgroundColor: kStoreErrorColor,
                foregroundColor: AppColors.white,
                minimumSize: const Size.fromHeight(52),
                shape: const RoundedRectangleBorder(
                  borderRadius: AppRadii.pillAll,
                ),
              ),
              child: const Text(
                StoreCopy.customizeDiscard,
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              key: const ValueKey('store-customize-keep-editing'),
              onPressed: () => Navigator.pop(sheetContext, false),
              style: TextButton.styleFrom(
                foregroundColor: colors.onSurface,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text(
                StoreCopy.customizeKeepEditing,
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      );
    },
  );
  return discard ?? false;
}
