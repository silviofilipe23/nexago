import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent, type PanelIconName } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';

type ChannelKind = 'whatsapp' | 'phone' | 'email' | 'instagram';

interface Channel {
  id: string;
  kind: ChannelKind;
  label: string;
  value: string;
  visible: boolean;
}

interface TeamContact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

const CHANNEL_ICON: Record<ChannelKind, PanelIconName> = {
  whatsapp: 'mail',
  phone: 'mail',
  email: 'mail',
  instagram: 'share',
};

const CHANNEL_TONE: Record<ChannelKind, 'green' | 'orange' | 'dim'> = {
  whatsapp: 'green',
  phone: 'dim',
  email: 'orange',
  instagram: 'dim',
};

const DEFAULT_CHANNELS: Channel[] = [
  { id: 'ch1', kind: 'whatsapp', label: 'WhatsApp', value: '+55 62 9 9999-9999', visible: true },
  { id: 'ch2', kind: 'phone', label: 'Telefone fixo', value: '+55 62 3251-4477', visible: false },
  { id: 'ch3', kind: 'email', label: 'E-mail', value: 'contato@arenacfc.com.br', visible: true },
  { id: 'ch4', kind: 'instagram', label: 'Instagram', value: '@arenacfc', visible: true },
];

const DEFAULT_TEAM: TeamContact[] = [
  { id: 'tm1', name: 'Rafael Souza', role: 'Gestor principal', phone: '+55 62 9 9999-9999' },
  { id: 'tm2', name: 'Bruna Lima', role: 'Recepção', phone: '+55 62 9 8888-1212' },
];

/** Tela Contatos da arena do painel (protótipo ArContatosScreen): canais de comunicação, endereço e equipe de contato. */
@Component({
  selector: 'ar-panel-profile-contacts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Contatos da arena" [subtitle]="arenaName() + ' · canais de comunicação com clientes'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="save()">
          <ar-icon name="check" [size]="14" />
          Salvar alterações
        </button>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          <ar-panel-card kicker="Exibidos no perfil público do app" title="Canais de contato">
            <button type="button" class="ar-mini-btn" card-actions (click)="addChannel()">
              <ar-icon name="plus" [size]="14" />
              Adicionar canal
            </button>

            <div class="channel-list">
              @for (ch of channels(); track ch.id) {
                <div class="channel-row">
                  <div class="channel-icon" [class]="'tone-' + channelTone[ch.kind]">
                    <ar-icon [name]="channelIcon[ch.kind]" [size]="15" />
                  </div>

                  @if (editingId() === ch.id) {
                    <div class="channel-edit">
                      <input type="text" class="input-box" placeholder="Nome do canal" [value]="ch.label" (input)="updateChannel(ch.id, 'label', $any($event.target).value)" />
                      <input type="text" class="input-box" placeholder="Valor" [value]="ch.value" (input)="updateChannel(ch.id, 'value', $any($event.target).value)" />
                    </div>
                  } @else {
                    <div class="channel-body">
                      <div class="channel-label">{{ ch.label }}</div>
                      <div class="channel-value">{{ ch.value }}</div>
                    </div>
                  }

                  <button type="button" class="visibility-btn" (click)="toggleVisible(ch.id)">
                    <ar-pill [tone]="ch.visible ? 'green' : 'dim'">{{ ch.visible ? 'Visível no app' : 'Oculto' }}</ar-pill>
                  </button>

                  <button type="button" class="ar-ghost-btn" (click)="toggleEdit(ch.id)">
                    <ar-icon name="edit" [size]="13" />
                    {{ editingId() === ch.id ? 'Concluir' : 'Editar' }}
                  </button>
                </div>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Endereço">
            <div class="field-label">Endereço completo</div>
            <input type="text" class="input-box address-input" [value]="addressFull()" (input)="addressFull.set($any($event.target).value)" />

            <div class="row-3">
              <div>
                <div class="field-label">Cidade</div>
                <input type="text" class="input-box" [value]="city()" (input)="city.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Estado</div>
                <input type="text" class="input-box" [value]="state()" (input)="state.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">CEP</div>
                <input type="text" class="input-box" [value]="cep()" (input)="cep.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card [kicker]="team().length + ' pessoas'" title="Equipe de contato">
            <button type="button" class="ar-mini-btn" card-actions (click)="showAddPerson.set(true)">
              <ar-icon name="plus" [size]="14" />
              Adicionar pessoa
            </button>

            <div class="team-list">
              @for (tm of team(); track tm.id) {
                <div class="team-row">
                  <div class="avatar">{{ initialsOf(tm.name) }}</div>
                  <div class="team-body">
                    <div class="team-name">{{ tm.name }}</div>
                    <div class="team-role">{{ tm.role }}</div>
                  </div>
                  <div class="team-phone">{{ tm.phone }}</div>
                </div>
              }
            </div>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card title="Prévia no app">
            <div class="preview-list">
              @for (ch of visibleChannels(); track ch.id) {
                <div class="preview-row">
                  <div class="channel-icon small" [class]="'tone-' + channelTone[ch.kind]">
                    <ar-icon [name]="channelIcon[ch.kind]" [size]="13" />
                  </div>
                  <span>{{ ch.value }}</span>
                </div>
              } @empty {
                <div class="preview-empty">Nenhum canal visível no app.</div>
              }
            </div>
          </ar-panel-card>

          <div class="hint-box">
            Canais marcados como "Oculto" ficam salvos para uso interno, mas não aparecem para os clientes no app.
          </div>
        </div>
      </div>

      @if (showAddPerson()) {
        <ar-modal (close)="showAddPerson.set(false)">
          <h2 class="modal-title">Adicionar pessoa</h2>
          <p class="modal-subtitle">Alguém da equipe que clientes podem contatar</p>

          <div class="field-label">Nome</div>
          <input type="text" class="input-box name-input" placeholder="Nome completo" [value]="newPersonName()" (input)="newPersonName.set($any($event.target).value)" />

          <div class="field-label">Cargo</div>
          <input type="text" class="input-box name-input" placeholder="Ex.: Recepção" [value]="newPersonRole()" (input)="newPersonRole.set($any($event.target).value)" />

          <div class="field-label">Telefone</div>
          <input type="text" class="input-box date-input" placeholder="+55 62 9 0000-0000" [value]="newPersonPhone()" (input)="newPersonPhone.set($any($event.target).value)" />

          <div class="actions">
            <button type="button" class="ar-ghost-btn" (click)="showAddPerson.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canAddPerson()" (click)="addPerson()">
              Adicionar
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .channel-list {
      display: flex;
      flex-direction: column;
      margin-top: 6px;
    }

    .channel-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .channel-row:last-child {
      border-bottom: none;
    }

    .channel-icon {
      width: 38px;
      height: 38px;
      flex: none;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .channel-icon.small {
      width: 28px;
      height: 28px;
      border-radius: 8px;
    }

    .channel-icon.tone-green {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.3);
      color: var(--nx-win);
    }

    .channel-icon.tone-orange {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .channel-body {
      flex: 1;
      min-width: 0;
    }

    .channel-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .channel-value {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .channel-edit {
      flex: 1;
      display: flex;
      gap: 10px;
      min-width: 0;
    }

    .channel-edit .input-box {
      flex: 1;
    }

    .visibility-btn {
      flex: none;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
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

    .address-input {
      margin-bottom: 18px;
    }

    .row-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
    }

    .team-list {
      display: flex;
      flex-direction: column;
      margin-top: 6px;
    }

    .team-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .team-row:last-child {
      border-bottom: none;
    }

    .avatar {
      width: 38px;
      height: 38px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
    }

    .team-body {
      flex: 1;
      min-width: 0;
    }

    .team-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .team-role {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .team-phone {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .preview-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .preview-row {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .preview-empty {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .hint-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
    }

    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .name-input {
      margin-bottom: 18px;
    }

    .date-input {
      margin-bottom: 24px;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .row-3 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileContactsComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly channelIcon = CHANNEL_ICON;
  protected readonly channelTone = CHANNEL_TONE;
  protected readonly initialsOf = initialsOf;

  protected readonly channels = signal<Channel[]>(DEFAULT_CHANNELS);
  protected readonly team = signal<TeamContact[]>(DEFAULT_TEAM);
  protected readonly editingId = signal<string | null>(null);

  protected readonly addressFull = signal('Esq com – Rua Moscou, Av. Francisco Inácio Ferreira, qd 29 – LT 01');
  protected readonly city = signal('Aparecida de Goiânia');
  protected readonly state = signal('GO');
  protected readonly cep = signal('74968-570');

  protected readonly showAddPerson = signal(false);
  protected readonly newPersonName = signal('');
  protected readonly newPersonRole = signal('');
  protected readonly newPersonPhone = signal('');

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly visibleChannels = computed(() => this.channels().filter((c) => c.visible));

  protected readonly canAddPerson = computed(
    () => this.newPersonName().trim().length > 0 && this.newPersonPhone().trim().length > 0,
  );

  protected updateChannel(id: string, field: 'label' | 'value', value: string): void {
    this.channels.update((current) => current.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  protected toggleVisible(id: string): void {
    this.channels.update((current) => current.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  }

  protected toggleEdit(id: string): void {
    this.editingId.update((current) => (current === id ? null : id));
  }

  protected addChannel(): void {
    const id = `ch-${Date.now()}`;
    this.channels.update((current) => [...current, { id, kind: 'phone', label: '', value: '', visible: true }]);
    this.editingId.set(id);
  }

  protected addPerson(): void {
    if (!this.canAddPerson()) {
      return;
    }
    this.team.update((current) => [
      ...current,
      { id: `tm-${Date.now()}`, name: this.newPersonName().trim(), role: this.newPersonRole().trim() || 'Equipe', phone: this.newPersonPhone().trim() },
    ]);
    this.showAddPerson.set(false);
    this.newPersonName.set('');
    this.newPersonRole.set('');
    this.newPersonPhone.set('');
  }

  protected save(): void {
    this.router.navigate(['/painel/perfil']);
  }
}
