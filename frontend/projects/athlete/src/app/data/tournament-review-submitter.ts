import { Injectable } from '@angular/core';
import { athleteFunctions } from './functions';
import { submitTournamentReview, type SubmitTournamentReviewInput } from './tournament-reviews-repository';

/** Camada injetável sobre a callable — os specs do diálogo trocam por um spy, como em
 *  `shared/partner-invite/partner-invite-responder.ts`. */
@Injectable({ providedIn: 'root' })
export class TournamentReviewSubmitter {
  submit(input: SubmitTournamentReviewInput): Promise<{ created: boolean }> {
    return submitTournamentReview(athleteFunctions(), input);
  }
}
