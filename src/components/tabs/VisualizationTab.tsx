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
}

const median = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const VisualizationTab = ({ vizData, onPlayerClick }: VisualizationTabProps) => {
  const [positionFilter, setPositionFilter] = useState<number>(0);

  const filteredData = positionFilter === 0
    ? vizData
    : vizData.filter(p => p.pos === positionFilter);

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
    <div className="bg-white/5 border border-[#141414] p-8 min-h-[600px]">
      {/* Header */}
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

      {/* Position filter */}
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

      {/* Chart */}
      <div className="h-[500px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 40, bottom: 40, left: 20 }}>
            <XAxis
              type="number"
              dataKey="price"
              name="Price"
              domain={xDomain}
              tickFormatter={v => `£${v.toFixed(1)}`}
              stroke="#141414"
              fontSize={10}
              fontFamily="JetBrains Mono"
              tickCount={8}
            >
              <Label
                value="PRICE (£)"
                offset={-20}
                position="insideBottom"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.4 }}
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="valueScore"
              name="Value Score"
              domain={yDomain}
              stroke="#141414"
              fontSize={10}
              fontFamily="JetBrains Mono"
            >
              <Label
                value="VALUE SCORE"
                angle={-90}
                position="insideLeft"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.4 }}
              />
            </YAxis>
            <ZAxis type="number" dataKey="reliability" range={[30, 300]} name="Reliability" />

            {/* Quadrant reference lines */}
            <ReferenceLine
              x={medianPrice}
              stroke="#141414"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />
            <ReferenceLine
              y={medianValue}
              stroke="#141414"
              strokeDasharray="4 4"
              strokeOpacity={0.25}
            />

            {/* Quadrant labels */}
            <ReferenceLine x={xDomain[0]} stroke="none">
              <Label
                value="SWEET SPOT ↗"
                position="insideTopRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#10B981', opacity: 0.5 }}
              />
            </ReferenceLine>
            <ReferenceLine x={medianPrice} stroke="none">
              <Label
                value="PREMIUM ↗"
                position="insideTopRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#141414', opacity: 0.3 }}
              />
            </ReferenceLine>
            <ReferenceLine x={xDomain[0]} stroke="none">
              <Label
                value="AVOID"
                position="insideBottomRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#141414', opacity: 0.25 }}
              />
            </ReferenceLine>
            <ReferenceLine x={medianPrice} stroke="none">
              <Label
                value="OVERPRICED"
                position="insideBottomRight"
                style={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#F43F5E', opacity: 0.4 }}
              />
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
                      <div className="flex justify-between gap-6">
                        <span className="opacity-50">Price</span>
                        <span>£{d.price.toFixed(1)}m</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="opacity-50">Value Score</span>
                        <span>{d.valueScore.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="opacity-50">PP90</span>
                        <span>{d.base_pp90.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="opacity-50">Reliability</span>
                        <span>{(d.reliability * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="opacity-50">Ownership</span>
                        <span>{d.ownership}%</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-white/10 opacity-40 text-[9px]">
                      Click to open in Compare
                    </div>
                  </div>
                );
              }}
            />

            <Scatter
              name="Players"
              data={filteredData}
              onClick={(data: VizPlayer) => onPlayerClick(data.id)}
              style={{ cursor: 'pointer' }}
            >
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={POSITION_COLORS[entry.pos]} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Median callout */}
      <div className="mt-4 font-mono text-[9px] opacity-30 uppercase tracking-widest text-center">
        Reference lines at median price (£{medianPrice.toFixed(1)}m) and median value score ({medianValue.toFixed(2)}) for selected group
      </div>
    </div>
  );
};
