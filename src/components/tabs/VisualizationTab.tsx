import { useState, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Label,
} from "recharts";
import { Fixture, Team, POSITION_MAP } from "../../types";
import { getNextFixtures, calculateAvgDifficulty } from "../../utils/fixtures";
import { getFDRColor } from "../../utils/player";

const POSITION_COLORS: Record<number, string> = {
  1: "#EAB308",
  2: "#3B82F6",
  3: "#10B981",
  4: "#F43F5E",
};

const ARCHETYPE_COLOURS: Record<string, string> = {
  "Talisman":         "bg-violet-500/15 text-violet-700 border border-violet-500/30",
  "Flat Track Bully": "bg-amber-500/15 text-amber-700 border border-amber-500/30",
  "Workhorse":        "bg-sky-500/15 text-sky-700 border border-sky-500/30",
  "Rotation Risk":    "bg-orange-500/15 text-orange-700 border border-orange-500/30",
  "Squad Player":     "bg-[#141414]/5 text-[#141414]/50 border border-[#141414]/20",
  "Not Enough Data":  "bg-[#141414]/5 text-[#141414]/30 border border-[#141414]/10",
};

export interface VizPlayer {
  id: number;
  name: string;
  team: string;
  pos: number;
  price: number;
  valueScore: number;
  reliability: number;
  archetype: string;
  base_pp90: number;
  ownership: string;
}

interface VisualizationTabProps {
  vizData: VizPlayer[];
  onPlayerClick: (id: number) => void;
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
}

const median = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ─── Value Quadrant ────────────────────────────────────────────────────────────

function ValueQuadrantView({ vizData, onPlayerClick }: { vizData: VizPlayer[]; onPlayerClick: (id: number) => void }) {
  const [positionFilter, setPositionFilter] = useState<number>(0);

  const filteredData = positionFilter === 0 ? vizData : vizData.filter(p => p.pos === positionFilter);

  const { medianPrice, medianValue, xDomain, yDomain } = useMemo(() => {
    const prices = filteredData.map(p => p.price);
    const values = filteredData.map(p => p.valueScore);
    const minPrice = Math.floor(Math.min(...prices, 4.0) * 2) / 2;
    const maxPrice = Math.ceil(Math.max(...prices, 14.0) * 2) / 2;
    const maxValue = Math.ceil(Math.max(...values, 1) * 10) / 10;
    return {
      medianPrice: parseFloat(median(prices).toFixed(1)),
      medianValue: parseFloat(median(values).toFixed(2)),
      xDomain: [minPrice, maxPrice] as [number, number],
      yDomain: [0, maxValue] as [number, number],
    };
  }, [filteredData]);

  return (
    <>
      <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h3 className="font-serif italic text-2xl mb-1">Value Quadrant</h3>
          <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest">
            Price vs. Value Score — Sweet Spot = cheap, high-value players
          </p>
          <p className="font-mono text-[10px] opacity-40 uppercase tracking-widest mt-0.5">
            Bubble size = reliability · Click a player to open in Compare
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map(pos => (
            <div key={pos} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POSITION_COLORS[pos] }} />
              {POSITION_MAP[pos]}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { id: 0, label: 'All Players' },
          { id: 1, label: 'Goalkeepers' },
          { id: 2, label: 'Defenders' },
          { id: 3, label: 'Midfielders' },
          { id: 4, label: 'Forwards' },
        ].map(pos => (
          <button
            key={pos.id}
            onClick={() => setPositionFilter(pos.id)}
            className={`px-5 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
              ${positionFilter === pos.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
          >
            {pos.label}
          </button>
        ))}
      </div>

      <div className="h-[500px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 40, bottom: 40, left: 20 }}>
            <XAxis
              type="number" dataKey="price" name="Price"
              domain={xDomain} tickFormatter={v => `£${v.toFixed(1)}`}
              stroke="#141414" fontSize={10} fontFamily="JetBrains Mono" tickCount={8}
            >
              <Label value="PRICE (£)" offset={-20} position="insideBottom"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.4 }} />
            </XAxis>
            <YAxis
              type="number" dataKey="valueScore" name="Value Score"
              domain={yDomain} stroke="#141414" fontSize={10} fontFamily="JetBrains Mono"
            >
              <Label value="VALUE SCORE" angle={-90} position="insideLeft"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.4 }} />
            </YAxis>
            <ZAxis type="number" dataKey="reliability" range={[30, 300]} name="Reliability" />

            <ReferenceLine x={medianPrice} stroke="#141414" strokeDasharray="4 4" strokeOpacity={0.25} />
            <ReferenceLine y={medianValue} stroke="#141414" strokeDasharray="4 4" strokeOpacity={0.25} />

            <ReferenceLine x={xDomain[0]} stroke="none">
              <Label value="SWEET SPOT ↗" position="insideTopRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#10B981', opacity: 0.5 }} />
            </ReferenceLine>
            <ReferenceLine x={medianPrice} stroke="none">
              <Label value="PREMIUM ↗" position="insideTopRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#141414', opacity: 0.3 }} />
            </ReferenceLine>
            <ReferenceLine x={xDomain[0]} stroke="none">
              <Label value="AVOID" position="insideBottomRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#141414', opacity: 0.25 }} />
            </ReferenceLine>
            <ReferenceLine x={medianPrice} stroke="none">
              <Label value="OVERPRICED" position="insideBottomRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#F43F5E', opacity: 0.4 }} />
            </ReferenceLine>

            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as VizPlayer;
                const archetypeClass = ARCHETYPE_COLOURS[d.archetype] ?? ARCHETYPE_COLOURS["Not Enough Data"];
                return (
                  <div className="bg-[#141414] text-[#E4E3E0] p-4 border border-white/20 font-mono text-[10px] min-w-[180px]">
                    <div className="font-bold text-sm mb-2 border-b border-white/20 pb-1.5">
                      {d.name} <span className="opacity-50 font-normal">({d.team})</span>
                    </div>
                    <div className={`inline-block px-2 py-0.5 text-[9px] uppercase tracking-widest rounded mb-2 ${archetypeClass}`}>
                      {d.archetype}
                    </div>
                    <div className="space-y-1 mt-1">
                      <div className="flex justify-between gap-6"><span className="opacity-50">Price</span><span>£{d.price.toFixed(1)}m</span></div>
                      <div className="flex justify-between gap-6"><span className="opacity-50">Value Score</span><span>{d.valueScore.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-6"><span className="opacity-50">PP90</span><span>{d.base_pp90.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-6"><span className="opacity-50">Reliability</span><span>{(d.reliability * 100).toFixed(0)}%</span></div>
                      <div className="flex justify-between gap-6"><span className="opacity-50">Ownership</span><span>{d.ownership}%</span></div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-white/10 opacity-40 text-[9px]">Click to open in Compare</div>
                  </div>
                );
              }}
            />

            <Scatter name="Players" data={filteredData}
              onClick={(data: VizPlayer) => onPlayerClick(data.id)} style={{ cursor: 'pointer' }}>
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={POSITION_COLORS[entry.pos]} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 font-mono text-[9px] opacity-30 uppercase tracking-widest text-center">
        Reference lines at median price (£{medianPrice.toFixed(1)}m) and median value score ({medianValue.toFixed(2)}) for selected group
      </div>
    </>
  );
}

// ─── Fixture Heatmap ───────────────────────────────────────────────────────────

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

function FixtureHeatmapView({ fixtures, teams, tfdrMap }: { fixtures: Fixture[]; teams: Team[]; tfdrMap: Record<number, any> }) {
  const GW_COUNT = 8;

  const teamRows = useMemo(() => {
    return teams
      .map(team => {
        const upcoming = getNextFixtures(team.id, fixtures, teams, tfdrMap, GW_COUNT);
        const avg5 = calculateAvgDifficulty(team.id, fixtures, teams, tfdrMap, 5);
        return { team, upcoming, avg5 };
      })
      .sort((a, b) => a.avg5 - b.avg5);
  }, [fixtures, teams, tfdrMap]);

  // Derive the actual GW numbers for column headers from the first non-blank team
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
            {teamRows.map(({ team, upcoming, avg5 }) => (
              <div key={team.id} className="grid gap-1 items-center" style={{ gridTemplateColumns: `120px repeat(${GW_COUNT}, 1fr)` }}>
                {/* Team name + avg badge */}
                <div className="flex items-center gap-2 pr-2">
                  <span className="font-mono text-[11px] truncate">{team.short_name}</span>
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${getFDRColor(avg5)}`}>
                    {avg5.toFixed(1)}
                  </span>
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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export const VisualizationTab = ({ vizData, onPlayerClick, fixtures, teams, tfdrMap }: VisualizationTabProps) => {
  const [activeView, setActiveView] = useState<'quadrant' | 'heatmap'>('quadrant');

  return (
    <div className="bg-white/5 border border-[#141414] p-8 min-h-[600px]">
      {/* View switcher */}
      <div className="flex gap-2 mb-8">
        {([
          { id: 'quadrant', label: 'Value Quadrant' },
          { id: 'heatmap',  label: 'Fixture Heatmap' },
        ] as const).map(v => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            className={`px-4 py-2 border font-mono text-[10px] uppercase tracking-widest transition-all
              ${activeView === v.id ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {activeView === 'quadrant' && <ValueQuadrantView vizData={vizData} onPlayerClick={onPlayerClick} />}
      {activeView === 'heatmap'  && <FixtureHeatmapView fixtures={fixtures} teams={teams} tfdrMap={tfdrMap} />}
    </div>
  );
};
