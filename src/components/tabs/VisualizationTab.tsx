import { useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Label
} from "recharts";
import { POSITION_MAP } from "../../types";

const CHART_COLORS: Record<number, string> = {
  1: "#EAB308", // Yellow
  2: "#3B82F6", // Blue
  3: "#10B981", // Emerald
  4: "#F43F5E", // Rose
};

interface VisualizationTabProps {
  vizData: any[];
}

export const VisualizationTab = ({ vizData }: VisualizationTabProps) => {
  const [positionFilter, setPositionFilter] = useState<number>(0);

  const filteredData = positionFilter === 0 ? vizData : vizData.filter(p => p.pos === positionFilter);

  return (
    <div className="bg-white/5 border border-[#141414] p-8 min-h-[600px]">
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { id: 0, label: 'ALL PLAYERS' },
          { id: 1, label: 'GOALKEEPERS' },
          { id: 2, label: 'DEFENDERS' },
          { id: 3, label: 'MIDFIELDERS' },
          { id: 4, label: 'FORWARDS' }
        ].map(pos => (
          <button
            key={pos.id}
            onClick={() => setPositionFilter(pos.id)}
            className={`px-6 py-3 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
              ${positionFilter === pos.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
          >
            {pos.label}
          </button>
        ))}
      </div>
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="font-serif italic text-2xl mb-2">Form vs. Fixture Ease</h3>
          <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest">
            Top left quadrant = High Form + Easy Fixtures (Transfer Targets)
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4].map(pos => (
            <div key={pos} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[pos] }} />
              {POSITION_MAP[pos]}
            </div>
          ))}
        </div>
      </div>

      <div className="h-[500px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <XAxis
              type="number"
              dataKey="ease"
              name="Fixture Ease"
              domain={[1, 6]}
              stroke="#141414"
              fontSize={10}
              fontFamily="JetBrains Mono"
            >
              <Label value="AVG FIXTURE DIFFICULTY (1.5 = EASIEST, 5.5 = HARDEST)" offset={-10} position="insideBottom" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.5 }} />
            </XAxis>
            <YAxis
              type="number"
              dataKey="form"
              name="Form (L5)"
              domain={[0, 'auto']}
              stroke="#141414"
              fontSize={10}
              fontFamily="JetBrains Mono"
            >
              <Label value="FORM (AVG PTS L5)" angle={-90} position="insideLeft" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.5 }} />
            </YAxis>
            <ZAxis type="number" dataKey="points" range={[50, 400]} name="Total Points" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[#141414] text-[#E4E3E0] p-4 border border-white/20 font-mono text-[10px]">
                      <div className="font-bold text-sm mb-2 border-b border-white/20 pb-1">{data.name} ({data.team})</div>
                      <div>FORM: {data.form}</div>
                      <div>EASE: {data.ease}</div>
                      <div>TOTAL PTS: {data.points}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter name="Players" data={filteredData}>
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[entry.pos]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
