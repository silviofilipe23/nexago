import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import {
  ARENA_AMENITY_KEYS,
  ARENA_AMENITY_LABEL,
  ARENA_SPORT_OPTIONS,
  ARENA_SURFACE_OPTIONS,
  type ArenaProfile,
} from '../data/arena-profile.model';
import { arenaFirestore } from '../data/firestore';
import { arenaStorage } from '../data/storage';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ToggleComponent } from '../ui/toggle.component';
import { fetchArenaProfile, saveArenaBasicInfo, uploadArenaImage, validateArenaImageFile, type ArenaImageKind } from './arena-profile-repository';

function initialsOfName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Tela Perfil do painel: dados reais de `arenas/{arenaId}` (nome, descrição, modalidades,
 *  superfícies, comodidades, pagamento, capa/logo), editáveis inline. Avaliação/avaliações são
 *  agregadas por Cloud Function (só leitura). Sem "seguidores"/"visitas da semana"/"completude
 *  do perfil" — não existe nenhum desses campos no backend, eram só protótipo. Capa/logo sobem
 *  direto para o Storage (`arenas/{arenaId}/cover|logo`, ver storage.rules) assim que o arquivo é
 *  escolhido; a URL retornada só é persistida no Firestore quando o gestor clica em
 *  "Salvar alterações", igual aos demais campos desta tela. */
@Component({
  selector: 'ar-panel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ToggleComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Perfil da arena" subtitle="Como os atletas veem a arena no app">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || loading()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar alterações' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando perfil…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (profile()) {
          <div class="main-grid">
            <div class="col-left">
              @if (saveError(); as serr) {
                <div class="error-banner">{{ serr }}</div>
              }
              @if (uploadError(); as uerr) {
                <div class="error-banner">{{ uerr }}</div>
              }

              <div class="cover">
                @if (coverUrl().trim()) {
                  <img [src]="coverUrl()" alt="" class="cover-img" />
                } @else {
                  <svg width="100%" height="150" viewBox="0 0 1000 150" preserveAspectRatio="none" class="cover-svg">
                    <defs>
                      <radialGradient id="arProfileG1" cx="24%" cy="45%">
                        <stop offset="0%" stop-color="#FF6A1A" stop-opacity="0.45" />
                        <stop offset="100%" stop-color="#FF6A1A" stop-opacity="0" />
                      </radialGradient>
                      <radialGradient id="arProfileG2" cx="82%" cy="30%">
                        <stop offset="0%" stop-color="#2BD17E" stop-opacity="0.22" />
                        <stop offset="100%" stop-color="#2BD17E" stop-opacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="1000" height="150" fill="#0d0d0e" />
                    <rect width="1000" height="150" fill="url(#arProfileG1)" />
                    <rect width="1000" height="150" fill="url(#arProfileG2)" />
                  </svg>
                }
                <button
                  type="button"
                  class="image-edit-btn cover-edit-btn"
                  [disabled]="coverUploading()"
                  (click)="coverFileInput.click()"
                >
                  @if (coverUploading()) {
                    <span class="spinner-light" aria-hidden="true"></span>
                    Enviando…
                  } @else {
                    <ar-icon name="camera" [size]="14" />
                    {{ coverUrl().trim() ? 'Alterar capa' : 'Adicionar capa' }}
                  }
                </button>
                <input
                  #coverFileInput
                  type="file"
                  accept="image/*"
                  class="visually-hidden-input"
                  aria-label="Selecionar imagem de capa"
                  (change)="onCoverFileSelected($event)"
                />
              </div>

              <div class="identity">
                <div class="identity-avatar" [style.background-image]="logoUrl().trim() ? 'url(' + logoUrl() + ')' : null">
                  @if (!logoUrl().trim()) {
                    <span>{{ initials() }}</span>
                  }
                  <button
                    type="button"
                    class="image-edit-btn avatar-edit-btn"
                    [disabled]="logoUploading()"
                    aria-label="Alterar logo da arena"
                    (click)="logoFileInput.click()"
                  >
                    @if (logoUploading()) {
                      <span class="spinner-light spinner-sm" aria-hidden="true"></span>
                    } @else {
                      <ar-icon name="camera" [size]="12" />
                    }
                  </button>
                  <input
                    #logoFileInput
                    type="file"
                    accept="image/*"
                    class="visually-hidden-input"
                    aria-label="Selecionar logo da arena"
                    (change)="onLogoFileSelected($event)"
                  />
                </div>
                <div class="identity-body">
                  <div class="identity-name-row">
                    <h1>{{ name() || 'Nome da arena' }}</h1>
                  </div>
                  <div class="identity-city">{{ profile()!.city }}{{ profile()!.state ? ' · ' + profile()!.state : '' }}</div>
                </div>
              </div>

              <div class="stats-row">
                <div class="stat accent">
                  <div class="stat-value">{{ profile()!.ratingAverage.toFixed(1) }}</div>
                  <div class="stat-label">avaliação</div>
                </div>
                <div class="stat">
                  <div class="stat-value">{{ profile()!.reviewsCount }}</div>
                  <div class="stat-label">avaliações</div>
                </div>
              </div>

              <ar-panel-card title="Dados básicos">
                <div class="field-label">Nome da arena</div>
                <input type="text" class="input-box" [value]="name()" (input)="name.set($any($event.target).value)" />

                <div class="field-label row-gap">Descrição</div>
                <textarea class="input-box textarea" rows="3" [value]="description()" (input)="description.set($any($event.target).value)"></textarea>
              </ar-panel-card>

              <ar-panel-card title="Modalidades">
                <div class="field-label">Esportes</div>
                <div class="chip-row">
                  @for (s of sportOptions; track s) {
                    <button type="button" class="ar-chip" [class.active]="courtTypes().includes(s)" (click)="toggleSport(s)">{{ s }}</button>
                  }
                </div>

                <div class="field-label row-gap">Superfícies</div>
                <div class="chip-row">
                  @for (s of surfaceOptions; track s) {
                    <button type="button" class="ar-chip" [class.active]="surfaces().includes(s)" (click)="toggleSurface(s)">{{ s }}</button>
                  }
                </div>
              </ar-panel-card>

              <ar-panel-card title="Comodidades">
                <div class="amenities-list">
                  @for (key of amenityKeys; track key) {
                    <div class="amenity-row">
                      <span>{{ amenityLabel[key] }}</span>
                      <ar-toggle [checked]="amenities()[key]" (changed)="setAmenity(key, $event)" />
                    </div>
                  }
                </div>
              </ar-panel-card>
            </div>

            <div class="col-right">
              <ar-panel-card title="Formas de pagamento">
                <div class="amenity-row">
                  <span>Pagamento online (Pix)</span>
                  <ar-toggle [checked]="onlinePaymentEnabled()" (changed)="onlinePaymentEnabled.set($event)" />
                </div>
                <div class="amenity-row">
                  <span>Pagamento no local</span>
                  <ar-toggle [checked]="onsitePaymentEnabled()" (changed)="onsitePaymentEnabled.set($event)" />
                </div>
              </ar-panel-card>

              <ar-panel-card title="Horários de funcionamento">
                <a routerLink="/painel/perfil/horarios" class="ar-ghost-btn" card-actions>
                  <ar-icon name="edit" [size]="13" />
                  Editar
                </a>
                @if (courtsCount() > 0) {
                  <p class="text">{{ courtsCount() }} quadra{{ courtsCount() === 1 ? '' : 's' }} cadastrada{{ courtsCount() === 1 ? '' : 's' }}.</p>
                } @else {
                  <p class="text">Nenhuma quadra cadastrada ainda — cadastre quadras antes de definir horários.</p>
                }
              </ar-panel-card>

              <ar-panel-card title="Contato">
                <a routerLink="/painel/perfil/contatos" class="ar-ghost-btn" card-actions>
                  <ar-icon name="edit" [size]="13" />
                  Editar
                </a>
                <div class="contact-list">
                  <div class="contact-row">
                    <div class="contact-icon whatsapp">
                      <ar-icon name="mail" [size]="15" />
                    </div>
                    <div>
                      <div class="contact-label">WhatsApp</div>
                      <div class="contact-value">{{ profile()!.whatsapp || 'Não informado' }}</div>
                    </div>
                  </div>
                </div>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-bottom: 4px;
    }

    .main-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .cover {
      height: 150px;
      position: relative;
      overflow: hidden;
      border-radius: var(--nx-r-4);
      flex: none;
      background: var(--nx-surface-1);
    }

    .cover-svg {
      position: absolute;
      inset: 0;
      display: block;
    }

    .cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .visually-hidden-input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .image-edit-btn {
      position: absolute;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      cursor: pointer;
      color: #fff;
      font-family: var(--nx-font-display);
      font-weight: 600;
      transition: background-color 140ms var(--nx-ease-out);
    }

    .image-edit-btn:disabled {
      cursor: default;
    }

    .cover-edit-btn {
      right: 12px;
      bottom: 12px;
      height: 32px;
      padding: 0 13px;
      border-radius: var(--nx-r-2);
      background: rgba(10, 10, 10, 0.55);
      font-size: 12px;
    }

    .cover-edit-btn:hover:not(:disabled) {
      background: rgba(10, 10, 10, 0.7);
    }

    .avatar-edit-btn {
      inset: 0;
      width: 100%;
      height: 100%;
      justify-content: center;
      background: rgba(10, 10, 10, 0);
      opacity: 0;
    }

    .avatar-edit-btn:hover:not(:disabled),
    .avatar-edit-btn:focus-visible:not(:disabled),
    .avatar-edit-btn:disabled {
      background: rgba(10, 10, 10, 0.55);
      opacity: 1;
    }

    .spinner-light {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      animation: ar-spin 0.7s linear infinite;
    }

    .spinner-light.spinner-sm {
      width: 12px;
      height: 12px;
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner-light {
        animation-duration: 1.6s;
      }
    }

    .identity {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-top: -46px;
      padding: 0 4px;
    }

    .identity-avatar {
      width: 74px;
      height: 74px;
      border-radius: 18px;
      flex: none;
      position: relative;
      overflow: hidden;
      background-color: transparent;
      background-image: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      background-size: cover;
      background-position: center;
      border: 4px solid var(--nx-bg);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 900;
      font-size: 17px;
      color: #fff;
    }

    .identity-body {
      margin-top: 40px;
      min-width: 0;
    }

    .identity-name-row h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .identity-city {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .stats-row {
      display: flex;
      gap: 10px;
    }

    .stat {
      flex: 1;
      padding: 12px 10px;
      border-radius: var(--nx-r-2);
      text-align: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .stat.accent {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.28);
    }

    .stat-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
    }

    .stat.accent .stat-value {
      color: var(--nx-orange-500);
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 4px;
    }

    .text {
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .textarea {
      height: auto;
      padding: 12px 14px;
      resize: vertical;
      font-family: var(--nx-font-ui);
    }

    .chip-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .amenities-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .amenity-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .amenity-row:last-child {
      border-bottom: none;
    }

    .contact-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .contact-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .contact-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
    }

    .contact-icon.whatsapp {
      background: rgba(37, 211, 102, 0.12);
      color: #25d366;
    }

    .contact-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .contact-value {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly sportOptions = ARENA_SPORT_OPTIONS;
  protected readonly surfaceOptions = ARENA_SURFACE_OPTIONS;
  protected readonly amenityKeys = ARENA_AMENITY_KEYS;
  protected readonly amenityLabel = ARENA_AMENITY_LABEL;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly courtsCount = computed(() => this.arenaContext.courtsCount());

  protected readonly profile = signal<ArenaProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly coverUploading = signal(false);
  protected readonly logoUploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly name = linkedSignal(() => this.profile()?.name ?? '');
  protected readonly description = linkedSignal(() => this.profile()?.description ?? '');
  protected readonly coverUrl = linkedSignal(() => this.profile()?.coverUrl ?? '');
  protected readonly logoUrl = linkedSignal(() => this.profile()?.logoUrl ?? '');
  protected readonly courtTypes = linkedSignal(() => this.profile()?.courtTypes ?? []);
  protected readonly surfaces = linkedSignal(() => this.profile()?.surfaces ?? []);
  protected readonly amenities = linkedSignal(() => this.profile()?.amenities ?? {
    parking: false,
    lockerRoom: false,
    coveredCourt: false,
    bar: false,
    racketRental: false,
  });
  protected readonly onlinePaymentEnabled = linkedSignal(() => this.profile()?.onlinePaymentEnabled ?? true);
  protected readonly onsitePaymentEnabled = linkedSignal(() => this.profile()?.onsitePaymentEnabled ?? true);

  protected readonly initials = computed(() => initialsOfName(this.name() || 'Arena'));

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.profile.set(await fetchArenaProfile(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar o perfil.');
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleSport(sport: string): void {
    this.courtTypes.update((current) => (current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport]));
  }

  protected toggleSurface(surface: string): void {
    this.surfaces.update((current) => (current.includes(surface) ? current.filter((s) => s !== surface) : [...current, surface]));
  }

  protected setAmenity(key: keyof ArenaProfile['amenities'], value: boolean): void {
    this.amenities.update((current) => ({ ...current, [key]: value }));
  }

  protected onCoverFileSelected(event: Event): void {
    void this.handleImageSelected(event, 'cover');
  }

  protected onLogoFileSelected(event: Event): void {
    void this.handleImageSelected(event, 'logo');
  }

  private async handleImageSelected(event: Event, kind: ArenaImageKind): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    const validationError = validateArenaImageFile(file);
    if (validationError) {
      this.uploadError.set(validationError);
      return;
    }

    this.uploadError.set(null);
    const uploading = kind === 'cover' ? this.coverUploading : this.logoUploading;
    uploading.set(true);
    try {
      const url = await uploadArenaImage(arenaStorage(), arenaId, kind, file);
      if (kind === 'cover') {
        this.coverUrl.set(url);
      } else {
        this.logoUrl.set(url);
      }
    } catch {
      this.uploadError.set('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.saveError.set(null);
    try {
      await saveArenaBasicInfo(arenaFirestore(), arenaId, {
        name: this.name(),
        description: this.description(),
        coverUrl: this.coverUrl(),
        logoUrl: this.logoUrl(),
        courtTypes: this.courtTypes(),
        surfaces: this.surfaces(),
        amenities: this.amenities(),
        onlinePaymentEnabled: this.onlinePaymentEnabled(),
        onsitePaymentEnabled: this.onsitePaymentEnabled(),
      });
      await this.load(arenaId);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      this.saving.set(false);
    }
  }
}
