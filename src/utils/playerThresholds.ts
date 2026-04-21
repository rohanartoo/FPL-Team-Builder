export interface PositionThresholds {
  valueTop10: Record<number, number>;
  valueTop30: Record<number, number>;
  formTop20: Record<number, number>;
  transferTop15: number;
}

export function computePositionThresholds(processedPlayers: any[]): PositionThresholds {
  const valueTop10: Record<number, number> = {};
  const valueTop30: Record<number, number> = {};
  const formTop20: Record<number, number> = {};

  [1, 2, 3, 4].forEach(pos => {
    const posPlayers = processedPlayers.filter(p => p.element_type === pos);
    const valueScores = posPlayers.map(p => p.valueScore).sort((a: number, b: number) => b - a);
    valueTop10[pos] = valueScores[Math.floor(valueScores.length * 0.10)] ?? 0;
    valueTop30[pos] = valueScores[Math.floor(valueScores.length * 0.30)] ?? 0;
    const formScores = posPlayers.map(p => p.fplForm).sort((a: number, b: number) => b - a);
    formTop20[pos] = formScores[Math.floor(formScores.length * 0.20)] ?? 0;
  });

  const transfers = processedPlayers.map(p => p.transfers_in_event ?? 0).sort((a: number, b: number) => b - a);
  const transferTop15 = transfers[Math.floor(transfers.length * 0.15)] ?? 0;

  return { valueTop10, valueTop30, formTop20, transferTop15 };
}
