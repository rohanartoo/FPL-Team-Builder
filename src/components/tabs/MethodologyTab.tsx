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
              <li>Use the <strong>target signal filters</strong> (FTB Run, Form Run, Hidden Gem, Price Rise, Due a Goal, Regression Risk, Booking Risk) to quickly narrow to players with a specific edge. You can select multiple signals at once — the list will show any player matching at least one. Use the <strong>Archetype filter</strong> to narrow further by player type (e.g. Talisman, Flat Track Bully).</li>
              <li>Click any player to expand their stats — you'll see their recent form, upcoming fixtures, and a full performance breakdown.</li>
              <li>Use <strong>Match Centre → My Squad</strong> to enter your FPL Team ID and get personalised transfer recommendations based on your actual squad.</li>
              <li>Use <strong>Match Centre → H2H Matchup</strong> if you're in a head-to-head league — enter both Team IDs to find exactly where you have an advantage.</li>
              <li>Use <strong>Match Centre → Chip Strategy</strong> to get data-driven recommendations on exactly when to play your Wildcard, Free Hit, Bench Boost, and Triple Captain.</li>
              <li>Use the <strong>Schedules</strong> tab for an instant full-league fixture heatmap — all 20 teams, colour-coded by TFDR difficulty, sorted by easiest upcoming run.</li>
              <li>Use the <strong>Visualization</strong> tab for deeper analysis — compare players on a value scatter, explore xPP90 by fixture difficulty tier, or plot form trajectories side by side.</li>
              <li>Use the <strong>AI Assistant</strong> (chat bubble, bottom-right) to ask natural language questions — "Best value midfielders under £6m?", "Analyse Salah", "Who should I captain this week?" It has full awareness of your squad if you've loaded a Team ID.</li>
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
                  <div className="font-mono text-xs opacity-70 leading-relaxed">For each upcoming fixture, we look up the player's xPP90 at that specific difficulty tier (FDR 2, 3, 4, or 5) and sum across all 5 gameweeks. Double gameweeks count twice; blanks are skipped.</div>
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
                {[{ d: 1, label: "Easiest", color: "bg-emerald-500/20 border-emerald-500/40" }, { d: 2, label: "Easy", color: "bg-emerald-500/10 border-emerald-500/20" }, { d: 3, label: "Neutral", color: "bg-[#141414]/5 border-[#141414]/20" }, { d: 4, label: "Hard", color: "bg-rose-500/10 border-rose-500/20" }, { d: 5, label: "Hardest", color: "bg-rose-500/20 border-rose-500/40" }].map(({ d, label, color }) => (
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
                Target signal badges appear under a player's name when they meet a specific set of conditions. You can filter to any combination using the signal toggles above the player list. Use the separate <strong>Archetype filter</strong> to further narrow by player type — signal and archetype filters stack together (a player must match both to appear).
              </p>
              <div className="space-y-3">
                {[
                  {
                    label: "FTB Run",
                    color: "bg-orange-500/15 text-orange-600 border-orange-500/30",
                    desc: "The player's archetype is Flat Track Bully and their average TFDR over the next 3 fixtures is ≤ 2.5. FTBs are specifically the players whose value is most fixture-dependent — when the schedule lines up, they're among the best short-term targets in the game."
                  },
                  {
                    label: "Form Run",
                    color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
                    desc: "The player is in the top 20% of FPL form for their position and has easy fixtures ahead (avg TFDR ≤ 2.5). Form here is FPL's official rolling average — always current. Unlike FTB Run, this applies to any archetype — it captures any in-form player who also has a kind schedule."
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
                  {
                    label: "Due a Goal",
                    color: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
                    desc: "A midfielder or forward with 450+ minutes played whose xG per 90 is ≥ 0.25, but whose actual goals are less than 55% of their cumulative xG. In other words: they're generating real chances and failing to convert at an unusual rate. Regression to the mean tends to close this gap — these players often return big soon."
                  },
                  {
                    label: "Regression Risk",
                    color: "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30",
                    desc: "A midfielder or forward with 450+ minutes and at least 2.0 xG whose actual goals exceed 1.8× their expected tally. They've been finishing well above what the underlying data supports. This is a warning flag — don't expect the over-performance to continue, especially before a tough run of fixtures."
                  },
                  {
                    label: "Booking Risk",
                    color: "bg-red-500/15 text-red-600 border-red-500/30",
                    desc: "Triggered by one of two conditions: (1) the player is at a Premier League suspension threshold (4, 9 yellows, or 5+ yellows with 2 reds) — one more booking means a ban; or (2) they have 270+ minutes played and are picking up cards at a rate of ≥ 0.3 per 90. Useful for captaincy decisions and transfer planning around fixture weeks where discipline could cost you points."
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
          title: "⚡ xPP90 (Expected Points Per 90) — And why it differs from raw points",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-3">
                xPP90 is a model-derived estimate of how many FPL points a player is expected to produce per 90 minutes, blending two signals: their underlying stats (xG, xA, xGC — what they <em>should</em> be scoring based on the chances they create or prevent) and their actual match performance. The blend is 70% expected stats, 30% raw performance, to correct for lucky finishers and unlucky underliers.
              </p>
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                <strong>Why does xPP90 sometimes look higher than a player's actual points would suggest?</strong> For attackers, a player creating lots of chances but not converting will have a higher xPP90 than their raw returns imply — the model believes they are due. For defenders and goalkeepers, xPP90 is heavily influenced by their team's clean sheet probability; a GK behind a very solid defence will show a higher xPP90 than one who makes lots of saves for a leaky team. If a player's xPP90 looks surprising, check their archetype and reliability score alongside it.
              </p>
            </>
          )
        },
        {
          title: "📋 Stats Columns — What do G5, A5, CS5, and B5 mean?",
          content: (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { abbr: "G5", full: "Goals Scored", desc: "Goals scored in the last 5 games." },
                { abbr: "A5", full: "Assists", desc: "Assists in the last 5 games." },
                { abbr: "CS5", full: "Clean Sheets", desc: "Clean sheets in the last 5 games (relevant for defenders & goalkeepers)." },
                { abbr: "B5", full: "Bonus Points", desc: "Bonus points earned in the last 5 games. FPL awards these to the top performers each match." },
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
          title: "📉 Form Column — What does this number show?",
          content: (
            <p className="font-mono text-sm opacity-80 leading-relaxed">
              The <strong>Form</strong> column shows FPL's official rolling form average — the same number you see on the FPL website. It reflects total points over the last 30 days divided by games played, and updates live as games finish. It's the most honest signal for recent output, including blanks and rested games, making it directly useful for transfer decisions.
            </p>
          )
        },
        {
          title: "🤖 AI Assistant — What can it do?",
          content: (
            <div className="space-y-3">
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                The AI Assistant (chat bubble in the bottom-right corner) lets you ask natural language questions about FPL. It has access to live FPL data and can answer questions like:
              </p>
              <ul className="list-disc list-inside space-y-1 font-mono text-sm opacity-80 leading-relaxed">
                <li>"Best value midfielders under £6m right now?"</li>
                <li>"Analyse Salah — is he worth captaining?"</li>
                <li>"Who has the best fixtures over the next 5 gameweeks?"</li>
                <li>"Who's injured this week?"</li>
                <li>"Price rises to buy before they happen?"</li>
              </ul>
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                If you've loaded a Team ID in Match Centre, the assistant also knows your squad — ask "Who are my weak links?" or "Who should I captain this week?" and it will answer based on your actual players. Access requires a passphrase.
              </p>
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
          title: "📅 Schedules — How does the fixture heatmap work?",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-3">
                The Schedules tab gives you a one-click, full-league fixture heatmap — all 20 Premier League teams across their next 8 gameweeks, colour-coded by TFDR difficulty and sorted easiest-first.
              </p>
              <div className="space-y-3">
                <div className="border-l-2 border-emerald-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Avg-5 Badge</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Each team row shows a small coloured badge with their average TFDR difficulty over the next 5 gameweeks. This is the primary sort key — easiest run at the top.</div>
                </div>
                <div className="border-l-2 border-amber-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Trend Arrow</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">A ↗ green arrow means the team's first 4 fixtures are <em>harder</em> than their last 4 — the run improves as it goes on. A ↘ red arrow means the opposite: easy now, toughening later. No arrow = negligible difference between the two halves. The split is always GWs 1–4 vs GWs 5–8 of the displayed window.</div>
                </div>
                <div className="border-l-2 border-[#141414]/30 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Cell colours</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Green cells = easy fixtures, red cells = hard fixtures. Opponent abbreviation is uppercase for Home, lowercase for Away. Blank gameweeks show a dash.</div>
                </div>
              </div>
            </>
          )
        },
        {
          title: "📈 Visualization — What are the three views?",
          content: (
            <div className="space-y-4">
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                The Visualization tab gives you three analytical lenses on the data — switch between them using the buttons at the top.
              </p>
              <div className="space-y-4">
                {[
                  {
                    name: "Value Quadrant",
                    desc: "A scatter plot of every player: Price on the X-axis, Value Score on the Y-axis, bubble size representing reliability. The dashed reference lines sit at the median price and median value for the selected position group. The sweet spot — cheap and high-value — is the top-left. Click any bubble to open that player in the Compare tab."
                  },
                  {
                    name: "PP90 Breakdown",
                    desc: "A grouped bar chart showing each player's Points Per 90 broken down by fixture difficulty tier (Easy FDR 2, Neutral FDR 3, Hard FDR 4, Very Hard FDR 5). Only players with data in at least 3 of the 4 buckets are shown. This is how you spot Flat Track Bullies (tall green bar, flat red bar) vs Talismans (bars roughly equal across all tiers). Filter by position or archetype."
                  },
                  {
                    name: "Form Trajectory",
                    desc: "A GW-by-GW line chart for up to 10 players over the last 10 gameweeks. Search by player name or club, select who you want to compare, and each player gets a distinct colour. Gaps in the line indicate a blank gameweek or absence. Click 'Compare' next to any player in the legend to open them in the Compare tab."
                  },
                ].map(({ name, desc }) => (
                  <div key={name} className="flex gap-4 border-b border-[#141414]/10 pb-4">
                    <div className="font-serif italic text-sm min-w-[160px] shrink-0">{name}</div>
                    <div className="font-mono text-xs opacity-70 leading-relaxed">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        },
        {
          title: "⚔️ Match Centre — How do I use it?",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-4">
                Match Centre combines your squad analysis and head-to-head tools in one place. Use the <strong>My Squad</strong> / <strong>H2H Matchup</strong> toggle at the top to switch between the two views. Your Team ID carries across both — enter it once and it's pre-filled when you switch views.
              </p>
              <div className="space-y-3">
                <div className="border-l-2 border-emerald-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">My Squad</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Enter your FPL Team ID to load your squad. You'll see your bank balance, overall rank, recent GW points, chips used and available, recommended transfers ranked by value gain, and a full squad metrics table. Lock players from the table to exclude them from transfer suggestions.</div>
                </div>
                  <div className="border-l-2 border-rose-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">H2H Matchup</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Enter your Team ID and your opponent's Team ID, then hit Analyze Matchup. We pull both squads and overlay them — you'll see which players you share (they cancel out), which only you have (your edge), and which only your opponent has (their edge). The Edge Finder then suggests transfers that specifically improve your advantage over that opponent this week.</div>
                </div>
                <div className="border-l-2 border-sky-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Chip Strategy</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">View mathematically optimized gameweeks for your remaining chips. The engine analyzes upcoming fixture difficulty, double/blank gameweeks, and your current squad composition to recommend the best deployment windows.</div>
                </div>
              </div>
            </>
          )
        },
        {
          title: "🃏 Chip Strategy Engine — How does it know when to play a chip?",
          content: (
            <>
              <p className="font-mono text-sm opacity-80 leading-relaxed mb-4">
                The Chip Strategy tool evaluates the next 10 gameweeks against your exact squad to find mathematical advantages:
              </p>
              <div className="space-y-4">
                <div className="border-l-2 border-fuchsia-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Wildcard & Free Hit</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">These chips are triggered by "squad distress" — primarily Blank Gameweeks where multiple teams aren't playing, or runs where your squad's average fixture difficulty is overwhelmingly high. It targets the gameweek where a structural overhaul provides the most value.</div>
                </div>
                <div className="border-l-2 border-emerald-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Bench Boost</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">The engine scans for Double Gameweeks where your bench players have an extra fixture, maximizing your active player count. It ties this with the overall average fixture ease of your entire 15-man squad.</div>
                </div>
                <div className="border-l-2 border-amber-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Triple Captain</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">It looks for the single best captaincy opportunity. It identifies the player in your squad with the highest Points Per 90, then finds a gameweek where they either have a Double Gameweek or face an exceptionally weak defense (FDR 1 or 2).</div>
                </div>
              </div>
            </>
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
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Player xPP90 Blending</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Prior-season xPP90s blend with current-season data based on appearances. At 0 games played the prior is weighted 100%; by 10 appearances it has fully decayed and only live data is used. A player who misses matches blends slower — the decay is appearance-based, not time-based.</div>
                </div>
                <div className="border-l-2 border-amber-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">TFDR Map Blending</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">The fixture difficulty map blends prior-season team ratings with live calculations from GW1 through GW8 (roughly 10–80 finished fixtures). This prevents a jarring jump in all player rankings mid-season when the live TFDR engine has enough data to take over.</div>
                </div>
                <div className="border-l-2 border-rose-400 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Club Transfers</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Players who changed clubs in the summer get a discounted prior. FDR-bucketed xPP90s are discarded (they were calibrated against a different squad and schedule), while base xPP90 is blended at 50% weight. Raw scoring ability travels; team context doesn't.</div>
                </div>
                <div className="border-l-2 border-[#141414]/30 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Price Fallback</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">For players with no history and no prior — such as January signings from overseas leagues — the app uses <code className="bg-[#141414]/10 px-1">price ÷ 10</code> as a last-resort xPP90 estimate. FPL prices new players relative to expected output, making this a reasonable proxy until real data exists.</div>
                </div>
              </div>
            </>
          )
        },
        {
          title: "🔄 Data Freshness — How up-to-date is this?",
          content: (
            <div className="space-y-3">
              <p className="font-mono text-sm opacity-80 leading-relaxed">
                All data comes directly from the official Fantasy Premier League API. Different data refreshes on different cadences:
              </p>
              <div className="space-y-3">
                <div className="border-l-2 border-emerald-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Live (every 5 minutes)</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Player prices, FPL form, availability/injury status, ownership %, xG/xA stats, transfer volumes. These update automatically in the background — no refresh needed.</div>
                </div>
                <div className="border-l-2 border-amber-500 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">Every 12 hours (historical)</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">Per-gameweek match history for all players — used to compute xPP90, archetypes, reliability scores, and Value Score. This is what the progress bar on first load is building. After a gameweek finishes, values like xPP90 and archetypes will update within 12 hours of the next sync.</div>
                </div>
                <div className="border-l-2 border-[#141414]/30 pl-4">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest mb-1">FPL maintenance windows</div>
                  <div className="font-mono text-xs opacity-70 leading-relaxed">The FPL servers usually go into maintenance mode on Tuesday and Wednesday evenings for gameweek updates. During this window some data may be temporarily unavailable. If things look stale or missing, try again after the weekly reset window has passed.</div>
                </div>
              </div>
            </div>
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
