import type { LiveScoringContext } from '@nexago/live-scoring';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';

/** Contexto do portal do organizador pra mesa ao vivo compartilhada (`@nexago/live-scoring`) —
 *  o mesário faz as mesmas escritas pelo portal do atleta com o contexto de lá. */
export function organizerLiveScoringContext(): LiveScoringContext {
  return { db: organizerFirestore(), projectId: environment.firebase.projectId ?? '' };
}
