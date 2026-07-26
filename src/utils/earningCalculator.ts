export function calcViewEarnings(views: number, ratePer1000: number): number {
  return (views / 1000) * ratePer1000;
}

export function calcSingleViewEarning(ratePer1000: number): number {
  return ratePer1000 / 1000;
}