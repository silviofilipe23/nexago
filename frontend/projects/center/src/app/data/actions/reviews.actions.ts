import { Injectable } from '@angular/core';
import type { ManagerReview, ManagerReviewsPage, ReplyResult } from '../../features/reviews/review-view';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

/**
 * Avaliações de aula do centro (owner/admin). As avaliações só a autora lê pelas rules; a gestão
 * lê pelas callables, que tiram o que identifica a aluna anônima (`class-review-manager.ts`).
 */
@Injectable({ providedIn: 'root' })
export class ReviewsActions extends CenterActionsBase {
  load(cursor: string | null = null): Promise<ManagerReviewsPage> {
    return callCenterFunction<ManagerReviewsPage>('getClassReviewsForManager', {
      kind: 'center',
      placeId: this.centerId(),
      cursor,
    });
  }

  reply(review: ManagerReview, reply: string, resolve: boolean): Promise<ReplyResult> {
    return callCenterFunction<ReplyResult>('replyClassReviewTicket', { reviewId: review.id, reply, resolve });
  }
}
