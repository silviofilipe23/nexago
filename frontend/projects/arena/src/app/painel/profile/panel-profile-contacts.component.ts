import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { arenaProfileFromDoc, saveArenaContacts } from './arena-profile-repository';

/** Tela Contatos da arena: WhatsApp e telefone em `arenas/{arenaId}`.
 *  Instagram, e-mail, "equipe de contatos" e toggle de visibilidade por canal saíram — não
 *  existe nenhum desses campos no backend (nem Flutter, nem rules), eram só protótipo.
 *  O endereço saiu para "Dados cadastrais", que o grava estruturado e com coordenada. */
@Component({
  selector: 'ar-panel-profile-contacts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Contatos da arena" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || arenaLoading()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar alterações' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading()) {
          <p class="state-text">Carregando contatos…</p>
        } @else {
          @if (saveError(); as serr) {
            <div class="error-banner">{{ serr }}</div>
          }

          <ar-panel-card kicker="Exibidos no perfil público do app" title="Canais de contato">
            <div class="row-2">
              <div>
                <div class="field-label">Telefone</div>
                <input type="tel" class="input-box" placeholder="(11) 3251-4477" [value]="phone()" (input)="phone.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">WhatsApp</div>
                <input type="tel" class="input-box" placeholder="(11) 99999-0000" [value]="whatsapp()" (input)="whatsapp.set($any($event.target).value)" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Endereço">
            <a routerLink="/painel/perfil/cadastro" class="ar-ghost-btn" card-actions>
              <ar-icon name="edit" [size]="13" />
              Editar
            </a>
            <p class="state-text">O endereço da arena agora fica em Dados cadastrais, junto do CNPJ — lá ele vira CEP, rua e número, e posiciona a arena no mapa do app.</p>
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 640px;
      overflow: auto;
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

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    @media (max-width: 720px) {
      .row-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileContactsComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · canais de comunicação com clientes`);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  private readonly phoneSeed = signal('');
  private readonly whatsappSeed = signal('');

  protected readonly phone = linkedSignal(() => this.phoneSeed());
  protected readonly whatsapp = linkedSignal(() => this.whatsappSeed());

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      // Semente única por arena: o doc do contexto é ao vivo, e reagir a ele reescreveria os
      // campos por baixo de quem está editando. Ler daqui não custa ida ao servidor.
      const data = untracked(() => this.arenaContext.arenaDocData());
      const profile = data ? arenaProfileFromDoc(data) : null;
      this.phoneSeed.set(profile?.phone ?? '');
      this.whatsappSeed.set(profile?.whatsapp ?? '');
    });
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.saveError.set(null);
    try {
      await saveArenaContacts(arenaFirestore(), arenaId, {
        phone: this.phone(),
        whatsapp: this.whatsapp(),
      });
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar os contatos.');
    } finally {
      this.saving.set(false);
    }
  }
}
