import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../data/arena_profile_edit_service.dart';
import '../domain/arena_providers.dart';

class ArenaEditProfilePage extends ConsumerWidget {
  const ArenaEditProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaAsync = ref.watch(managedArenaDetailProvider);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Editar perfil'),
      ),
      body: arenaAsync.when(
        // Após salvar, o Firestore re-emite o documento e o provider pode entrar
        // brevemente em loading (reload). Sem isto o body vira spinner, o form dispõe
        // e o primeiro pushReplacement não roda.
        skipLoadingOnReload: true,
        data: (arena) {
          if (arena == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Nenhuma arena vinculada ao seu usuário como gestor.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            );
          }
          return _ArenaEditProfileForm(initial: arena);
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar os dados.\n$e',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ArenaEditProfileForm extends ConsumerStatefulWidget {
  const _ArenaEditProfileForm({required this.initial});

  final ArenaListItem initial;

  @override
  ConsumerState<_ArenaEditProfileForm> createState() =>
      _ArenaEditProfileFormState();
}

class _ArenaEditProfileFormState extends ConsumerState<_ArenaEditProfileForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _phone;
  late final TextEditingController _whatsapp;
  late final TextEditingController _address;
  late final TextEditingController _city;

  late String? _coverUrl;
  late String? _logoUrl;
  late List<String> _courtTypes;
  late bool _onlinePayment;
  late bool _onsitePayment;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final a = widget.initial;
    _name = TextEditingController(text: a.name);
    _description = TextEditingController(text: a.description ?? '');
    _phone = TextEditingController(text: a.phone ?? '');
    _whatsapp = TextEditingController(text: a.whatsapp ?? '');
    _address = TextEditingController(text: a.addressLine ?? '');
    _city = TextEditingController(text: a.city ?? '');
    _coverUrl = a.coverUrl;
    _logoUrl = a.logoUrl;
    _courtTypes = List<String>.from(a.courtTypes);
    _onlinePayment = a.onlinePaymentEnabled;
    _onsitePayment = a.onsitePaymentEnabled;
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _phone.dispose();
    _whatsapp.dispose();
    _address.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _editUrl({
    required String title,
    required String? current,
    required void Function(String?) onSet,
  }) async {
    final ctrl = TextEditingController(text: current ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: Text(title),
          content: TextField(
            controller: ctrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              hintText: 'https://…',
              border: OutlineInputBorder(),
            ),
            autofocus: true,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
    if (ok == true && mounted) {
      final t = ctrl.text.trim();
      onSet(t.isEmpty ? null : t);
      setState(() {});
    }
  }

  Future<void> _addCourtType() async {
    final customCtrl = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        final bottom = MediaQuery.of(ctx).padding.bottom;
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Adicionar tipo de quadra',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final opt in kCourtTypeOptions)
                    if (!_courtTypes.contains(opt))
                      ActionChip(
                        label: Text(opt),
                        onPressed: () {
                          setState(() => _courtTypes.add(opt));
                          Navigator.pop(ctx);
                        },
                      ),
                ],
              ),
              const SizedBox(height: 20),
              TextField(
                controller: customCtrl,
                decoration: const InputDecoration(
                  labelText: 'Outro tipo',
                  border: OutlineInputBorder(),
                ),
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () {
                  final t = customCtrl.text.trim();
                  if (t.isNotEmpty && !_courtTypes.contains(t)) {
                    setState(() => _courtTypes.add(t));
                  }
                  Navigator.pop(ctx);
                },
                child: const Text('Adicionar'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_onlinePayment && !_onsitePayment) {
      showAppSnackBar(
        context,
        'Ative pelo menos uma forma de pagamento.',
        isError: true,
      );
      return;
    }

    setState(() => _saving = true);
    var leftForSuccessRoute = false;
    try {
      await ref.read(arenaProfileEditServiceProvider).saveProfile(
            arenaId: widget.initial.id,
            name: _name.text,
            description: _description.text,
            phone: _phone.text,
            whatsapp: _whatsapp.text.trim().isEmpty ? null : _whatsapp.text,
            address: _address.text,
            city: _city.text,
            coverUrl: _coverUrl,
            logoUrl: _logoUrl,
            courtTypes: _courtTypes,
            onlinePaymentEnabled: _onlinePayment,
            onsitePaymentEnabled: _onsitePayment,
          );
      if (!mounted) return;
      leftForSuccessRoute = true;
      ref.invalidate(managedArenaDetailProvider);
      context.go(AppRoutes.athleteProfileUpdateSuccess);
    } on ArenaProfileEditException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Falha ao salvar: $e', isError: true);
    } finally {
      if (mounted && !leftForSuccessRoute) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.55);
    const headerH = 210.0;
    const logoR = 44.0;

    return Column(
      children: [
        Expanded(
          child: Form(
            key: _formKey,
            child: CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: headerH,
                    child: Stack(
                      clipBehavior: Clip.none,
                      fit: StackFit.expand,
                      children: [
                        _HeaderCover(url: _coverUrl),
                        Positioned(
                          top: 12,
                          right: 12,
                          child: Material(
                            color: theme.colorScheme.surface.withValues(
                              alpha: 0.92,
                            ),
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              onTap: () => _editUrl(
                                title: 'URL da imagem de capa',
                                current: _coverUrl,
                                onSet: (v) => _coverUrl = v,
                              ),
                              borderRadius: BorderRadius.circular(12),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.photo_camera_outlined,
                                      size: 18,
                                      color: theme.colorScheme.primary,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Alterar capa',
                                      style: theme.textTheme.labelLarge
                                          ?.copyWith(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          left: 22,
                          bottom: -logoR + 8,
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              _HeaderLogo(
                                url: _logoUrl,
                                name: _name.text,
                              ),
                              Positioned(
                                right: -4,
                                bottom: 0,
                                child: Material(
                                  color: AppColors.brand,
                                  shape: const CircleBorder(),
                                  child: InkWell(
                                    customBorder: const CircleBorder(),
                                    onTap: () => _editUrl(
                                      title: 'URL do logo',
                                      current: _logoUrl,
                                      onSet: (v) => _logoUrl = v,
                                    ),
                                    child: const Padding(
                                      padding: EdgeInsets.all(6),
                                      child: Icon(
                                        Icons.edit_rounded,
                                        size: 16,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    22,
                    logoR + 4,
                    22,
                    24 + MediaQuery.of(context).viewInsets.bottom,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      const _FormSectionTitle(label: 'Dados da arena'),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        decoration: _fieldDecoration(
                          theme,
                          label: 'Nome da arena',
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Nome obrigatório';
                          }
                          return null;
                        },
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _description,
                        minLines: 3,
                        maxLines: 6,
                        decoration: _fieldDecoration(
                          theme,
                          label: 'Descrição',
                          alignLabel: true,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: _fieldDecoration(
                          theme,
                          label: 'Telefone',
                          hint: '(DDD) número',
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Telefone obrigatório';
                          }
                          if (!isValidArenaPhoneDigits(v)) {
                            return 'Telefone inválido';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _whatsapp,
                        keyboardType: TextInputType.phone,
                        decoration: _fieldDecoration(
                          theme,
                          label: 'WhatsApp',
                          hint: 'Opcional',
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return null;
                          if (!isValidArenaPhoneDigits(v)) {
                            return 'Número inválido';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _address,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: _fieldDecoration(
                          theme,
                          label: 'Endereço',
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _city,
                        textCapitalization: TextCapitalization.words,
                        decoration: _fieldDecoration(
                          theme,
                          label: 'Cidade',
                        ),
                      ),
                      const SizedBox(height: 32),
                      const _FormSectionTitle(label: 'Tipos de quadra'),
                      const SizedBox(height: 8),
                      Text(
                        'Toque em um tipo sugerido ou adicione um personalizado.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: muted,
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (_courtTypes.isEmpty)
                        Text(
                          'Nenhum tipo listado ainda.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: muted,
                            fontStyle: FontStyle.italic,
                          ),
                        )
                      else
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (var i = 0; i < _courtTypes.length; i++)
                              InputChip(
                                label: Text(_courtTypes[i]),
                                onDeleted: () {
                                  setState(() => _courtTypes.removeAt(i));
                                },
                              ),
                          ],
                        ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _addCourtType,
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Adicionar tipo'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                      const SizedBox(height: 32),
                      const _FormSectionTitle(label: 'Pagamentos'),
                      const SizedBox(height: 8),
                      _SettingsCard(
                        child: Column(
                          children: [
                            SwitchListTile.adaptive(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Pagamento online'),
                              subtitle: Text(
                                'Reservas com pagamento antecipado',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: muted,
                                ),
                              ),
                              value: _onlinePayment,
                              activeTrackColor:
                                  AppColors.brand.withValues(alpha: 0.35),
                              activeThumbColor: AppColors.brand,
                              onChanged: (v) {
                                setState(() {
                                  _onlinePayment = v;
                                  if (!_onlinePayment && !_onsitePayment) {
                                    _onsitePayment = true;
                                  }
                                });
                              },
                            ),
                            Divider(
                              height: 1,
                              color: theme.colorScheme.outline
                                  .withValues(alpha: 0.12),
                            ),
                            SwitchListTile.adaptive(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Pagamento no local'),
                              subtitle: Text(
                                'Aceitar pagamento na arena',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: muted,
                                ),
                              ),
                              value: _onsitePayment,
                              activeTrackColor:
                                  AppColors.brand.withValues(alpha: 0.35),
                              activeThumbColor: AppColors.brand,
                              onChanged: (v) {
                                setState(() {
                                  _onsitePayment = v;
                                  if (!_onlinePayment && !_onsitePayment) {
                                    _onlinePayment = true;
                                  }
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 120),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        ),
        Material(
          elevation: 10,
          shadowColor: Colors.black26,
          color: theme.colorScheme.surface,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Salvar alterações',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  static InputDecoration _fieldDecoration(
    ThemeData theme, {
    required String label,
    String? hint,
    bool alignLabel = false,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      alignLabelWithHint: alignLabel,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      filled: true,
      fillColor: theme.colorScheme.surface,
    );
  }
}

class _FormSectionTitle extends StatelessWidget {
  const _FormSectionTitle({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      label,
      style: theme.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 8),
        child: child,
      ),
    );
  }
}

class _HeaderCover extends StatelessWidget {
  const _HeaderCover({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fallback = ColoredBox(
      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.55),
      child: Center(
        child: Icon(
          Icons.panorama_wide_angle_outlined,
          size: 48,
          color: theme.colorScheme.onSurface.withValues(alpha: 0.22),
        ),
      ),
    );

    if (url == null || url!.isEmpty) return fallback;

    return CachedNetworkImage(
      imageUrl: url!,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 240),
      placeholder: (_, __) => fallback,
      errorWidget: (_, __, ___) => fallback,
    );
  }
}

class _HeaderLogo extends StatelessWidget {
  const _HeaderLogo({required this.url, required this.name});

  final String? url;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: theme.colorScheme.surface,
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
          width: 3,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null && url!.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: url!,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 200),
              errorWidget: (_, __, ___) => _fallback(theme),
            )
          : _fallback(theme),
    );
  }

  Widget _fallback(ThemeData theme) {
    return ColoredBox(
      color: AppColors.brand.withValues(alpha: 0.12),
      child: Center(
        child: Text(
          name.trim().isNotEmpty
              ? name.trim().substring(0, 1).toUpperCase()
              : '?',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.brand,
          ),
        ),
      ),
    );
  }
}
