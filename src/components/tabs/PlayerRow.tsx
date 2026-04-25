import React, { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ArrowDownRight, Loader2, Info, Zap, GitCompare } from "lucide-react";
import { Fixture, Team, PlayerSummary, POSITION_MAP } from "../../types";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";
import { getTeamName, getTeamShortName } from "../../utils/team";
import { getFDRColor } from "../../utils/player";
import { getNextFixtures } from "../../utils/fixtures";
import { PlayerFlags } from "../../utils/playerSignals";
import { LEAGUE_AVG_XGC90 } from "../../utils/constants";

const Sparkline = memo(({ history }: { history: any[] }) => {
  const pts = history.slice(-7).map((h: any) => h.total_points);
  if (pts.length < 3) return null;
  const W = 36, H = 16;
  const max = Math.max(...pts, 2);
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first3 = pts.slice(0, 3).reduce((s: number, v: number) => s + v, 0);
  const last3 = pts.slice(-3).reduce((s: number, v: number) => s + v, 0);
  const color = last3 > first3 * 1.1 ? '#10B981' : last3 < first3 * 0.9 ? '#F43F5E' : '#94A3B8';
  return (
    <svg width={W} height={H} className="shrink-0 opacity-70">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
});

interface PlayerRowProps {
  player: any;
  isExpanded: boolean;
  onToggle: () => void;
  playerSummaries: Record<number, PlayerSummary>;
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
  flags: PlayerFlags;
  onCompare?: (id: number) => void;
}

export const PlayerRow = memo(({
  player,
  isExpanded,
  onToggle,
  playerSummaries,
  fixtures,
  teams,
  tfdrMap,
  flags,
  onCompare,
}: PlayerRowProps) => {
  const upcoming = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5, 0, player.element_type);
  const { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk } = flags;

  const signalDots = [
    isFTBRun         && { color: 'bg-orange-500',  label: 'FTB Run — Flat Track Bully with easy fixtures ahead' },
    isFormRun        && { color: 'bg-emerald-500', label: 'Form Run — Top-20% form for position with easy fixtures ahead' },
    isHiddenGem      && { color: 'bg-violet-500',  label: `Hidden Gem — ${player.selected_by_percent}% owned, top-10% value score for position` },
    isPriceRise      && { color: 'bg-sky-500',     label: `Price Rise — ${(player.transfers_in_event ?? 0).toLocaleString()} transfers in this GW` },
    isBookingRisk    && { color: 'bg-red-500',     label: `Booking Risk — ${player.yellow_cards ?? 0} yellow${(player.yellow_cards ?? 0) !== 1 ? 's' : ''}${player.red_cards ? ` + ${player.red_cards} red` : ''} — suspension risk` },
    isDueAGoal       && { color: 'bg-yellow-500',  label: `Due a Goal — xG ${parseFloat(player.expected_goals ?? '0').toFixed(1)} but only ${player.goals_scored ?? 0} scored` },
    isRegressionRisk && { color: 'bg-fuchsia-500', label: `Regression Risk — ${player.goals_scored ?? 0} goals on ${parseFloat(player.expected_goals ?? '0').toFixed(1)} xG — pace unsustainable` },
  ].filter(Boolean) as { color: string; label: string }[];

  const isMidOrFwd = player.element_type === 3 || player.element_type === 4;
  const isGkOrDef = player.element_type === 1 || player.element_type === 2;
  const xG = parseFloat(player.expected_goals ?? '0');
  const xA = parseFloat(player.expected_assists ?? '0');
  const xGC90 = player.expected_goals_conceded_per_90 ?? 0;
  const goals = player.goals_scored ?? 0;
  const assists = player.assists ?? 0;

  return (
    <div className="group">
      <div
        onClick={onToggle}
        className={`grid grid-cols-[1fr_0.7fr_1.2fr] md:grid-cols-[2.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] p-4 items-center cursor-pointer transition-all text-center
          ${isExpanded ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/10'}`}
      >
        <div className="flex items-center gap-4 text-left">
          <div>
            <div className="font-bold text-lg tracking-tight leading-none mb-1 flex items-center">
              {player.web_name}
              <PlayerAvailabilityIcon player={player} />
            </div>
            <div className="font-mono text-[10px] uppercase opacity-60 tracking-wider">
              <span className="md:hidden">{getTeamShortName(teams, player.team)}</span>
              <span className="hidden md:inline">{getTeamName(teams, player.team)}</span>
              {' '}• £{(player.now_cost / 10).toFixed(1)}m
            </div>
            {signalDots.length > 0 && (
              <div className="flex gap-1.5 mt-1.5">
                {signalDots.map((dot, i) => (
                  <div key={i} className="relative group/dot shrink-0 cursor-default">
                    <div className={`w-3 h-3 rounded-full ${dot.color}`} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono whitespace-nowrap rounded opacity-0 group-hover/dot:opacity-100 transition-opacity duration-100 delay-75 z-50">
                      {dot.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {onCompare && (
            <button
              onClick={(e) => { e.stopPropagation(); onCompare(player.id); }}
              className="ml-auto shrink-0 p-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
              title="Compare player"
            >
              <GitCompare size={14} />
            </button>
          )}
        </div>

        <div className="hidden md:block font-mono text-xs uppercase tracking-widest opacity-70">
          {POSITION_MAP[player.element_type]}
        </div>

        <div className="hidden md:flex items-center justify-center gap-2">
          <span className="font-mono text-sm font-bold">{player.fplForm}</span>
          {player.fplForm > 5 ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : player.fplForm < 2 ? <ArrowDownRight className="w-4 h-4 text-rose-500" /> : null}
        </div>

        <div className="hidden md:flex items-center justify-center gap-2">
          <span className={`font-mono text-sm font-bold ${Math.round(player.fdr) <= 2 ? 'text-emerald-500' : Math.round(player.fdr) >= 4 ? 'text-rose-500' : ''}`}>
            {player.fdr}
          </span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="font-mono text-sm font-bold text-emerald-500">{player.valueScore}</span>
        </div>

        <div className="hidden md:block font-mono text-xs text-center opacity-80">
          £{(player.now_cost / 10).toFixed(1)}m
        </div>

        <div className="hidden md:flex items-center justify-center gap-2">
          <span className="font-mono text-sm font-bold text-amber-500">{player.valueEfficiency}</span>
        </div>

        <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.goals}</div>
        <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.assists}</div>
        <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.cleanSheets}</div>
        <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.bonus}</div>

        <div className="hidden md:flex flex-col items-center justify-center gap-0.5">
          <span className="font-mono text-sm font-bold text-blue-500">{player.perfProfile ? player.perfProfile.base_pp90 : '-'}</span>
          {playerSummaries[player.id]?.history && (
            <Sparkline history={playerSummaries[player.id].history} />
          )}
        </div>

        <div className="flex justify-center gap-1">
          {upcoming.map((f, i) => (
            <div
              key={i}
              className={`w-6 md:w-8 ${i >= 3 ? 'max-md:hidden' : ''} flex flex-col items-center justify-center font-mono border
                ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20 h-6 md:h-8' : getFDRColor(f.difficulty)}
                ${f.isDouble ? 'py-0.5 gap-px' : 'h-6 md:h-8'}`}
              title={f.isBlank ? `GW ${f.event}: BLANK` : f.opponents?.map(o => `${o.name} (${o.isHome ? 'H' : 'A'})`).join(' + ') ?? ''}
            >
              {f.isBlank ? (
                <span className="text-[9px] md:text-[10px]">{f.opponent.toLowerCase()}</span>
              ) : f.isDouble && f.opponents ? (
                f.opponents.map((o, oi) => (
                  <span key={oi} className={`text-[8px] md:text-[9px] leading-tight ${oi === 1 ? 'opacity-70' : ''}`}>
                    {o.isHome ? o.name.toUpperCase() : o.name.toLowerCase()}
                  </span>
                ))
              ) : (
                <span className="text-[9px] md:text-[10px]">
                  {f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-[#141414] text-[#E4E3E0] border-t border-[#E4E3E0]/10"
          >
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {player.news && player.status !== 'a' && (
                <div className={`md:col-span-3 -mx-4 md:-mx-8 -mt-4 md:-mt-8 mb-4 md:mb-0 p-4 flex items-start gap-3 border-b ${player.status === 's' || player.chance_of_playing_next_round === 0 || player.status === 'i' || player.status === 'u' ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
                  <div className="shrink-0 mt-0.5"><Info size={20} /></div>
                  <div>
                    <div className="font-bold text-sm mb-1 uppercase tracking-widest">Availability Report</div>
                    <div className="font-mono text-xs opacity-90">{player.news} {player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100 && `(${player.chance_of_playing_next_round}% chance of playing)`}</div>
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <h4 className="font-serif italic text-xl mb-6 border-b border-[#E4E3E0]/20 pb-2">Recent Performance</h4>
                {!playerSummaries[player.id] ? (
                  <div className="flex items-center gap-2 font-mono text-xs opacity-50">
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching match data...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {playerSummaries[player.id].history.slice(-5).reverse().map((h, i) => (
                      <div key={i} className="flex items-center justify-between font-mono text-xs border-b border-[#E4E3E0]/10 pb-2">
                        <div className="flex flex-col">
                          <span className="opacity-50 text-[10px]">{new Date(h.kickoff_time).toLocaleDateString()}</span>
                          <span>vs {getTeamShortName(teams, h.opponent_team)} ({h.was_home ? 'H' : 'A'})</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-center"><span className="opacity-50 text-[10px]">MINS</span><span>{h.minutes}</span></div>
                          <div className="flex flex-col items-center"><span className="opacity-50 text-[10px]">G/A</span><span>{h.goals_scored}/{h.assists}</span></div>
                          <div className="flex flex-col items-center"><span className="opacity-50 text-[10px]">CS/B</span><span>{h.clean_sheets}/{h.bonus}</span></div>
                          <div className="flex flex-col items-end"><span className="opacity-50 text-[10px]">PTS</span><span className="text-lg font-bold text-emerald-400">{h.total_points}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-serif italic text-xl mb-6 border-b border-[#E4E3E0]/20 pb-2">L5 Metrics</h4>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 border border-white/10">
                      <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Goals</div>
                      <div className="text-2xl font-bold">{player.metrics.goals}</div>
                    </div>
                    <div className="bg-white/5 p-4 border border-white/10">
                      <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Assists</div>
                      <div className="text-2xl font-bold">{player.metrics.assists}</div>
                    </div>
                    <div className="bg-white/5 p-4 border border-white/10">
                      <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Clean Sheets</div>
                      <div className="text-2xl font-bold">{player.metrics.cleanSheets}</div>
                    </div>
                    <div className="bg-white/5 p-4 border border-white/10">
                      <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Bonus</div>
                      <div className="text-2xl font-bold">{player.metrics.bonus}</div>
                    </div>
                  </div>
                  <h4 className="font-serif italic text-sm mt-6 mb-4 border-b border-[#E4E3E0]/20 pb-1">Season Totals</h4>
                  <div className="grid grid-cols-5 gap-2 text-center font-mono">
                    <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">MINS</span><span className="font-bold">{player.minutes}</span></div>
                    <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">G/A</span><span className="font-bold">{player.goals_scored}/{player.assists}</span></div>
                    <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">CS</span><span className="font-bold">{player.clean_sheets}</span></div>
                    <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">BPS</span><span className="font-bold">{player.bonus}</span></div>
                    <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">PTS</span><span className="font-bold text-emerald-400">{player.total_points}</span></div>
                  </div>
                  <div className="p-4 border border-emerald-500/30 bg-emerald-500/5 mt-4">
                    <div className="flex items-center gap-2 font-serif italic text-emerald-400 mb-2"><Info size={14} /> Analysis</div>
                    <p className="font-mono text-[10px] leading-relaxed opacity-70">
                      {player.web_name} has an FPL form rating of {player.fplForm}
                      {player.metrics.isPPAAdjusted ? ` (${player.metrics.ppa} points per appearance, adjusted for injury layoff)` : ""}.
                      With an FDR of {player.fdr}, they are a
                      {player.fplForm > 5 && player.fdr < 2.5 ? " prime transfer target." :
                        player.fplForm > 5 ? " high-form asset with challenging fixtures." :
                          player.fdr < 2.5 ? " potential differential with easy games." : " standard asset."}
                    </p>
                  </div>
                </div>
              </div>

              {(isMidOrFwd || isGkOrDef) && (
                <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-6 mt-2">
                  <h4 className="font-serif italic text-xl mb-4 pb-2 border-b border-[#E4E3E0]/20">Expected Stats</h4>
                  {isMidOrFwd ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/5 border border-white/10 p-4">
                        <div className="font-mono text-[10px] opacity-50 uppercase mb-3">Goals vs xG</div>
                        <div className="flex items-end gap-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] opacity-50 mb-1">ACTUAL</span>
                            <span className="text-3xl font-bold">{goals}</span>
                          </div>
                          <div className="font-mono text-lg opacity-30 mb-1">vs</div>
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] opacity-50 mb-1">xG</span>
                            <span className="text-3xl font-bold opacity-60">{xG.toFixed(1)}</span>
                          </div>
                          <div className="ml-auto flex flex-col items-end">
                            {goals > xG * 1.3 ? (
                              <span className="text-orange-400 font-mono text-[10px] uppercase tracking-widest">↑ Overperforming</span>
                            ) : goals < xG * 0.7 ? (
                              <span className="text-teal-400 font-mono text-[10px] uppercase tracking-widest">↓ Underperforming</span>
                            ) : (
                              <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">On Track</span>
                            )}
                            <span className="font-mono text-[10px] opacity-40 mt-1">{goals > 0 || xG > 0 ? `${((goals / Math.max(xG, 0.01)) * 100).toFixed(0)}% conversion of xG` : '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-4">
                        <div className="font-mono text-[10px] opacity-50 uppercase mb-3">Assists vs xA</div>
                        <div className="flex items-end gap-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] opacity-50 mb-1">ACTUAL</span>
                            <span className="text-3xl font-bold">{assists}</span>
                          </div>
                          <div className="font-mono text-lg opacity-30 mb-1">vs</div>
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] opacity-50 mb-1">xA</span>
                            <span className="text-3xl font-bold opacity-60">{xA.toFixed(1)}</span>
                          </div>
                          <div className="ml-auto flex flex-col items-end">
                            {assists > xA * 1.3 ? (
                              <span className="text-orange-400 font-mono text-[10px] uppercase tracking-widest">↑ Overperforming</span>
                            ) : assists < xA * 0.7 ? (
                              <span className="text-teal-400 font-mono text-[10px] uppercase tracking-widest">↓ Underperforming</span>
                            ) : (
                              <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">On Track</span>
                            )}
                            <span className="font-mono text-[10px] opacity-40 mt-1">{assists > 0 || xA > 0 ? `${((assists / Math.max(xA, 0.01)) * 100).toFixed(0)}% conversion of xA` : '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 border border-white/10 p-4 max-w-sm">
                      <div className="font-mono text-[10px] opacity-50 uppercase mb-3">xGC per 90</div>
                      <div className="flex items-end gap-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-[10px] opacity-50 mb-1">THIS PLAYER</span>
                          <span className="text-3xl font-bold">{xGC90.toFixed(2)}</span>
                        </div>
                        <div className="font-mono text-lg opacity-30 mb-1">vs</div>
                        <div className="flex flex-col">
                          <span className="font-mono text-[10px] opacity-50 mb-1">LEAGUE AVG</span>
                          <span className="text-3xl font-bold opacity-60">{LEAGUE_AVG_XGC90.toFixed(2)}</span>
                        </div>
                        <div className="ml-auto flex flex-col items-end">
                          {xGC90 < LEAGUE_AVG_XGC90 * 0.8 ? (
                            <span className="text-teal-400 font-mono text-[10px] uppercase tracking-widest">Strong CS Chance</span>
                          ) : xGC90 > LEAGUE_AVG_XGC90 * 1.2 ? (
                            <span className="text-orange-400 font-mono text-[10px] uppercase tracking-widest">Weak Defence</span>
                          ) : (
                            <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">Average</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {player.perfProfile && player.perfProfile.archetype !== "Not Enough Data" ? (
                <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-8 mt-2">
                  <h4 className="font-serif italic text-xl mb-6 flex items-center gap-2">
                    <Zap size={20} className="text-emerald-400" /> Performance Archetype: {player.perfProfile.archetype}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="font-mono text-sm leading-relaxed opacity-80 border-l-2 border-emerald-400 pl-4">
                      {player.perfProfile.archetype_blurb}
                      <div className="mt-4 opacity-50 text-[10px] uppercase">Based on {player.perfProfile.appearances} apps ({player.perfProfile.total_minutes} mins)</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center font-mono">
                      <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 2</span><span className="text-lg font-bold text-emerald-400">{player.perfProfile.pp90_fdr2?.toFixed(1) ?? "-"}</span></div>
                      <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 3</span><span className="text-lg font-bold">{player.perfProfile.pp90_fdr3?.toFixed(1) ?? "-"}</span></div>
                      <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 4</span><span className="text-lg font-bold text-rose-300">{player.perfProfile.pp90_fdr4?.toFixed(1) ?? "-"}</span></div>
                      <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 5</span><span className="text-lg font-bold text-rose-500">{player.perfProfile.pp90_fdr5?.toFixed(1) ?? "-"}</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-8 mt-2 opacity-50">
                  <div className="flex items-center gap-2 font-serif italic text-lg mb-2"><Zap size={16} /> Performance Profile: Pending</div>
                  <p className="font-mono text-[10px] uppercase tracking-widest">Insufficient minutes found to generate a reliable tactical archetype (requires 3+ apps).</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
