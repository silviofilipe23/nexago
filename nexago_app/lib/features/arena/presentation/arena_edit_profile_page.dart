import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/location/br_locations_data.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../athlete/presentation/widgets/br_state_city_fields.dart';
import '../../arenas/domain/arena_amenities.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arena_search_metadata.dart';
import '../data/arena_profile_edit_service.dart';
import '../domain/arena_profile_edit_providers.dart';
import '../domain/arena_providers.dart';
import '../domain/court_type_options.dart';
import '../domain/payout_pix_key_type.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';

class ArenaEditProfilePage extends ConsumerWidget {
  const ArenaEditProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arenaAsync = ref.watch(managedArenaDetailProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: arenaAsync.when(
        skipLoadingOnReload: true,
        data: (arena) {
          if (arena == null) {
            return const SafeArea(
              child: ArenaEmptyState(
                title: 'Arena não encontrada',
                message: 'Nenhuma arena vinculada ao seu usuário como gestor.',
                icon: Icons.storefront_outlined,
              ),
            );
          }
          return FadeSlideIn(child: _ArenaEditProfileForm(initial: arena));
        },
        loading: () => const SafeArea(
          child: ArenaLoadingState(label: 'Carregando perfil...'),
        ),
        error: (e, _) => SafeArea(child: ArenaErrorState(message: '$e')),
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

  static const _headerH = 200.0;
  static const _logoSize = 88.0;
  static const _logoOverlap = 36.0;

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
            decoration: _fieldDecoration(
              context,
              label: 'URL',
              hint: 'https://…',
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
                    height: _headerH + _logoOverlap,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Positioned(
                          top: 0,
                          left: 0,
                          right: 0,
                          height: _headerH,
                          child: _EditCoverHeader(
                            coverUrl: _coverUrl,
                            onBack: () => context.pop(),
                            onEditCover: () => _editUrl(
                              title: 'URL da imagem de capa',
                              current: _coverUrl,
                              onSet: (v) => _coverUrl = v,
                            ),
                          ),
                        ),
                        Positioned(
                          left: ArenaDashboardTokens.horizontalPadding,
                          top: _headerH - _logoOverlap,
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              _EditLogoBadge(
                                logoUrl: _logoUrl,
                                name: _name.text,
                                size: _logoSize,
                              ),
                              Positioned(
                                right: -2,
                                bottom: -2,
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
                                    child: Padding(
                                      padding: EdgeInsets.all(7),
                                      child: Icon(
                                        Icons.edit_rounded,
                                        size: 16,
                                        color: AppColors.black,
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
                    ArenaDashboardTokens.horizontalPadding,
                    12,
                    ArenaDashboardTokens.horizontalPadding,
                    24 + MediaQuery.of(context).viewInsets.bottom,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      Text(
                        'Editar perfil',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        arenaName.isNotEmpty
                            ? '$arenaName • visível para atletas na busca'
                            : 'Atualize como sua arena aparece no app.',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                          height: 1.45,
                        ),
                      ),
                      SizedBox(height: ArenaDashboardTokens.sectionGap),
                      const _EditSectionLabel(label: 'DADOS DA ARENA'),
                      SizedBox(height: 10),
                      _EditProfileCard(
                        child: Column(
                          children: [
                            TextFormField(
                              controller: _name,
                              textCapitalization: TextCapitalization.words,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                              ),
                              decoration: _fieldDecoration(
                                context,
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
                            SizedBox(height: 14),
                            TextFormField(
                              controller: _description,
                              minLines: 3,
                              maxLines: 6,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                              ),
                              decoration: _fieldDecoration(
                                context,
                                label: 'Descrição',
                                alignLabel: true,
                              ),
                            ),
                            SizedBox(height: 14),
                            TextFormField(
                              controller: _phone,
                              keyboardType: TextInputType.phone,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                              ),
                              decoration: _fieldDecoration(
                                context,
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
                            SizedBox(height: 14),
                            TextFormField(
                              controller: _whatsapp,
                              keyboardType: TextInputType.phone,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                              ),
                              decoration: _fieldDecoration(
                                context,
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
                            SizedBox(height: 14),
                            TextFormField(
                              controller: _address,
                              textCapitalization: TextCapitalization.sentences,
                              style: TextStyle(
                                color: context.themeColors.onSurface,
                              ),
                              decoration: _fieldDecoration(
                                context,
                                label: 'Endereço',
                              ),
                            ),
                            SizedBox(height: 14),
                            BrStateCityFields(
                              selectedState: _selectedState,
                              selectedCity: _selectedCity,
                              onStateChanged: (v) =>
                                  setState(() => _selectedState = v),
                              onCityChanged: (v) =>
                                  setState(() => _selectedCity = v),
                            ),
                            SizedBox(height: 14),
                            Text(
                              'Coordenadas (opcional)',
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text(
                              'Usadas para sugerir sua arena a atletas perto. '
                              'Você pode usar o GPS no local ou informar manualmente.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.35,
                              ),
                            ),
                            SizedBox(height: 10),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: _latitude,
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                          decimal: true,
                                          signed: true,
                                        ),
                                    style: TextStyle(
                                      color: context.themeColors.onSurface,
                                    ),
                                    decoration: _fieldDecoration(
                                      context,
                                      label: 'Latitude',
                                      hint: '-16.686891',
                                    ),
                                    validator: _validateOptionalLatitude,
                                  ),
                                ),
                                SizedBox(width: 12),
                                Expanded(
                                  child: TextFormField(
                                    controller: _longitude,
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                          decimal: true,
                                          signed: true,
                                        ),
                                    style: TextStyle(
                                      color: context.themeColors.onSurface,
                                    ),
                                    decoration: _fieldDecoration(
                                      context,
                                      label: 'Longitude',
                                      hint: '-49.264794',
                                    ),
                                    validator: _validateOptionalLongitude,
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 10),
                            OutlinedButton.icon(
                              onPressed: _saving ? null : _useCurrentLocation,
                              icon: Icon(Icons.my_location_rounded, size: 20),
                              label: Text('Usar localização atual'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.brand,
                                side: BorderSide(
                                  color: AppColors.brand.withValues(
                                    alpha: 0.45,
                                  ),
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
                          ],
                        ),
                      ),
                      SizedBox(height: ArenaDashboardTokens.sectionGap),
                      const _EditSectionLabel(label: 'BUSCA DO ATLETA'),
                      SizedBox(height: 10),
                      _EditProfileCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Esportes e superfícies usados nos filtros da aba Reservar. '
                              'Os tipos das quadras cadastradas são incluídos automaticamente.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.35,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            SizedBox(height: 16),
                            Text(
                              'Esportes oferecidos',
                              style: theme.textTheme.labelSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurfaceMuted,
                                letterSpacing: 0.6,
                              ),
                            ),
                            SizedBox(height: 10),
                            _SearchMetadataChips(
                              options: ArenaSearchMetadata.sportLabels,
                              selected: _sports,
                              onToggle: (l) => _toggleMetadataLabel(_sports, l),
                            ),
                            SizedBox(height: 16),
                            Text(
                              'Superfícies',
                              style: theme.textTheme.labelSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurfaceMuted,
                                letterSpacing: 0.6,
                              ),
                            ),
                            SizedBox(height: 10),
                            _SearchMetadataChips(
                              options: kArenaSurfaceOptions,
                              selected: _surfaces,
                              onToggle: (l) =>
                                  _toggleMetadataLabel(_surfaces, l),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: ArenaDashboardTokens.sectionGap),
                      const _EditSectionLabel(label: 'COMODIDADES'),
                      SizedBox(height: 10),
                      _EditProfileCard(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Column(
                          children: [
                            _AmenitySwitch(
                              label: 'Estacionamento',
                              value: _amenities.parking,
                              onChanged: (v) => setState(
                                () => _amenities = _amenities.copyWith(
                                  parking: v,
                                ),
                              ),
                            ),
                            _AmenitySwitch(
                              label: 'Vestiário',
                              value: _amenities.lockerRoom,
                              onChanged: (v) => setState(
                                () => _amenities = _amenities.copyWith(
                                  lockerRoom: v,
                                ),
                              ),
                            ),
                            _AmenitySwitch(
                              label: 'Quadra coberta',
                              value: _amenities.coveredCourt,
                              onChanged: (v) => setState(
                                () => _amenities = _amenities.copyWith(
                                  coveredCourt: v,
                                ),
                              ),
                            ),
                            _AmenitySwitch(
                              label: 'Bar',
                              value: _amenities.bar,
                              onChanged: (v) => setState(
                                () => _amenities = _amenities.copyWith(bar: v),
                              ),
                            ),
                            _AmenitySwitch(
                              label: 'Aluguel de raquetes',
                              value: _amenities.racketRental,
                              onChanged: (v) => setState(
                                () => _amenities = _amenities.copyWith(
                                  racketRental: v,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: ArenaDashboardTokens.sectionGap),
                      const _EditSectionLabel(label: 'PAGAMENTOS'),
                      SizedBox(height: 10),
                      _EditProfileCard(
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
                            if (_onlinePayment) ...[
                              Divider(
                                height: 1,
                                color: context.themeColors.onSurfaceMuted
                                    .withValues(alpha: 0.15),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                      'Recebimento PIX online',
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                            fontWeight: FontWeight.w700,
                                            color:
                                                context.themeColors.onSurface,
                                          ),
                                    ),
                                    SizedBox(height: 8),
                                    Text(
                                      'Atletas pagam PIX via NexaGO (Asaas). Repasses automáticos usam a chave abaixo.',
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            color: context
                                                .themeColors
                                                .onSurfaceMuted,
                                            height: 1.4,
                                          ),
                                    ),
                                    SizedBox(height: 10),
                                    DropdownButtonFormField<PayoutPixKeyType>(
                                      initialValue: _payoutPixKeyType,
                                      dropdownColor:
                                          context.themeColors.surfaceSheet,
                                      style: TextStyle(
                                        color: context.themeColors.onSurface,
                                      ),
                                      decoration: _fieldDecoration(
                                        context,
                                        label: 'Tipo da chave PIX',
                                      ),
                                      items: [
                                        for (final t in PayoutPixKeyType.values)
                                          DropdownMenuItem(
                                            value: t,
                                            child: Text(t.label),
                                          ),
                                      ],
                                      onChanged: _onlinePayment
                                          ? (v) {
                                              if (v != null) {
                                                setState(
                                                  () => _payoutPixKeyType = v,
                                                );
                                              }
                                            }
                                          : null,
                                      validator: (v) {
                                        if (!_onlinePayment) return null;
                                        if (v == null) {
                                          return 'Selecione o tipo da chave PIX';
                                        }
                                        return null;
                                      },
                                    ),
                                    SizedBox(height: 10),
                                    TextFormField(
                                      controller: _payoutPixKey,
                                      style: TextStyle(
                                        color: context.themeColors.onSurface,
                                      ),
                                      decoration: _fieldDecoration(
                                        context,
                                        label: 'Chave PIX da arena',
                                        hint: _payoutPixKeyType.hintForField(),
                                      ),
                                      validator: (v) {
                                        if (!_onlinePayment) return null;
                                        if ((v?.trim().length ?? 0) < 5) {
                                          return 'Informe uma chave PIX válida';
                                        }
                                        return _payoutPixKeyType.validateKey(
                                          v ?? '',
                                        );
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      SizedBox(height: 120),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        ),
        _StickySaveBar(saving: _saving, onSave: _save),
      ],
    );
  }

  InputDecoration _fieldDecoration(
    BuildContext context, {
    required String label,
    String? hint,
    bool alignLabel = false,
  }) {
    final colors = context.themeColors;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(
        color: colors.onSurfaceMuted.withValues(alpha: 0.22),
      ),
    );
    return InputDecoration(
      labelText: label,
      hintText: hint,
      alignLabelWithHint: alignLabel,
      labelStyle: TextStyle(
        color: colors.onSurfaceMuted,
        fontWeight: FontWeight.w500,
      ),
      hintStyle: TextStyle(
        color: colors.onSurfaceMuted.withValues(alpha: 0.75),
      ),
      filled: true,
      fillColor: colors.surfaceSheet,
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: BorderSide(color: AppColors.brand, width: 1.5),
      ),
      errorBorder: border.copyWith(
        borderSide: BorderSide(color: AppColors.live),
      ),
      focusedErrorBorder: border.copyWith(
        borderSide: BorderSide(color: AppColors.live, width: 1.5),
      ),
    );
  }
}

class _EditSectionLabel extends StatelessWidget {
  const _EditSectionLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppTypography.soraRegular(
        fontSize: 10,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.2,
      ),
    );
  }
}

class _EditProfileCard extends StatelessWidget {
  const _EditProfileCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        context,
        color: context.themeColors.surfaceRaised,
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class _StickySaveBar extends StatelessWidget {
  const _StickySaveBar({required this.saving, required this.onSave});

  final bool saving;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            12,
            ArenaDashboardTokens.horizontalPadding,
            12,
          ),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              onPressed: saving ? null : onSave,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(
                  alpha: 0.45,
                ),
                disabledForegroundColor: AppColors.black.withValues(alpha: 0.5),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: saving
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: AppColors.black,
                      ),
                    )
                  : Text(
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
    );
  }
}

class _EditCoverHeader extends StatelessWidget {
  const _EditCoverHeader({
    required this.coverUrl,
    required this.onBack,
    required this.onEditCover,
  });

  final String? coverUrl;
  final VoidCallback onBack;
  final VoidCallback onEditCover;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        _CoverImage(coverUrl: coverUrl),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.2),
                Colors.black.withValues(alpha: 0.6),
              ],
            ),
          ),
        ),
        SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 12, 12),
            child: Row(
              children: [
                IconButton(
                  onPressed: onBack,
                  icon: Icon(
                    Icons.arrow_back_rounded,
                    color: context.themeColors.onSurface,
                  ),
                ),
                Spacer(),
                Material(
                  color: context.themeColors.surfaceRaised.withValues(
                    alpha: 0.9,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: onEditCover,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.image_outlined,
                            size: 16,
                            color: context.themeColors.onSurface.withValues(
                              alpha: 0.9,
                            ),
                          ),
                          SizedBox(width: 6),
                          Text(
                            'ALTERAR CAPA',
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: context.themeColors.onSurface,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.5,
                                  fontSize: 10,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CoverImage extends StatelessWidget {
  const _CoverImage({required this.coverUrl});

  final String? coverUrl;

  @override
  Widget build(BuildContext context) {
    const fallback = _CoverSkeleton();

    if (coverUrl == null || coverUrl!.isEmpty) {
      return fallback;
    }
    return CachedNetworkImage(
      imageUrl: coverUrl!,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 280),
      placeholder: (_, __) => fallback,
      errorWidget: (_, __, ___) => fallback,
    );
  }
}

class _CoverSkeleton extends StatelessWidget {
  const _CoverSkeleton();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.themeColors.surfaceRaised,
      child: Center(
        child: Icon(
          Icons.panorama_wide_angle_outlined,
          size: 48,
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
        ),
      ),
    );
  }
}

class _EditLogoBadge extends StatelessWidget {
  const _EditLogoBadge({
    required this.logoUrl,
    required this.name,
    required this.size,
  });

  final String? logoUrl;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final monogram = _arenaMonogram(name);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.themeColors.surfaceRaised, width: 3),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: logoUrl != null && logoUrl!.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: logoUrl!,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 220),
              placeholder: (_, __) => _LogoGradient(monogram: monogram),
              errorWidget: (_, __, ___) => _LogoGradient(monogram: monogram),
            )
          : _LogoGradient(monogram: monogram),
    );
  }
}

String _arenaMonogram(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.length >= 2) {
    return words.take(3).map((w) => w[0].toUpperCase()).join();
  }
  final t = name.trim();
  if (t.isEmpty) return '?';
  if (t.length <= 3) return t.toUpperCase();
  return t.substring(0, 3).toUpperCase();
}

class _LogoGradient extends StatelessWidget {
  const _LogoGradient({required this.monogram});

  final String monogram;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFF8A4A), AppColors.brand, Color(0xFFE5560E)],
        ),
      ),
      child: Center(
        child: Text(
          monogram,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            color: AppColors.black,
            letterSpacing: -0.5,
          ),
        ),
      ),
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
          labelStyle: TextStyle(
            fontWeight: FontWeight.w700,
            color: isSelected ? AppColors.brand : context.themeColors.onSurface,
          ),
          side: BorderSide(
            color: isSelected
                ? AppColors.brand
                : context.themeColors.surfaceRaised,
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
