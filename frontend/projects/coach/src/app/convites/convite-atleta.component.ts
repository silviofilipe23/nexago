import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

type InviteState = 'loading' | 'ready' | 'not-found' | 'not-mine' | 'not-pending' | 'responded';

interface InviteView {
  coachName: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Tela de resposta ao convite de treinador — qualquer usuário nexaGO autenticado
 *  chega aqui (via notificação push ou link), independente de papel. */
@Component({
  selector: 'co-convite-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        @switch (state()) {
          @case ('loading') {
            <p class="muted">Carregando convite…</p>
          }
          @case ('not-found') {
            <p class="muted">Convite não encontrado.</p>
          }
          @case ('not-mine') {
            <p class="muted">
              Este convite não é para a conta com que você está logado ({{ auth.user()?.email }}).
            </p>
          }
          @case ('not-pending') {
            <p class="muted">Este convite já foi respondido ou expirou.</p>
          }
          @case ('responded') {
            <p class="muted">{{ responseMessage() }}</p>
          }
          @case ('ready') {
            <h1>Convite de treinador</h1>
            <p class="body-text"><strong>{{ invite()?.coachName }}</strong> quer te adicionar à equipe dele no NexaGO.</p>
            @if (error(); as err) {
              <div class="co-alert" role="alert">{{ err }}</div>
            }
            <div class="actions">
              <button type="button" class="co-btn-primary" [disabled]="responding()" (click)="accept()">Aceitar</button>
              <button type="button" class="co-ghost-btn" [disabled]="responding()" (click)="decline()">Recusar</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--nx-bg);
      padding: 24px;
    }
    .card {
      width: min(420px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 28px;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    h1 {
      font-family: var(--nx-font-display);
      font-size: 20px;
      margin: 0 0 12px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.5;
    }
    .muted {
      color: var(--nx-text-mute);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .actions .co-btn-primary {
      width: auto;
      flex: 1;
      height: 44px;
    }
  `,
})
export class ConviteAtletaComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly firestore = createFirestore();

  protected readonly state = signal<InviteState>('loading');
  protected readonly invite = signal<InviteView | null>(null);
  protected readonly responding = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly responseMessage = signal('');

  private inviteId = '';

  async ngOnInit(): Promise<void> {
    this.inviteId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.inviteId) {
      this.state.set('not-found');
      return;
    }

    try {
      const snap = await getDoc(doc(this.firestore, 'coachAthleteInvites', this.inviteId));
      if (!snap.exists()) {
        this.state.set('not-found');
        return;
      }

      const data = snap.data();
      const myUid = this.auth.user()?.uid;
      if (data['athleteUid'] !== myUid) {
        this.state.set('not-mine');
        return;
      }
      if (data['status'] !== 'pending') {
        this.state.set('not-pending');
        return;
      }

      this.invite.set({ coachName: (data['coachName'] as string | undefined) ?? 'Treinador' });
      this.state.set('ready');
    } catch {
      // Firestore rules negam a leitura para um usuário autenticado sem relação com o convite
      // (nem treinador, nem atleta convidado) — trata como "não encontrado" para não vazar detalhes.
      this.state.set('not-found');
    }
  }

  protected async accept(): Promise<void> {
    this.error.set(null);
    this.responding.set(true);
    try {
      const fn = httpsCallable(getFunctions(getApps()[0]!), 'acceptCoachAthleteInvite');
      await fn({ inviteId: this.inviteId });
      this.responseMessage.set('Convite aceito! Você agora faz parte da equipe.');
      this.state.set('responded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      this.responding.set(false);
    }
  }

  protected async decline(): Promise<void> {
    this.error.set(null);
    this.responding.set(true);
    try {
      const fn = httpsCallable(getFunctions(getApps()[0]!), 'cancelCoachAthleteInvite');
      await fn({ inviteId: this.inviteId, asDecline: true });
      this.responseMessage.set('Convite recusado.');
      this.state.set('responded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível recusar o convite.');
    } finally {
      this.responding.set(false);
    }
  }
}
