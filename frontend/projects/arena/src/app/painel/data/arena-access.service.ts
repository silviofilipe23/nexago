import { Injectable, computed, inject } from '@angular/core';
import { ArenaContextService } from './arena-context.service';
import { arenaRoleCanRead, arenaRoleCanWrite, type ArenaArea } from './arena-roles.model';

/** Fonte única do que a UI pode mostrar. NÃO é a autoridade: quem autoriza de
 *  fato é `firestore.rules`. Aqui só evitamos oferecer o que seria negado. */
@Injectable({ providedIn: 'root' })
export class ArenaAccessService {
  private readonly context = inject(ArenaContextService);

  readonly ready = computed(() => !this.context.loading());
  readonly isOwner = computed(() => this.context.isOwner());
  readonly role = computed(() => this.context.staffRole());

  canRead(area: ArenaArea): boolean {
    if (this.isOwner()) return true;
    const role = this.role();
    return role != null && arenaRoleCanRead(role, area);
  }

  canWrite(area: ArenaArea): boolean {
    if (this.isOwner()) return true;
    const role = this.role();
    return role != null && arenaRoleCanWrite(role, area);
  }
}
