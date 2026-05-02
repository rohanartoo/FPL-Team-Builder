import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Label,
} from "recharts";

interface FormTrajectoryChartProps {
  playerA: any;
  playerB: any;
  playerSummaries: Record<number, any>;
}

export const FormTrajectoryChart = ({
  playerA,
  playerB,
  playerSummaries,
}: FormTrajectoryChartProps) => {
  const histA = playerSummaries[playerA.id]?.history ?? [];
  const histB = playerSummaries[playerB.id]?.history ?? [];
  const gwsA = histA.slice(-10).map((h: any) => ({ gw: h.round, [playerA.web_name]: h.total_points }));
  const gwsB = histB.slice(-10).map((h: any) => ({ gw: h.round, [playerB.web_name]: h.total_points }));
  const gwSet = new Set<number>([...gwsA.map(r => r.gw), ...gwsB.map(r => r.gw)]);
  const chartData = Array.from(gwSet).sort((a, b) => a - b).map(gw => ({
    gw,
    [playerA.web_name]: gwsA.find(r => r.gw === gw)?.[playerA.web_name] ?? null,
    [playerB.web_name]: gwsB.find(r => r.gw === gw)?.[playerB.web_name] ?? null,
  }));

  if (chartData.length < 3) return null;

  return (
    <div className="px-2 pt-4 pb-6">
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141415" />
            <XAxis dataKey="gw" stroke="#141414" fontSize={9} fontFamily="JetBrains Mono" tickFormatter={v => `GW${v}`} />
            <YAxis stroke="#141414" fontSize={9} fontFamily="JetBrains Mono" allowDecimals={false} domain={[0, 'auto']}>
              <Label value="PTS" angle={-90} position="insideLeft" style={{ fontFamily: 'JetBrains Mono', fontSize: 9, opacity: 0.35 }} />
            </YAxis>
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-[#141414] text-[#E4E3E0] px-3 py-2 font-mono text-[10px]">
                    <div className="opacity-50 mb-1">GW{label}</div>
                    {payload.map((e: any) => e.value !== null && (
                      <div key={e.name} className="flex justify-between gap-4">
                        <span style={{ color: e.color }}>{e.name}</span>
                        <span className="font-bold">{e.value} pts</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey={playerA.web_name} stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: '#6366F1', strokeWidth: 0 }} connectNulls={false} />
            <Line type="monotone" dataKey={playerB.web_name} stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#6366F1]" /><span className="font-mono text-[9px] opacity-60">{playerA.web_name}</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#10B981]" /><span className="font-mono text-[9px] opacity-60">{playerB.web_name}</span></div>
      </div>
    </div>
  );
};
