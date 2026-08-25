import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { organizerFirestore } from '../data/firestore';
import { watchNotifications } from '../data/notifications-repository';

/** Quantas notificações não lidas o organizador tem — o número que acende o ponto do sino.
 *
 *  Mora num serviço de raiz, e não dentro do `og-bell`, porque o sino vive no cabeçalho de
 *  página: o router destrói e recria esse cabeçalho a cada navegação, e com o `onSnapshot`
 *  dentro do componente a escuta seria refeita em toda troca de tela (leitura a mais e o
 *  ponto piscando do zero). Aqui ela é aberta uma vez por sessão e sobrevive às rotas. */
@Injectable({ providedIn: 'root' })
export class UnreadNotificationsService {
  private readonly auth = inject(AuthService);

  readonly count = signal(0);

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user) {
        this.count.set(0);
        return;
      }
      const stop = watchNotifications(
        organizerFirestore(),
        user.uid,
        (items) => this.count.set(items.filter((n) => n.unread).length),
        () => this.count.set(0),
      );
      onCleanup(() => stop());
    });
  }
}
