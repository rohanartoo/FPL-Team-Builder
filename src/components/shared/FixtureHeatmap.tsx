import { useMemo } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Fixture, Team } from "../../types";
import { getNextFixtures, calculateAvgDifficulty } from "../../utils/fixtures";
import { getFDRColor } from "../../utils/player";

const FDR_CELL_COLORS: Record<number, string> = {
  2: "bg-emerald-500 text-white",
  3: "bg-emerald-200 text-emerald-900",
  4: "bg-[#f0f0e8] text-[#141414]/60",
  5: "bg-rose-300 text-rose-900",
  6: "bg-rose-600 text-white",
};

function fdrCellClass(difficulty: number): string {
  const rounded = Math.round(Math.max(2, Math.min(5.5, difficulty)));
  if (rounded <= 2) return FDR_CELL_COLORS[2];
  if (rounded === 3) return FDR_CELL_COLORS[3];
  if (rounded === 4) return FDR_CELL_COLORS[4];
  if (rounded === 5) return FDR_CELL_COLORS[5];
  return FDR_CELL_COLORS[6];
}

interface FixtureHeatmapProps {
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
  onTeamClick?: (teamId: number) => void;
}

export function FixtureHeatmap({ fixtures, teams, tfdrMap, onTeamClick }: FixtureHeatmapProps) {
  const GW_COUNT = 8;

  const teamRows = useMemo(() => {
    return teams
      .map(team => {
        const upcoming = getNextFixtures(team.id, fixtures, teams, tfdrMap, GW_COUNT);
        const avg5 = calculateAvgDifficulty(team.id, fixtures, teams, tfdrMap, 5);
        const avgFirst4 = calculateAvgDifficulty(team.id, fixtures, teams, tfdrMap, 4, 0);
        const avgLast4  = calculateAvgDifficulty(team.id, fixtures, teams, tfdrMap, 4, 4);
        // positive trend = first half harder than second half = run improves = Improving
        const trend = parseFloat((avgFirst4 - avgLast4).toFixed(2));
        return { team, upcoming, avg5, trend };
      })
      .sort((a, b) => a.avg5 - b.avg5);
  }, [fixtures, teams, tfdrMap]);

  // Derive actual GW numbers for column headers from the first non-blank team
  const gwHeaders = useMemo(() => {
    for (const row of teamRows) {
      const nonBlank = row.upcoming.filter(f => !f.isBlank);
      if (nonBlank.length > 0) {
        return row.upcoming.map(f => f.event);
      }
    }
    return Array.from({ length: GW_COUNT }, (_, i) => i + 1);
  }, [teamRows]);

  return (
    <>
      <div className="mb-6">
        <h3 className="font-serif italic text-2xl mb-1">Fixture Run Heatmap</h3>
        <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest">
          All 20 teams · Next {GW_COUNT} gameweeks · Sorted by easiest upcoming run · TFDR difficulty
        </p>
      </div>

      {/* Colour key */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Very Easy', cls: 'bg-emerald-500 text-white' },
          { label: 'Easy',      cls: 'bg-emerald-200 text-emerald-900' },
          { label: 'Neutral',   cls: 'bg-[#f0f0e8] text-[#141414]/60' },
          { label: 'Hard',      cls: 'bg-rose-300 text-rose-900' },
          { label: 'Very Hard', cls: 'bg-rose-600 text-white' },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-sm text-[8px] flex items-center justify-center font-mono ${cls}`} />
            <span className="font-mono text-[10px] opacity-60 uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Column headers */}
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `120px repeat(${GW_COUNT}, 1fr)` }}>
            <div className="font-mono text-[9px] uppercase tracking-widest opacity-40 flex items-end pb-1">Team</div>
            {gwHeaders.map((gw, i) => (
              <div key={i} className="font-mono text-[9px] uppercase tracking-widest opacity-40 text-center pb-1">
                GW{gw}
              </div>
            ))}
          </div>

          {/* Team rows */}
          <div className="space-y-1">
            {teamRows.map(({ team, upcoming, avg5, trend }) => (
              <div key={team.id} className="grid gap-1 items-center" style={{ gridTemplateColumns: `120px repeat(${GW_COUNT}, 1fr)` }}>
                {/* Team name + avg badge + trend */}
                <div
                  className={`flex flex-col gap-0.5 pr-2 ${onTeamClick ? 'cursor-pointer group/team' : ''}`}
                  onClick={() => onTeamClick?.(team.id)}
                  title={onTeamClick ? `View ${team.short_name} players` : undefined}
                >
                  <span className={`font-mono text-[11px] truncate ${onTeamClick ? 'group-hover/team:underline' : ''}`}>{team.short_name}</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${getFDRColor(avg5)}`}>
                      {avg5.toFixed(1)}
                    </span>
                    {trend > 0.15 ? (
                      <span className="flex items-center gap-0.5 text-emerald-600 font-mono text-[8px]">
                        <ArrowUpRight size={9} strokeWidth={2.5} />
                      </span>
                    ) : trend < -0.15 ? (
                      <span className="flex items-center gap-0.5 text-rose-500 font-mono text-[8px]">
                        <ArrowDownRight size={9} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Fixture cells */}
                {upcoming.map((fix, fi) => (
                  <div key={fi}>
                    {fix.isBlank ? (
                      <div className="h-10 flex items-center justify-center border border-[#141414]/10 font-mono text-[9px] opacity-20">
                        —
                      </div>
                    ) : (
                      <div className={`h-10 flex flex-col items-center justify-center rounded-sm font-mono text-[9px] leading-tight ${fdrCellClass(fix.difficulty)}`}>
                        <span className="font-bold text-[10px]">{fix.opponent}</span>
                        <span className="opacity-70 text-[8px]">{fix.isHome ? 'H' : 'A'}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
