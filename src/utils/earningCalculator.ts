export function calcMilestoneEarningPaise(
  totalViews: number,
  lastMilestone: number,
  viewsPerReward: number,
  rewardAmountPaise: number,
): number {
  const currentMilestone = Math.floor(totalViews / viewsPerReward);
  const milestonesEarned = currentMilestone - lastMilestone;
  if (milestonesEarned <= 0) return 0;
  return milestonesEarned * rewardAmountPaise;
}