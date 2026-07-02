import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Shell do fluxo de auth: split com painel de marca à esquerda (protótipo
 * "NexaGO Backoffice Login") e formulário centralizado à direita.
 * Abaixo de 980px o painel some e a marca aparece compacta acima do card.
 */
@Component({
  selector: 'bo-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="brand">
        <div class="glow"></div>
        <svg class="court" width="520" height="520" viewBox="0 0 520 520" fill="none" aria-hidden="true">
          <circle cx="260" cy="260" r="200" stroke="#FF6A1A" stroke-width="1.5" />
          <circle cx="260" cy="260" r="140" stroke="#FF6A1A" stroke-width="1.5" />
          <line x1="0" y1="260" x2="520" y2="260" stroke="#FF6A1A" stroke-width="1.5" />
        </svg>

        <div class="brand-row">
          <ng-container *ngTemplateOutlet="mark" />
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Backoffice</div>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="message">
          <div class="kicker">Painel interno · Operação</div>
          <h2>A quadra inteira,<br />numa tela só.</h2>
          <p>Arenas, torneios, atletas e financeiro — tudo que roda no NexaGO, gerenciado daqui.</p>
        </div>

        <div class="foot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Acesso restrito à equipe NexaGO
        </div>
      </aside>

      <main class="stage">
        <div class="stage-glow"></div>
        <div class="card">
          <div class="compact-brand">
            <ng-container *ngTemplateOutlet="mark" />
            <div class="wordmark">
              <div class="name">nexa<span>GO</span></div>
              <div class="tag">Backoffice</div>
            </div>
          </div>
          <ng-content />
        </div>
      </main>
    </div>

    <ng-template #mark>
      <div class="mark" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M5 4 L5 20 M19 4 L19 20 M5 4 L19 20" stroke="#0A0A0A" stroke-width="3.4" stroke-linecap="square" stroke-linejoin="miter" />
        </svg>
        <div class="shine"></div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }

    .shell {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(420px, 560px) 1fr;
      background: var(--nx-bg);
    }

    .brand {
      position: relative;
      overflow: hidden;
      background: #050505;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 56px 64px;
    }

    .glow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(90% 70% at 0% 100%, rgba(255, 106, 26, 0.2) 0%, transparent 60%),
        radial-gradient(60% 40% at 100% 0%, rgba(255, 106, 26, 0.06) 0%, transparent 60%);
    }

    .court {
      position: absolute;
      right: -80px;
      bottom: -80px;
      opacity: 0.1;
    }

    .brand-row,
    .compact-brand {
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
    }

    .mark {
      width: 44px;
      height: 44px;
      border-radius: 11px;
      background: var(--nx-orange-500);
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(255, 106, 26, 0.3), 0 12px 32px rgba(255, 106, 26, 0.22);
      flex: none;
    }

    .mark .shine {
      position: absolute;
      inset: 0;
      background: linear-gradient(140deg, rgba(255, 255, 255, 0.3) 0%, transparent 40%);
      pointer-events: none;
    }

    .wordmark {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .wordmark .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .wordmark .name span {
      color: var(--nx-orange-500);
    }

    .wordmark .tag {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .spacer {
      flex: 1;
    }

    .message {
      position: relative;
      max-width: 440px;
    }

    .message .kicker {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      margin-bottom: 16px;
    }

    .message h2 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: clamp(32px, 3.2vw, 44px);
      line-height: 1.04;
      letter-spacing: -0.03em;
      color: var(--nx-text);
      margin: 0;
    }

    .message p {
      font-size: 15px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      margin: 16px 0 0;
      max-width: 380px;
    }

    .foot {
      position: relative;
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .stage {
      position: relative;
      display: grid;
      place-items: center;
      padding: 48px 24px;
    }

    .stage-glow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(50% 30% at 50% 0%, rgba(255, 106, 26, 0.06) 0%, transparent 60%);
    }

    .card {
      width: min(400px, 100%);
      position: relative;
    }

    .compact-brand {
      display: none;
      justify-content: center;
      margin-bottom: 40px;
    }

    @media (max-width: 980px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .brand {
        display: none;
      }

      .compact-brand {
        display: flex;
      }
    }
  `,
  imports: [NgTemplateOutlet],
})
export class AuthShellComponent {}
