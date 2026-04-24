import { useState, useMemo, useCallback } from "react";
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
  ReferenceArea,
  Label,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from "recharts";
import { POSITION_MAP } from "../../types";

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
  teamFull: string;
  pos: number;
  price: number;
  valueScore: number;
  reliability: number;
  archetype: string;
  base_pp90: number;
  ownership: string;
  pp90_fdr2: number | null;
  pp90_fdr3: number | null;
  pp90_fdr4: number | null;
  pp90_fdr5: number | null;
}

interface VisualizationTabProps {
  vizData: VizPlayer[];
  onPlayerClick: (id: number) => void;
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

  const { medianPrice, medianValue, xDefault, yDefault } = useMemo(() => {
    const prices = filteredData.map(p => p.price);
    const values = filteredData.map(p => p.valueScore);
    const minPrice = Math.floor(Math.min(...prices, 4.0) * 2) / 2;
    const maxPrice = Math.ceil(Math.max(...prices, 14.0) * 2) / 2;
    const maxValue = Math.ceil(Math.max(...values, 1) * 10) / 10;
    return {
      medianPrice: parseFloat(median(prices).toFixed(1)),
      medianValue: parseFloat(median(values).toFixed(2)),
      xDefault: [minPrice, maxPrice] as [number, number],
      yDefault: [0, maxValue] as [number, number],
    };
  }, [filteredData]);

  // Zoom boundaries
  const [left, setLeft] = useState<number | 'auto'>('auto');
  const [right, setRight] = useState<number | 'auto'>('auto');
  const [top, setTop] = useState<number | 'auto'>('auto');
  const [bottom, setBottom] = useState<number | 'auto'>('auto');

  // State for manual domain overrides

  const handleZoomPreset = (quadrant: 'all' | 'sweet' | 'premium' | 'avoid' | 'overpriced') => {
    switch (quadrant) {
      case 'all':
        setLeft('auto');
        setRight('auto');
        setBottom('auto');
        setTop('auto');
        break;
      case 'sweet':
        setLeft(xDefault[0]);
        setRight(medianPrice);
        setBottom(medianValue);
        setTop(yDefault[1]);
        break;
      case 'premium':
        setLeft(medianPrice);
        setRight(xDefault[1]);
        setBottom(medianValue);
        setTop(yDefault[1]);
        break;
      case 'avoid':
        setLeft(xDefault[0]);
        setRight(medianPrice);
        setBottom(yDefault[0]);
        setTop(medianValue);
        break;
      case 'overpriced':
        setLeft(medianPrice);
        setRight(xDefault[1]);
        setBottom(yDefault[0]);
        setTop(medianValue);
        break;
    }
  };

  const isZoomed = left !== 'auto' || right !== 'auto' || bottom !== 'auto' || top !== 'auto';

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
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => handleZoomPreset('all')} className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest transition-colors ${!isZoomed ? 'bg-[#141414] text-[#E4E3E0]' : 'border border-[#141414] text-[#141414] hover:bg-[#141414]/10'}`}>ALL</button>
          <button onClick={() => handleZoomPreset('sweet')} className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest transition-colors ${left === xDefault[0] && bottom === medianValue ? 'bg-[#059669] text-white' : 'border border-[#059669] text-[#059669] hover:bg-[#059669]/10'}`}>SWEET SPOT</button>
          <button onClick={() => handleZoomPreset('premium')} className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest transition-colors ${left === medianPrice && bottom === medianValue ? 'bg-[#141414] text-[#E4E3E0]' : 'border border-[#141414] text-[#141414] hover:bg-[#141414]/10'}`}>PREMIUM</button>
          <button onClick={() => handleZoomPreset('avoid')} className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest transition-colors ${left === xDefault[0] && top === medianValue ? 'bg-[#6B7280] text-white' : 'border border-[#6B7280] text-[#6B7280] hover:bg-[#6B7280]/10'}`}>AVOID</button>
          <button onClick={() => handleZoomPreset('overpriced')} className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest transition-colors ${left === medianPrice && top === medianValue ? 'bg-[#E11D48] text-white' : 'border border-[#E11D48] text-[#E11D48] hover:bg-[#E11D48]/10'}`}>OVERPRICED</button>
        </div>
      </div>
      
      {isZoomed && (
        <div className="mb-4 flex flex-wrap gap-4 items-center bg-[#141414]/5 p-3 text-[10px] uppercase font-mono tracking-widest">
          <div className="font-bold opacity-60">Manual Zoom Controls</div>
          <div className="flex items-center gap-2">
            <span>Price:</span>
            <input type="number" step="0.5" className="w-16 px-1 py-0.5 border border-[#141414]/20 bg-transparent text-center" 
                   value={left === 'auto' ? xDefault[0] : left} onChange={(e) => setLeft(Number(e.target.value) || 'auto')} />
            <span>—</span>
            <input type="number" step="0.5" className="w-16 px-1 py-0.5 border border-[#141414]/20 bg-transparent text-center" 
                   value={right === 'auto' ? xDefault[1] : right} onChange={(e) => setRight(Number(e.target.value) || 'auto')} />
          </div>
          <div className="flex items-center gap-2">
            <span>Value:</span>
            <input type="number" step="1" className="w-16 px-1 py-0.5 border border-[#141414]/20 bg-transparent text-center" 
                   value={bottom === 'auto' ? yDefault[0] : bottom} onChange={(e) => setBottom(Number(e.target.value) || 'auto')} />
            <span>—</span>
            <input type="number" step="1" className="w-16 px-1 py-0.5 border border-[#141414]/20 bg-transparent text-center" 
                   value={top === 'auto' ? yDefault[1] : top} onChange={(e) => setTop(Number(e.target.value) || 'auto')} />
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-3 items-center">
        {[1, 2, 3, 4].map(pos => (
          <div key={pos} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POSITION_COLORS[pos] }} />
            {POSITION_MAP[pos]}
          </div>
        ))}
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

      <div className="h-[360px] md:h-[500px] w-full relative group">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 20, right: 40, bottom: 40, left: 20 }}
          >
            <XAxis
              type="number" dataKey="price" name="Price"
              domain={[left === 'auto' ? xDefault[0] : left, right === 'auto' ? xDefault[1] : right]}
              tickFormatter={v => `£${v.toFixed(1)}`}
              stroke="#141414" fontSize={10} fontFamily="JetBrains Mono" tickCount={8}
              allowDataOverflow
            >
              <Label value="PRICE (£)" offset={-20} position="insideBottom"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.8, fontWeight: 'bold' }} />
            </XAxis>
            <YAxis
              type="number" dataKey="valueScore" name="Value Score"
              domain={[bottom === 'auto' ? yDefault[0] : bottom, top === 'auto' ? yDefault[1] : top]}
              stroke="#141414" fontSize={10} fontFamily="JetBrains Mono"
              allowDataOverflow
            >
              <Label value="VALUE SCORE" angle={-90} position="insideLeft"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.8, fontWeight: 'bold' }} />
            </YAxis>
            <ZAxis type="number" dataKey="reliability" range={[30, 300]} name="Reliability" />

            <ReferenceLine x={medianPrice} stroke="#141414" strokeDasharray="4 4" strokeOpacity={0.25} />
            <ReferenceLine y={medianValue} stroke="#141414" strokeDasharray="4 4" strokeOpacity={0.25} />

            <ReferenceLine x={left === 'auto' ? xDefault[0] : left} stroke="none">
              <Label value="SWEET SPOT ↗" position="insideTopRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#059669', opacity: 1, fontWeight: 'bold' }} />
            </ReferenceLine>
            <ReferenceLine x={medianPrice} stroke="none">
              <Label value="PREMIUM ↗" position="insideTopRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#141414', opacity: 0.7, fontWeight: 'bold' }} />
            </ReferenceLine>
            <ReferenceLine x={left === 'auto' ? xDefault[0] : left} stroke="none">
              <Label value="AVOID" position="insideBottomRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#141414', opacity: 0.6, fontWeight: 'bold' }} />
            </ReferenceLine>
            <ReferenceLine x={medianPrice} stroke="none">
              <Label value="OVERPRICED" position="insideBottomRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#E11D48', opacity: 1, fontWeight: 'bold' }} />
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
                      <div className="flex justify-between gap-6"><span className="opacity-50">xPP90</span><span>{d.base_pp90.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-6"><span className="opacity-50">Reliability</span><span>{(d.reliability * 100).toFixed(0)}%</span></div>
                      <div className="flex justify-between gap-6"><span className="opacity-50">Ownership</span><span>{d.ownership}%</span></div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-white/10 opacity-40 text-[9px]">Click to open in Compare</div>
                  </div>
                );
              }}
            />

            <Scatter name="Players" data={filteredData}
              onClick={(data: any) => data && data.payload && onPlayerClick(data.payload.id)} style={{ cursor: 'pointer' }}>
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

// ─── (Fixture Heatmap moved to src/components/shared/FixtureHeatmap.tsx) ───────

// ─── PP90 Breakdown ───────────────────────────────────────────────────────────

const BUCKET_COLORS = {
  easy:    "#10B981", // emerald
  neutral: "#94A3B8", // slate
  hard:    "#F97316", // orange
  vhard:   "#F43F5E", // rose
};

const ARCHETYPE_ORDER = ["Talisman", "Flat Track Bully", "Workhorse", "Rotation Risk", "Squad Player", "Not Enough Data"];

function PP90BreakdownView({ vizData }: { vizData: VizPlayer[] }) {
  const [positionFilter, setPositionFilter] = useState<number>(0);
  const [archetypeFilter, setArchetypeFilter] = useState<string>("all");
  const TOP_N = 60;

  const filtered = useMemo(() => {
    return vizData
      .filter(p => positionFilter === 0 || p.pos === positionFilter)
      .filter(p => archetypeFilter === "all" || p.archetype === archetypeFilter)
      .filter(p => p.base_pp90 > 0)
      // Require at least 3 FDR buckets with real data
      .filter(p => [p.pp90_fdr2, p.pp90_fdr3, p.pp90_fdr4, p.pp90_fdr5].filter(v => v !== null).length >= 3)
      .sort((a, b) => b.base_pp90 - a.base_pp90)
      .slice(0, TOP_N);
  }, [vizData, positionFilter, archetypeFilter]);

  const chartData = filtered.map(p => ({
    name: p.name,
    team: p.team,
    archetype: p.archetype,
    "Easy (FDR 2)":    p.pp90_fdr2 ?? 0,
    "Neutral (FDR 3)": p.pp90_fdr3 ?? 0,
    "Hard (FDR 4)":    p.pp90_fdr4 ?? 0,
    "Very Hard (FDR 5)": p.pp90_fdr5 ?? 0,
    hasEasy: p.pp90_fdr2 !== null,
    hasHard: p.pp90_fdr4 !== null || p.pp90_fdr5 !== null,
  }));

  const archetypesPresent = useMemo(() => {
    const set = new Set(vizData.filter(p => positionFilter === 0 || p.pos === positionFilter).map(p => p.archetype));
    return ARCHETYPE_ORDER.filter(a => set.has(a));
  }, [vizData, positionFilter]);

  return (
    <>
      <div className="mb-6">
        <h3 className="font-serif italic text-2xl mb-1">xPP90 by Fixture Difficulty</h3>
        <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest">
          Top {TOP_N} players by base xPP90 · Grouped bars show expected points per 90 in easy, neutral, hard fixtures
        </p>
        <p className="font-mono text-[10px] opacity-40 uppercase tracking-widest mt-0.5">
          Talisman = bars roughly equal · Flat Track Bully = tall green, short orange
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { id: 0, label: 'All Positions' },
          { id: 1, label: 'GK' },
          { id: 2, label: 'DEF' },
          { id: 3, label: 'MID' },
          { id: 4, label: 'FWD' },
        ].map(pos => (
          <button key={pos.id} onClick={() => setPositionFilter(pos.id)}
            className={`px-4 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
              ${positionFilter === pos.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}>
            {pos.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setArchetypeFilter("all")}
          className={`px-4 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
            ${archetypeFilter === "all" ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}>
          All Archetypes
        </button>
        {archetypesPresent.map(a => (
          <button key={a} onClick={() => setArchetypeFilter(a)}
            className={`px-4 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
              ${archetypeFilter === a ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}>
            {a}
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 font-mono text-[11px] opacity-40 uppercase tracking-widest">
          No players with performance data for this filter
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ width: Math.max(800, chartData.length * 64), height: 520 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, bottom: 100, left: 20 }}
              barCategoryGap="20%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#14141420" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#141414"
                fontSize={9}
                fontFamily="JetBrains Mono"
                angle={-45}
                textAnchor="end"
                interval={0}
                tick={{ fill: '#141414', opacity: 0.6 }}
              />
              <YAxis
                stroke="#141414"
                fontSize={10}
                fontFamily="JetBrains Mono"
                tickFormatter={v => v.toFixed(1)}
              >
                <Label value="xPP90" angle={-90} position="insideLeft"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.4 }} />
              </YAxis>
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = chartData.find(p => p.name === label);
                  return (
                    <div className="bg-[#141414] text-[#E4E3E0] p-4 border border-white/20 font-mono text-[10px] min-w-[180px]">
                      <div className="font-bold text-sm mb-1 border-b border-white/20 pb-1.5">
                        {label} <span className="opacity-50 font-normal">({d?.team})</span>
                      </div>
                      <div className="opacity-50 text-[9px] mb-2 uppercase tracking-widest">{d?.archetype}</div>
                      <div className="space-y-1">
                        {payload.map((entry: any) => (
                          <div key={entry.name} className="flex justify-between gap-6">
                            <span style={{ color: entry.fill }} className="opacity-80">{entry.name}</span>
                            <span>{entry.value > 0 ? entry.value.toFixed(2) : 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                      {(!d?.hasEasy || !d?.hasHard) && (
                        <div className="mt-2 pt-2 border-t border-white/10 text-[9px] opacity-40">
                          0.00 = insufficient data (&lt;180 mins in bucket)
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: 9, paddingTop: 16, opacity: 0.6 }}
                formatter={(value) => value.toUpperCase()}
              />
              <Bar dataKey="Easy (FDR 2)"      fill={BUCKET_COLORS.easy}    radius={[2, 2, 0, 0]} />
              <Bar dataKey="Neutral (FDR 3)"   fill={BUCKET_COLORS.neutral} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Hard (FDR 4)"      fill={BUCKET_COLORS.hard}    radius={[2, 2, 0, 0]} />
              <Bar dataKey="Very Hard (FDR 5)" fill={BUCKET_COLORS.vhard}   radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export const VisualizationTab = ({ vizData, onPlayerClick }: VisualizationTabProps) => {
  const [activeView, setActiveView] = useState<'quadrant' | 'pp90'>('quadrant');

  return (
    <div className="bg-white/5 border border-[#141414] p-4 md:p-8 min-h-[600px]">
      {/* View switcher */}
      <div className="flex flex-wrap gap-2 mb-8">
        {([
          { id: 'quadrant', label: 'Value Quadrant' },
          { id: 'pp90',     label: 'xPP90 Breakdown' },
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
      {activeView === 'pp90'     && <PP90BreakdownView vizData={vizData} />}
    </div>
  );
};
