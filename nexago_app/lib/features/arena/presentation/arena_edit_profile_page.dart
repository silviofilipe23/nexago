import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import '../../../core/location/br_locations_data.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/presentation/widgets/br_state_city_fields.dart';
import '../../athlete/presentation/widgets/edit_profile/edit_profile_dropdown_field.dart';
import '../../athlete/presentation/widgets/edit_profile/edit_profile_field_decorations.dart';
import '../../athlete/presentation/widgets/edit_profile/edit_profile_media_header.dart';
import '../../athlete/presentation/widgets/edit_profile/edit_profile_section_header.dart';
import '../../athlete/presentation/widgets/edit_profile/edit_profile_text_field.dart';
import '../../arenas/domain/arena_amenities.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arena_search_metadata.dart';
import '../data/arena_profile_edit_service.dart';
import '../domain/arena_providers.dart';
import '../domain/payout_pix_key_type.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';

class ArenaEditProfilePage extends ConsumerWidget {
  const ArenaEditProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arenaAsync = ref.watch(managedArenaDetailProvider);

    return arenaAsync.when(
      skipLoadingOnReload: true,
      data: (arena) {
        if (arena == null) {
          return Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: const SafeArea(
              child: ArenaEmptyState(
                title: 'Arena não encontrada',
                message: 'Nenhuma arena vinculada ao seu usuário como gestor.',
                icon: Icons.storefront_outlined,
              ),
            ),
          );
        }
        return _ArenaEditProfileForm(initial: arena);
      },
      loading: () => Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: const SafeArea(
          child: ArenaLoadingState(label: 'Carregando perfil...'),
        ),
      ),
      error: (e, _) => Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: SafeArea(child: ArenaErrorState(message: '$e')),
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
  late final TextEditingController _latitude;
  late final TextEditingController _longitude;

  String? _selectedState;
  String? _selectedCity;

  late String? _coverUrl;
  late String? _logoUrl;
  late List<String> _sports;
  late List<String> _surfaces;
  late bool _onlinePayment;
  late bool _onsitePayment;
  late ArenaAmenities _amenities;
  late final TextEditingController _payoutPixKey;
  late PayoutPixKeyType _payoutPixKeyType;
  bool _saving = false;

  void _popOrBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.arenaProfile);
    }
  }

  PreferredSizeWidget _editProfileAppBar(ThemeData theme) {
    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      automaticallyImplyLeading: false,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: _popOrBack,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Editar perfil',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Center(
            child: FilledButton.icon(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(
                  alpha: 0.45,
                ),
                disabledForegroundColor: AppColors.black.withValues(alpha: 0.5),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.black,
                      ),
                    )
                  : const Icon(Icons.check_rounded, size: 18),
              label: const Text(
                'Salvar',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  void initState() {
    super.initState();
    final a = widget.initial;
    _name = TextEditingController(text: a.name);
    _description = TextEditingController(text: a.description ?? '');
    _phone = TextEditingController(text: a.phone ?? '');
    _whatsapp = TextEditingController(text: a.whatsapp ?? '');
    _address = TextEditingController(text: a.addressLine ?? '');
    _latitude = TextEditingController(
      text: a.latitude != null ? a.latitude!.toStringAsFixed(6) : '',
    );
    _longitude = TextEditingController(
      text: a.longitude != null ? a.longitude!.toStringAsFixed(6) : '',
    );
    if (a.state?.trim().isNotEmpty == true) {
      _selectedState = a.state!.trim().toUpperCase();
      final c = a.city?.trim() ?? '';
      _selectedCity = c.isNotEmpty ? c : null;
    } else {
      final legacy = BrLocationsData.parseLegacyLocation(a.city ?? '');
      _selectedState = legacy.state.isNotEmpty ? legacy.state : null;
      _selectedCity = legacy.city.isNotEmpty ? legacy.city : null;
    }
    _coverUrl = a.coverUrl;
    _logoUrl = a.logoUrl;
    final split = ArenaSearchMetadata.splitCourtTypes(
      a.courtTypes,
      surfacesFromDoc: a.surfaces,
    );
    _sports = List<String>.from(split.sports);
    _surfaces = List<String>.from(split.surfaces);
    _onlinePayment = a.onlinePaymentEnabled;
    _onsitePayment = a.onsitePaymentEnabled;
    _amenities = a.amenities;
    _payoutPixKey = TextEditingController(text: a.payoutPixKey);
    _payoutPixKeyType = PayoutPixKeyType.initial(
      storedType: a.payoutPixKeyType,
      pixKey: a.payoutPixKey,
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _phone.dispose();
    _whatsapp.dispose();
    _address.dispose();
    _latitude.dispose();
    _longitude.dispose();
    _payoutPixKey.dispose();
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
          backgroundColor: context.themeColors.surfaceSheet,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(
              ArenaDashboardTokens.cardRadius,
            ),
          ),
          title: Text(
            title,
            style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          content: TextField(
            controller: ctrl,
            keyboardType: TextInputType.url,
            style: TextStyle(color: context.themeColors.onSurface),
            decoration: editProfileInputDecoration(
              context: context,
              label: 'URL',
              hintText: 'https://…',
              focused: true,
            ),
            autofocus: true,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: context.themeColors.onSurfaceMuted),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
              ),
              child: Text('OK'),
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

  void _toggleMetadataLabel(List<String> target, String label) {
    setState(() {
      if (target.contains(label)) {
        target.remove(label);
      } else {
        target.add(label);
      }
    });
  }

  double? _parseOptionalCoord(String raw) {
    final t = raw.trim().replaceAll(',', '.');
    if (t.isEmpty) return null;
    return double.tryParse(t);
  }

  Future<void> _useCurrentLocation() async {
    final snap = await ref
        .read(userLocationServiceProvider)
        .tryCurrentPosition();
    if (!mounted) return;
    if (snap == null || !snap.hasCoordinates) {
      showAppSnackBar(
        context,
        'Ative a localização do aparelho ou preencha as coordenadas manualmente.',
        isError: true,
      );
      return;
    }
    setState(() {
      _latitude.text = snap.latitude!.toStringAsFixed(6);
      _longitude.text = snap.longitude!.toStringAsFixed(6);
    });
    showAppSnackBar(
      context,
      'Coordenadas atualizadas com a localização atual.',
    );
  }

  String? _validateOptionalLatitude(String? value) {
    final t = value?.trim() ?? '';
    if (t.isEmpty) return null;
    final n = double.tryParse(t.replaceAll(',', '.'));
    if (n == null) return 'Latitude inválida';
    if (n < -90 || n > 90) return 'Entre -90 e 90';
    return null;
  }

  String? _validateOptionalLongitude(String? value) {
    final t = value?.trim() ?? '';
    if (t.isEmpty) return null;
    final n = double.tryParse(t.replaceAll(',', '.'));
    if (n == null) return 'Longitude inválida';
    if (n < -180 || n > 180) return 'Entre -180 e 180';
    return null;
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

    final lat = _parseOptionalCoord(_latitude.text);
    final lng = _parseOptionalCoord(_longitude.text);
    if ((lat == null) != (lng == null)) {
      showAppSnackBar(
        context,
        'Informe latitude e longitude juntas, ou deixe ambas vazias.',
        isError: true,
      );
      return;
    }

    setState(() => _saving = true);
    var leftForSuccessRoute = false;
    try {
      await ref
          .read(arenaProfileEditServiceProvider)
          .saveProfile(
            arenaId: widget.initial.id,
            name: _name.text,
            description: _description.text,
            phone: _phone.text,
            whatsapp: _whatsapp.text.trim().isEmpty ? null : _whatsapp.text,
            address: _address.text,
            city: _selectedCity?.trim() ?? '',
            state: _selectedState,
            latitude: lat,
            longitude: lng,
            coverUrl: _coverUrl,
            logoUrl: _logoUrl,
            courtTypes: _sports,
            surfaces: _surfaces,
            onlinePaymentEnabled: _onlinePayment,
            onsitePaymentEnabled: _onsitePayment,
            amenities: _amenities,
            payoutPixKey: _payoutPixKey.text,
            payoutPixKeyType: _payoutPixKeyType.asaasValue,
          );
      await ref
          .read(arenaSearchMetadataServiceProvider)
          .syncFromCourts(
            arenaId: widget.initial.id,
            profileSports: _sports,
            surfaces: _surfaces,
          );
      if (!mounted) return;
      leftForSuccessRoute = true;
      ref.invalidate(managedArenaDetailProvider);
      context.go(AppRoutes.arenaProfileUpdateSuccess);
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
    final arenaName = widget.initial.name.trim();

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _editProfileAppBar(theme),
      body: AbsorbPointer(
        absorbing: _saving,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              8,
              ArenaDashboardTokens.horizontalPadding,
              24 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    EditProfileMediaHeader(
                      name: _name.text,
                      coverRemovedPending: false,
                      existingCoverUrl: _coverUrl,
                      pickedCoverBytes: null,
                      onEditCover: () => _editUrl(
                        title: 'URL da imagem de capa',
                        current: _coverUrl,
                        onSet: (v) => _coverUrl = v,
                      ),
                      existingAvatarUrl: _logoUrl,
                      pickedAvatarBytes: null,
                      onEditAvatar: () => _editUrl(
                        title: 'URL do logo',
                        current: _logoUrl,
                        onSet: (v) => _logoUrl = v,
                      ),
                    ),
                    const SizedBox(height: 52),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Text(
                          _name.text.trim().isNotEmpty
                              ? _name.text.trim()
                              : arenaName.isNotEmpty
                              ? arenaName
                              : 'Arena',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                            letterSpacing: -0.3,
                          ),
                        ),
                        Text(
                          '• visível para atletas na busca',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    const EditProfileSectionHeader(
                      icon: Icons.subject_rounded,
                      title: 'DADOS DA ARENA',
                    ),
                    EditProfileTextField(
                      controller: _name,
                      label: 'NOME DA ARENA',
                      required: true,
                      textCapitalization: TextCapitalization.words,
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Nome obrigatório';
                        }
                        return null;
                      },
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    EditProfileTextField(
                      controller: _description,
                      label: 'DESCRIÇÃO',
                      maxLines: 4,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: EditProfileTextField(
                            controller: _phone,
                            label: 'TELEFONE',
                            required: true,
                            keyboardType: TextInputType.phone,
                            hintText: '(DDD) número',
                            prefixIcon: Icon(
                              Icons.phone_outlined,
                              size: 20,
                              color: context.themeColors.onSurfaceMuted,
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
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: EditProfileTextField(
                            controller: _whatsapp,
                            label: 'WHATSAPP',
                            keyboardType: TextInputType.phone,
                            hintText: 'Opcional',
                            prefixIcon: Icon(
                              Icons.chat_bubble_outline_rounded,
                              size: 20,
                              color: context.themeColors.onSurfaceMuted,
                            ),
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) return null;
                              if (!isValidArenaPhoneDigits(v)) {
                                return 'Número inválido';
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    EditProfileTextField(
                      controller: _address,
                      label: 'ENDEREÇO',
                      textCapitalization: TextCapitalization.sentences,
                      prefixIcon: Icon(
                        Icons.location_on_outlined,
                        size: 20,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 12),
                    BrStateCityFields(
                      selectedState: _selectedState,
                      selectedCity: _selectedCity,
                      useEditProfileStyle: true,
                      horizontalLayout: true,
                      onStateChanged: (v) => setState(() => _selectedState = v),
                      onCityChanged: (v) => setState(() => _selectedCity = v),
                    ),
                    const SizedBox(height: 28),
                    const EditProfileSectionHeader(
                      icon: Icons.pin_drop_outlined,
                      title: 'COORDENADAS',
                    ),
                    Text(
                      'Usadas para sugerir sua arena a atletas perto. '
                      'Você pode usar o GPS no local ou informar manualmente.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: EditProfileTextField(
                            controller: _latitude,
                            label: 'LATITUDE',
                            hintText: '-16.686891',
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                              signed: true,
                            ),
                            validator: _validateOptionalLatitude,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: EditProfileTextField(
                            controller: _longitude,
                            label: 'LONGITUDE',
                            hintText: '-49.264794',
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                              signed: true,
                            ),
                            validator: _validateOptionalLongitude,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _saving ? null : _useCurrentLocation,
                      icon: const Icon(Icons.my_location_rounded, size: 20),
                      label: const Text('Usar localização atual'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.brand,
                        side: BorderSide(
                          color: AppColors.brand.withValues(alpha: 0.45),
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 28),
                    const EditProfileSectionHeader(
                      icon: Icons.search_rounded,
                      title: 'BUSCA DO ATLETA',
                    ),
                    Text(
                      'Esportes e superfícies usados nos filtros da aba Reservar. '
                      'Os tipos das quadras cadastradas são incluídos automaticamente.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.35,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'ESPORTES OFERECIDOS',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurfaceMuted,
                        letterSpacing: 0.6,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _SearchMetadataChips(
                      options: ArenaSearchMetadata.sportLabels,
                      selected: _sports,
                      onToggle: (l) => _toggleMetadataLabel(_sports, l),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'SUPERFÍCIES',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurfaceMuted,
                        letterSpacing: 0.6,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _SearchMetadataChips(
                      options: kArenaSurfaceOptions,
                      selected: _surfaces,
                      onToggle: (l) => _toggleMetadataLabel(_surfaces, l),
                    ),
                    const SizedBox(height: 28),
                    const EditProfileSectionHeader(
                      icon: Icons.grid_view_rounded,
                      title: 'COMODIDADES',
                    ),
                    _EditFormGroup(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(
                        children: [
                          _AmenitySwitch(
                            label: 'Estacionamento',
                            value: _amenities.parking,
                            onChanged: (v) => setState(
                              () =>
                                  _amenities = _amenities.copyWith(parking: v),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Vestiário',
                            value: _amenities.lockerRoom,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(
                                lockerRoom: v,
                              ),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Quadra coberta',
                            value: _amenities.coveredCourt,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(
                                coveredCourt: v,
                              ),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Bar',
                            value: _amenities.bar,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(bar: v),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Aluguel de raquetes',
                            value: _amenities.racketRental,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(
                                racketRental: v,
                              ),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Quadra acessível',
                            value: _amenities.hasAccessibleCourt,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(
                                hasAccessibleCourt: v,
                              ),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Banheiro acessível',
                            value: _amenities.hasAccessibleBathroom,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(
                                hasAccessibleBathroom: v,
                              ),
                            ),
                          ),
                          _formDivider(context),
                          _AmenitySwitch(
                            label: 'Vaga PCD',
                            value: _amenities.hasPcdParking,
                            onChanged: (v) => setState(
                              () => _amenities = _amenities.copyWith(
                                hasPcdParking: v,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    const EditProfileSectionHeader(
                      icon: Icons.account_balance_wallet_outlined,
                      title: 'PAGAMENTOS',
                    ),
                    _EditFormGroup(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(
                        children: [
                          SwitchListTile.adaptive(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 4,
                            ),
                            title: Text(
                              'Pagamento online',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                            subtitle: Text(
                              'Reservas com pagamento antecipado',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.35,
                              ),
                            ),
                            value: _onlinePayment,
                            activeTrackColor: AppColors.brand.withValues(
                              alpha: 0.35,
                            ),
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
                            color: context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.15),
                          ),
                          SwitchListTile.adaptive(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 4,
                            ),
                            title: Text(
                              'Pagamento no local',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                            subtitle: Text(
                              'Aceitar pagamento na arena',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.35,
                              ),
                            ),
                            value: _onsitePayment,
                            activeTrackColor: AppColors.brand.withValues(
                              alpha: 0.35,
                            ),
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
                    if (_onlinePayment) ...[
                      const SizedBox(height: 12),
                      _EditFormGroup(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Recebimento PIX online',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Atletas pagam PIX via NexaGO (Asaas). '
                              'Repasses automáticos usam a chave abaixo.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.4,
                              ),
                            ),
                            const SizedBox(height: 12),
                            EditProfileDropdownField<PayoutPixKeyType>(
                              value: _payoutPixKeyType,
                              label: 'TIPO DA CHAVE PIX',
                              required: true,
                              items: [
                                for (final t in PayoutPixKeyType.values)
                                  DropdownMenuItem(
                                    value: t,
                                    child: Text(t.label),
                                  ),
                              ],
                              onChanged: (v) {
                                if (!_onlinePayment || v == null) return;
                                setState(() => _payoutPixKeyType = v);
                              },
                              validator: (v) {
                                if (!_onlinePayment) return null;
                                if (v == null) {
                                  return 'Selecione o tipo da chave PIX';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            EditProfileTextField(
                              controller: _payoutPixKey,
                              label: 'CHAVE PIX DA ARENA',
                              required: true,
                              hintText: _payoutPixKeyType.hintForField(),
                              validator: (v) {
                                if (!_onlinePayment) return null;
                                if ((v?.trim().length ?? 0) < 5) {
                                  return 'Informe uma chave PIX válida';
                                }
                                return _payoutPixKeyType.validateKey(v ?? '');
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 28),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: AppColors.black,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.black,
                              ),
                            )
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.check_rounded,
                                  color: AppColors.black,
                                ),
                                SizedBox(width: 10),
                                Text(
                                  'Salvar alterações',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                    color: AppColors.black,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _formDivider(BuildContext context) {
    return Divider(
      height: 1,
      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
    );
  }
}

class _EditFormGroup extends StatelessWidget {
  const _EditFormGroup({
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        side: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(padding: padding, child: child),
    );
  }
}

class _SearchMetadataChips extends StatelessWidget {
  const _SearchMetadataChips({
    required this.options,
    required this.selected,
    required this.onToggle,
  });

  final List<String> options;
  final List<String> selected;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((label) {
        final isSelected = selected.contains(label);
        return FilterChip(
          label: Text(label),
          selected: isSelected,
          showCheckmark: true,
          checkmarkColor: AppColors.brand,
          selectedColor: AppColors.brand.withValues(alpha: 0.12),
          backgroundColor: context.themeColors.surfaceRaised,
          labelStyle: TextStyle(
            fontWeight: FontWeight.w700,
            color: isSelected
                ? AppColors.brand
                : context.themeColors.onSurfaceMuted,
          ),
          side: BorderSide(
            color: isSelected
                ? AppColors.brand
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
          onSelected: (_) => onToggle(label),
        );
      }).toList(),
    );
  }
}

class _AmenitySwitch extends StatelessWidget {
  const _AmenitySwitch({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      value: value,
      onChanged: onChanged,
      activeTrackColor: AppColors.brand.withValues(alpha: 0.35),
      activeThumbColor: AppColors.brand,
      title: Text(
        label,
        style: TextStyle(
          color: context.themeColors.onSurface,
          fontWeight: FontWeight.w600,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
    );
  }
}
