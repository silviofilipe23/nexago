import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/store_checkout_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_checkout_rules.dart';
import 'store_checkout_copy.dart';
import 'widgets/store_checkout_parts.dart';
import 'widgets/store_style.dart';

/// Vermelho do erro de campo.
const Color _errorRed = Color(0xFFFF5A4F);

enum _CepState { idle, loading, found, notFound }

/// Loja · Novo endereço / Editar endereço (app 05, `/loja/endereco[?id=]`).
///
/// O CEP preenche rua, bairro, cidade e UF pelo ViaCEP e leva o cursor pro
/// número. Salva a lista inteira em `storeAddresses/{uid}` (o primeiro nasce
/// principal) e volta com o id salvo — o carrinho já o escolhe.
class StoreAddressPage extends ConsumerStatefulWidget {
  const StoreAddressPage({super.key, this.addressId});

  /// `null` = novo.
  final String? addressId;

  @override
  ConsumerState<StoreAddressPage> createState() => _StoreAddressPageState();
}

class _StoreAddressPageState extends ConsumerState<StoreAddressPage> {
  late final Map<StoreAddressField, TextEditingController> _text = {
    for (final f in StoreAddressField.values)
      if (f != StoreAddressField.label) f: TextEditingController(),
  };
  final FocusNode _numberFocus = FocusNode();

  String _label = kStoreAddressLabels.first;
  bool _makeMain = false;
  bool _touched = false;
  bool _saving = false;
  bool _initialized = false;
  _CepState _cep = _CepState.idle;
  int _cepSeq = 0;

  /// Campos que vieram do CEP (ganham o ✓ do desenho).
  Set<StoreAddressField> _fromCep = const {};

  StoreAddress? _editing;

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  @override
  void initState() {
    super.initState();
    ref.listenManual<AsyncValue<List<StoreAddress>>>(
      storeAddressesProvider,
      (_, next) => _initFrom(next),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    _numberFocus.dispose();
    super.dispose();
  }

  /// Uma vez, quando a lista chega: o endereço em edição ou o "Quem recebe"
  /// com o nome do atleta.
  void _initFrom(AsyncValue<List<StoreAddress>> next) {
    if (_initialized || (!next.hasValue && !next.hasError)) return;
    _initialized = true;
    final list = next.valueOrNull ?? const <StoreAddress>[];
    final editing = list.where((a) => a.id == widget.addressId).firstOrNull;
    _editing = editing;
    if (editing != null) {
      final d = storeDraftFromAddress(editing);
      for (final entry in _text.entries) {
        entry.value.text = switch (entry.key) {
          StoreAddressField.zip => formatStoreCep(d.zip),
          StoreAddressField.phone => formatStorePhone(d.phone),
          _ => d.valueOf(entry.key),
        };
      }
      _label = d.label;
      _makeMain = editing.main;
      _cep = _CepState.found;
    } else {
      _text[StoreAddressField.recipient]!.text =
          ref.read(storeRecipientNameProvider);
    }
    if (mounted) setState(() {});
  }

  StoreAddressDraft get _draft {
    String v(StoreAddressField f) => _text[f]!.text;
    return StoreAddressDraft(
      label: _label,
      recipient: v(StoreAddressField.recipient),
      phone: v(StoreAddressField.phone),
      zip: v(StoreAddressField.zip),
      street: v(StoreAddressField.street),
      number: v(StoreAddressField.number),
      complement: v(StoreAddressField.complement),
      district: v(StoreAddressField.district),
      city: v(StoreAddressField.city),
      uf: v(StoreAddressField.uf),
    );
  }

  void _edited(StoreAddressField field) {
    setState(() {
      if (_fromCep.contains(field)) _fromCep = {..._fromCep}..remove(field);
    });
  }

  // ── CEP ───────────────────────────────────────────────────────────────

  void _onCep(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 8) {
      _lookupCep(digits);
    } else {
      setState(() {
        _cep = _CepState.idle;
        _cepSeq++;
      });
    }
  }

  Future<void> _lookupCep(String cep) async {
    final seq = ++_cepSeq;
    setState(() => _cep = _CepState.loading);
    final found = await ref.read(storeCepLookupProvider).lookup(cep);
    if (!mounted || seq != _cepSeq) return;
    if (found == null) {
      setState(() => _cep = _CepState.notFound);
      return;
    }
    setState(() {
      final filled = <StoreAddressField>{
        StoreAddressField.city,
        StoreAddressField.uf,
      };
      if (found.street.isNotEmpty) {
        _text[StoreAddressField.street]!.text = found.street;
        filled.add(StoreAddressField.street);
      }
      if (found.district.isNotEmpty) {
        _text[StoreAddressField.district]!.text = found.district;
        filled.add(StoreAddressField.district);
      }
      _text[StoreAddressField.city]!.text = found.city;
      _text[StoreAddressField.uf]!.text = found.uf;
      _fromCep = filled;
      _cep = _CepState.found;
    });
    // O desenho: depois do CEP o cursor vai pro número.
    _numberFocus.requestFocus();
  }

  // ── Salvar / excluir ──────────────────────────────────────────────────

  static String _newId() {
    final random = Random.secure();
    return [
      for (var i = 0; i < 8; i++)
        random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ].join();
  }

  Future<void> _save(List<StoreAddress> list) async {
    if (_saving) return;
    final draft = _draft;
    final errors = storeAddressDraftErrors(draft);
    if (errors.isNotEmpty) {
      setState(() => _touched = true);
      return;
    }
    final editing = _editing;
    final id = editing?.id ?? _newId();
    final first = list.isEmpty;
    final makeMain = first || _makeMain;
    final next = upsertStoreAddress(
      list,
      storeAddressFromDraft(draft, id: id, main: makeMain),
      makeMain: makeMain,
    );
    if (next == null) {
      showAppSnackBar(context, StoreCheckoutCopy.addressLimit);
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(storeCheckoutActionsProvider).saveAddresses(next);
      _analytics.logStoreAddressSave(isNew: editing == null);
      if (mounted) context.pop(id);
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(context, StoreCheckoutCopy.addressSaveError,
          isError: true);
    }
  }

  Future<void> _delete(List<StoreAddress> list, StoreAddress address) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(storeCheckoutActionsProvider)
          .saveAddresses(removeStoreAddress(list, address.id));
      if (!mounted) return;
      showAppSnackBar(context, StoreCheckoutCopy.addressDeleted);
      context.pop();
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        StoreCheckoutCopy.addressDeleteError,
        isError: true,
      );
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final list =
        ref.watch(storeAddressesProvider).valueOrNull ?? const <StoreAddress>[];
    final editing = _editing;
    final first = list.isEmpty || (list.length == 1 && editing != null);
    final errors = _touched
        ? storeAddressDraftErrors(_draft)
        : const <StoreAddressField, String>{};

    String? cepHint;
    if (_cep == _CepState.notFound) {
      cepHint = StoreCheckoutCopy.cepNotFound;
    } else if (_cep == _CepState.found && _fromCep.isNotEmpty) {
      cepHint = [
        _text[StoreAddressField.street]!.text,
        _text[StoreAddressField.district]!.text,
        '${_text[StoreAddressField.city]!.text}, '
            '${_text[StoreAddressField.uf]!.text}',
      ].where((s) => s.trim().isNotEmpty).join(' · ');
    }

    Widget field(
      StoreAddressField f,
      String label, {
      String? hint,
      String? helper,
      bool mono = false,
      TextInputType? keyboard,
      List<TextInputFormatter>? formatters,
      FocusNode? focusNode,
      TextCapitalization caps = TextCapitalization.sentences,
      ValueChanged<String>? onChanged,
      Widget? suffix,
    }) {
      return _AddressField(
        key: ValueKey('store-address-field-${f.name}'),
        label: label,
        controller: _text[f]!,
        hint: hint,
        helper: helper,
        error: errors[f],
        ok: _fromCep.contains(f),
        mono: mono,
        keyboard: keyboard,
        formatters: formatters,
        focusNode: focusNode,
        caps: caps,
        suffix: suffix,
        onChanged: (v) {
          _edited(f);
          onChanged?.call(v);
        },
      );
    }

    final cepSuffix = switch (_cep) {
      _CepState.loading => const SizedBox.square(
          dimension: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      _CepState.found =>
        const Icon(Icons.check_rounded, size: 18, color: AppColors.win),
      _ => null,
    };

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.md,
        ),
        header: StoreTitleHeader(
          title: editing != null
              ? StoreCheckoutCopy.editAddressTitle
              : StoreCheckoutCopy.newAddressTitle,
          subtitle: editing == null ? StoreCheckoutCopy.firstAddressHint : null,
          onBack: () => popOrGo(context, AppRoutes.storeCart),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: !_initialized
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screenH,
                        6,
                        AppSpacing.screenH,
                        AppSpacing.xxl,
                      ),
                      children: [
                        field(
                          StoreAddressField.zip,
                          StoreCheckoutCopy.cep,
                          hint: '00000-000',
                          helper: cepHint,
                          mono: true,
                          keyboard: TextInputType.number,
                          formatters: [_MaskFormatter(formatStoreCep)],
                          onChanged: _onCep,
                          suffix: cepSuffix,
                        ),
                        const SizedBox(height: 14),
                        field(
                            StoreAddressField.street, StoreCheckoutCopy.street),
                        const SizedBox(height: 14),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 110,
                              child: field(
                                StoreAddressField.number,
                                StoreCheckoutCopy.number,
                                focusNode: _numberFocus,
                                caps: TextCapitalization.characters,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: field(
                                StoreAddressField.complement,
                                StoreCheckoutCopy.complement,
                                hint: StoreCheckoutCopy.complementHint,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        field(
                          StoreAddressField.district,
                          StoreCheckoutCopy.district,
                        ),
                        const SizedBox(height: 14),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: field(
                                StoreAddressField.city,
                                StoreCheckoutCopy.city,
                                caps: TextCapitalization.words,
                              ),
                            ),
                            const SizedBox(width: 12),
                            SizedBox(
                              width: 80,
                              child: field(
                                StoreAddressField.uf,
                                StoreCheckoutCopy.uf,
                                caps: TextCapitalization.characters,
                                formatters: [_UfFormatter()],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        field(
                          StoreAddressField.recipient,
                          StoreCheckoutCopy.recipient,
                          caps: TextCapitalization.words,
                        ),
                        const SizedBox(height: 14),
                        field(
                          StoreAddressField.phone,
                          StoreCheckoutCopy.phone,
                          hint: StoreCheckoutCopy.phoneHint,
                          helper: StoreCheckoutCopy.phoneHelp,
                          mono: true,
                          keyboard: TextInputType.phone,
                          formatters: [_MaskFormatter(formatStorePhone)],
                        ),
                        const SizedBox(height: 18),
                        const StoreSectionLabel(StoreCheckoutCopy.saveAs),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final l in kStoreAddressLabels)
                              _LabelChip(
                                label: l,
                                selected: _label == l,
                                onTap: () => setState(() => _label = l),
                              ),
                          ],
                        ),
                        if (!first) ...[
                          const SizedBox(height: 18),
                          _CheckRow(
                            key: const ValueKey('store-address-make-main'),
                            label: StoreCheckoutCopy.makeMain,
                            on: _makeMain,
                            onTap: () => setState(() => _makeMain = !_makeMain),
                          ),
                        ],
                        if (editing != null) ...[
                          const SizedBox(height: 22),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(
                              key: const ValueKey('store-address-delete'),
                              onPressed:
                                  _saving ? null : () => _delete(list, editing),
                              style: TextButton.styleFrom(
                                foregroundColor: _errorRed,
                              ),
                              icon: const Icon(
                                Icons.delete_outline_rounded,
                                size: 18,
                              ),
                              label:
                                  const Text(StoreCheckoutCopy.deleteAddress),
                            ),
                          ),
                        ],
                      ],
                    ),
            ),
            StoreCheckoutBar(
              button: StorePrimaryButton(
                key: const ValueKey('store-address-save'),
                label: _saving
                    ? StoreCheckoutCopy.savingAddress
                    : StoreCheckoutCopy.saveAddress,
                busy: _saving,
                onPressed: _initialized ? () => _save(list) : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Campo do desenho (`LjField`): rótulo mono em cima, caixa de 48 com borda
/// laranja no foco, ✓ verde no que veio do CEP.
class _AddressField extends StatelessWidget {
  const _AddressField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.helper,
    this.error,
    this.ok = false,
    this.mono = false,
    this.keyboard,
    this.formatters,
    this.focusNode,
    this.caps = TextCapitalization.sentences,
    this.onChanged,
    this.suffix,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final String? helper;
  final String? error;
  final bool ok;
  final bool mono;
  final TextInputType? keyboard;
  final List<TextInputFormatter>? formatters;
  final FocusNode? focusNode;
  final TextCapitalization caps;
  final ValueChanged<String>? onChanged;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final error = this.error;
    final helper = this.helper;
    final suffix = this.suffix ??
        (ok
            ? const Icon(Icons.check_rounded, size: 18, color: AppColors.win)
            : null);
    OutlineInputBorder border(Color color, [double width = 1.5]) =>
        OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(13)),
          borderSide: BorderSide(color: color, width: width),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          style: AppTypography.mono(
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.3,
            color: StoreStyle.tertiary(colors),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: keyboard,
          inputFormatters: formatters,
          textCapitalization: caps,
          textInputAction: TextInputAction.next,
          onChanged: onChanged,
          style: (mono
                  ? AppTypography.mono(
                      fontSize: 14.5, fontWeight: FontWeight.w500)
                  : AppTypography.soraRegular(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w400,
                    ))
              .copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            hintStyle: AppTypography.bodyM.copyWith(
              color: StoreStyle.tertiary(colors),
            ),
            filled: true,
            fillColor: colors.surfaceCard,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            suffixIcon: suffix == null
                ? null
                : Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: suffix,
                  ),
            suffixIconConstraints:
                const BoxConstraints(minWidth: 28, minHeight: 20),
            border: border(StoreCheckoutStyle.line(colors)),
            enabledBorder: border(
              error != null ? _errorRed : StoreCheckoutStyle.line(colors),
            ),
            focusedBorder: border(error != null ? _errorRed : AppColors.brand),
          ),
        ),
        if (error != null || helper != null) ...[
          const SizedBox(height: 5),
          Text(
            error ?? helper!,
            style: AppTypography.soraRegular(
              fontSize: 11.5,
              fontWeight: error != null ? FontWeight.w600 : FontWeight.w400,
              color: error != null ? _errorRed : StoreStyle.tertiary(colors),
            ),
          ),
        ],
      ],
    );
  }
}

class _LabelChip extends StatelessWidget {
  const _LabelChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: selected ? StoreCheckoutStyle.tint : Colors.transparent,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? AppColors.brand : StoreCheckoutStyle.line(colors),
          width: 1.5,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Container(
          height: 38,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          alignment: Alignment.center,
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? colors.onSurface : StoreStyle.secondary(colors),
            ),
          ),
        ),
      ),
    );
  }
}

class _CheckRow extends StatelessWidget {
  const _CheckRow({
    super.key,
    required this.label,
    required this.on,
    required this.onTap,
  });

  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      checked: on,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.smAll,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? AppColors.brand : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color:
                        on ? AppColors.brand : StoreCheckoutStyle.line2(colors),
                    width: 2,
                  ),
                ),
                child: on
                    ? const Icon(
                        Icons.check_rounded,
                        size: 14,
                        color: StoreStyle.onBrand,
                      )
                    : null,
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w400,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Máscara que reformata o texto inteiro a cada tecla (CEP, celular).
class _MaskFormatter extends TextInputFormatter {
  _MaskFormatter(this.format);

  final String Function(String raw) format;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = format(newValue.text);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// UF: duas letras, em caixa alta.
class _UfFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final letters = newValue.text.replaceAll(RegExp('[^A-Za-z]'), '');
    final text =
        (letters.length > 2 ? letters.substring(0, 2) : letters).toUpperCase();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
