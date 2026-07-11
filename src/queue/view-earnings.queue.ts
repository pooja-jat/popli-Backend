export const VIEW_EARNINGS_QUEUE = 'view-earnings';

export interface ViewEarningsJobData {
  validViewId: string;
  reelId: string;
  creatorId: string;
  watchDuration: number;
}