import { ReactNode } from "react";
import { MethodologySection } from "../common/MethodologySection";

export const MethodologyTab = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-10">
        <h2 className="text-5xl font-serif italic tracking-tighter mb-2">Methodology</h2>
        <p className="font-mono text-xs uppercase tracking-widest opacity-50">How Player Profiler thinks about football</p>
      </div>

      {([
        {
          title: "🚀 Quick Start — How to use this app",
          content: (
            <ol className="list-decimal list-inside space-y-2 font-mono text-sm opacity-80 leading-relaxed">
              <li>Head to the <strong>Player List</strong> tab. Sort by <strong>Value Score</strong> to find the best targets right now.</li>
              <li>Use the <strong>target signal filters</strong> (FTB Run, Form Run, Hidden Gem, Price Rise) to quickly narrow to players with a specific edge. You can combine them.</li>
              <li>Click any player to expand their stats — you'll see their recent form, upcoming fixtures, and a full performance breakdown.</li>
              <li>Use <strong>My Team</strong> to enter your FPL Team ID and get personalised transfer recommendations based on your actual squad.</li>
              <li>Use <strong>H2H Matchup</strong> if you're in a head-to-head league — enter both Team IDs to find exactly where you have an advantage.</li>
            </ol>
          )
        },
        {
          title: "💰 Value Score — What does this number actually mean?",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-3">
                The Value Score answers: <em>"Is this player worth picking right now?"</em> It's a weighted projection of expected points over the next 5 gameweeks, built from two components:
              </p>
              <div className="space-y-3 mb-4">
                <div className="border-l-2 border-emerald-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">75% — Fixture-Adjusted xPts</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">For each upcoming fixture, we look up the player's PP90 at that specific difficulty tier (FDR 2, 3, 4, or 5) and sum across all 5 gameweeks. Double gameweeks count twice; blanks are skipped.</div>
                </div>
                <div className="border-l-2 border-amber-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">25% — Basement Floor</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Season-long points per game × 5, used as a stabiliser against small-sample noise. Stops a hot streak of easy fixtures inflating a player who's actually average long-term.</div>
                </div>
              </div>
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                The combined score is then multiplied by the player's <strong>reliability score</strong> (discounts rotation risks) and an <strong>availability multiplier</strong> — players with long-term injuries (5+ weeks out) are zeroed entirely.
              </p>
            </>
          )
        },
        {
          title: "⚡ Val/£m — Value per million",
          content: (
            <p className="font-mono text-sm opacity-80 leading-relaxed">
              Val/£m is the Value Score divided by the player's price (in £m). It answers: <em>"How much output are you getting per pound spent?"</em> This is especially useful for identifying budget picks that punch above their weight — a £5m player with a Val/£m of 4.2 is outperforming most £8m options on a per-pound basis. Sort by this column when you need to free up budget without sacrificing projected points.
            </p>
          )
        },
        {
          title: "📊 Fixture Ease (TFDR) — Why does our difficulty differ from the official FPL one?",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-3">
                The official FPL rating treats every position the same — a "difficulty 2" is the same for a goalkeeper and a striker. Our system, <strong>TFDR (True Fixture Difficulty Rating)</strong>, is position and venue-specific.
              </p>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-3">
                We track <strong>Home vs Away Goals Scored/Conceded separately</strong>. For example, an attacker playing Away is evaluated specifically against the opponent's <em>Home Defensive Rank</em>. A defender playing at Home is evaluated against the opponent's <em>Away Attacking Rank</em>.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-4">
                {[{d:1,label:"Easiest",color:"bg-emerald-500/20 border-emerald-500/40"},{d:2,label:"Easy",color:"bg-emerald-500/10 border-emerald-500/20"},{d:3,label:"Neutral",color:"bg-[#141414]/5 border-[#141414]/20"},{d:4,label:"Hard",color:"bg-rose-500/10 border-rose-500/20"},{d:5,label:"Hardest",color:"bg-rose-500/20 border-rose-500/40"}].map(({d,label,color}) => (
                  <div key={d} className={`border ${color} p-3 text-center font-mono`}>
                    <div className="text-lg font-bold">{d}</div>
                    <div className="text-[10px] uppercase opacity-60">{label}</div>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[10px] mt-4 opacity-50 italic uppercase tracking-widest">
                Legend: <strong>UPPERCASE (CHE)</strong> = Home • <strong>lowercase (che)</strong> = Away
              </p>
            </>
          )
        },
        {
          title: "🏷️ Player Archetypes — What do these labels mean?",
          content: (
            <div className="space-y-3">
              {[
                { name: "Talisman", desc: "An elite contributor whose high Points Per 90 is backed by strong underlying expected output. A premium pick across all fixture types." },
                { name: "Flat Track Bully", desc: "Capitalises heavily on weak opponents but drops off against tough defenses. A prime target during favourable fixture runs." },
                { name: "Workhorse", desc: "A reliable starter who delivers steady but unspectacular returns. A solid squad filler with a known floor but limited ceiling." },
                { name: "Rotation Risk", desc: "Doesn't start consistently enough to rely on. Their manager uses them as an option, not a guarantee." },
                { name: "Squad Player", desc: "Primarily a depth piece. Sees very limited minutes with negligible FPL impact." },
              ].map(({ name, desc }) => (
                <div key={name} className="flex gap-4 border-b border-[#141414]/10 pb-3">
                  <div className="font-serif italic text-sm min-w-[180px]">{name}</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          )
        },
        {
          title: "🎯 Target Signals — What do the coloured badges mean?",
          content: (
            <div className="space-y-4">
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                Target signal badges appear under a player's name when they meet a specific set of conditions. You can filter to any combination using the signal toggles above the player list.
              </p>
              <div className="space-y-3">
                {[
                  {
                    label: "FTB Run",
                    color: "bg-amber-500/15 text-amber-600 border-amber-500/30",
                    desc: "The player's archetype is Flat Track Bully and their average TFDR over the next 3 fixtures is ≤ 2.5. FTBs are specifically the players whose value is most fixture-dependent — when the schedule lines up, they're among the best short-term targets in the game."
                  },
                  {
                    label: "Form Run",
                    color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
                    desc: "The player is in the top 20% of form for their position and has easy fixtures ahead (avg TFDR ≤ 2.5). Unlike FTB Run, this applies to any archetype — it captures any in-form player who also has a kind schedule."
                  },
                  {
                    label: "Hidden Gem",
                    color: "bg-violet-500/15 text-violet-600 border-violet-500/30",
                    desc: "The player is in the top 10% of Value Score for their position but has under 5% FPL ownership. These are the differentials the market hasn't caught up to yet — high projected output that most managers aren't holding."
                  },
                  {
                    label: "Price Rise",
                    color: "bg-sky-500/15 text-sky-600 border-sky-500/30",
                    desc: "The player is in the top 15% of transfers in this gameweek and top 30% of Value Score for their position. FPL prices rise when enough managers buy a player. This flag suggests the demand is backed by genuine output — buy before the price moves."
                  },
                ].map(({ label, color, desc }) => (
                  <div key={label} className="flex gap-4 border-b border-[#141414]/10 pb-4">
                    <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-1 border self-start shrink-0 ${color}`}>{label}</span>
                    <div className="font-mono text-xs opacity-70 leading-relaxed">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        },
        {
          title: "✅ Reliability Score — Why isn't an injured player penalised?",
          content: (
            <p className="font-mono text-sm opacity-80 leading-relaxed">
              Standard reliability would just look at: <em>"Out of all the games this season, how many did you start?"</em> The problem is that punishes players who missed a long stretch through injury. Cole Palmer could miss 15 games injured, return and start every game since — but a naive score would still call him unreliable. Our system checks for what we call a <strong>"Sandwich"</strong>: if a player was a regular starter before a long absence <em>and</em> returned to being a regular starter after it, we treat those missed games as excused. Only tactical drops — where a manager benched someone who stayed healthy — actually hurt their score.
            </p>
          )
        },
        {
          title: "⚡ PP90 (Points Per 90) — And why some numbers look wild",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-3">
                PP90 is how many FPL points a player averages per 90 minutes of football — not per game week. It's more useful than total points because it filters out blank gameweeks and injuries. A player who scored 8 points in 45 minutes is effectively more explosive than someone who scored 6 points in 90.
              </p>
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                <strong>Why might you see a PP90 of 40, 60, or even higher?</strong> This happens when a player came on as a substitute, played only 10–15 minutes, and happened to score or assist. That single contribution gets scaled up to a "per 90" rate, making their number look astronomical. It's a real statistical effect, not a bug — but you should take very high PP90 values with a pinch of salt if the player has very few appearances. The more games in the sample, the more reliable the number.
              </p>
            </>
          )
        },
        {
          title: "📋 Stats Columns — What do G, A, CS, and BPS mean?",
          content: (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { abbr: "G", full: "Goals Scored", desc: "Goals scored in the last 5 games." },
                { abbr: "A", full: "Assists", desc: "Assists in the last 5 games." },
                { abbr: "CS", full: "Clean Sheets", desc: "Clean sheets in the last 5 games (relevant for defenders & goalkeepers)." },
                { abbr: "BPS", full: "Bonus Points", desc: "Bonus points earned in the last 5 games. FPL awards these to the top performers each match." },
              ].map(({ abbr, full, desc }) => (
                <div key={abbr} className="border border-[#141414]/10 p-4">
                  <div className="font-serif italic text-3xl mb-1">{abbr}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold mb-2">{full}</div>
                  <div className="font-mono text-[10px] opacity-60 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          )
        },
        {
          title: "🟢 Availability Icons — What do the coloured icons next to player names mean?",
          content: (
            <div className="space-y-3">
              {[
                { icon: "🟢", label: "Available", desc: "Fully fit and expected to be in contention for selection." },
                { icon: "🟡", label: "Doubtful", desc: "Has a fitness concern. May or may not start — worth monitoring closer to the gameweek deadline." },
                { icon: "🔴", label: "Injured", desc: "Currently injured and not available for selection." },
                { icon: "🚫", label: "Suspended", desc: "Serving a ban and will miss upcoming game(s)." },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-4 border-b border-[#141414]/10 pb-3">
                  <div className="text-2xl">{icon}</div>
                  <div>
                    <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">{label}</div>
                    <div className="font-mono text-xs opacity-70 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        },
        {
          title: "⚔️ H2H Matchup — How do I use it?",
          content: (
            <p className="font-mono text-sm opacity-80 leading-relaxed">
              If you're in a head-to-head league, this tab is your secret weapon. Enter your FPL Team ID and your opponent's Team ID, hit Compare, and we'll pull both squads and overlay them. You'll see which players you share (the ones that cancel out), which players only you have (your advantage), and which players only your opponent has (their advantage). We then suggest transfers that specifically target improving your edge over that particular opponent this week.
            </p>
          )
        },
        {
          title: "🔍 Finding Your FPL Team ID",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-4">
                Your Team ID is a unique number that identifies your FPL squad. Here's how to find it in 3 steps:
              </p>
              <ol className="list-decimal list-inside space-y-2 font-mono text-sm opacity-80 leading-relaxed">
                <li>Log in to the official FPL website at <strong>fantasy.premierleague.com</strong>.</li>
                <li>Click on <strong>"Points"</strong> in the top navigation — this takes you to your team's points page.</li>
                <li>Look at the URL in your browser's address bar. It will look something like: <br /><code className="bg-[#141414]/10 px-2 py-1 text-[11px] mt-1 inline-block">fantasy.premierleague.com/entry/<strong>123456</strong>/event/30</code><br />The number between <code>/entry/</code> and <code>/event/</code> is your Team ID.</li>
              </ol>
              <p className="font-mono text-xs opacity-60 mt-4 italic">Your opponent's ID works exactly the same way — just ask them to share it with you.</p>
            </>
          )
        },
        {
          title: "🌱 Season Start — How does the app handle the first few gameweeks?",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-4">
                Most analytics tools are blind at the start of a new season — with no match data, every player looks identical. This app uses <strong>Bayesian blending</strong> to carry forward intelligence from the previous campaign while live data builds up.
              </p>
              <div className="space-y-4">
                <div className="border-l-2 border-emerald-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Player PP90 Blending</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Prior-season PP90s blend with current-season data based on appearances. At 0 games played the prior is weighted 100%; by 10 appearances it has fully decayed and only live data is used. A player who misses matches blends slower — the decay is appearance-based, not time-based.</div>
                </div>
                <div className="border-l-2 border-amber-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">TFDR Map Blending</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">The fixture difficulty map blends prior-season team ratings with live calculations from GW1 through GW8 (roughly 10–80 finished fixtures). This prevents a jarring jump in all player rankings mid-season when the live TFDR engine has enough data to take over.</div>
                </div>
                <div className="border-l-2 border-rose-400 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Club Transfers</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Players who changed clubs in the summer get a discounted prior. FDR-bucketed PP90s are discarded (they were calibrated against a different squad and schedule), while base PP90 is blended at 50% weight. Raw scoring ability travels; team context doesn't.</div>
                </div>
                <div className="border-l-2 border-[#141414]/30 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Price Fallback</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">For players with no history and no prior — such as January signings from overseas leagues — the app uses <code className="bg-[#141414]/10 px-1">price ÷ 10</code> as a last-resort PP90 estimate. FPL prices new players relative to expected output, making this a reasonable proxy until real data exists.</div>
                </div>
              </div>
            </>
          )
        },
        {
          title: "🔄 Data Freshness — How up-to-date is this?",
          content: (
            <p className="font-mono text-sm opacity-80 leading-relaxed">
              All data comes directly from the official Fantasy Premier League API. When the server starts up, it begins syncing historical match data for all players — this typically takes a few minutes and is what you see the progress bar tracking on first load. After that, data is cached for the session. The FPL servers usually go into maintenance mode on Tuesday and Wednesday evenings for gameweek updates — during this window, some data may be temporarily unavailable. If things look stale or missing, try refreshing after the weekly reset window has passed.
            </p>
          )
        },
      ] as { title: string; content: ReactNode }[]).map(({ title, content }) => (
        <MethodologySection key={title} title={title}>
          {content}
        </MethodologySection>
      ))}
    </div>
  );
};
