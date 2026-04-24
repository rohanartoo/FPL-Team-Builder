/**
 * Season Archive Script
 *
 * Run once after GW38 to snapshot current-season performance data into
 * season_priors.json for Bayesian blending at the start of next season.
 *
 *   npx tsx scripts/archive-season.ts
 *
 * Does not require the server to be running. Fetches all player summaries
 * directly from the FPL API, computes performance profiles, and writes the
 * output file. Safe to run on any machine with internet access.
 */

import fs from "fs";
import path from "path";
import {
  calculateLiveStandings,
  calculateAttackForm,
  calculateDefenseForm,
  calculateRawTFDR,
  normalizeTFDRMap,
  calculatePerformanceProfile,
} from "../src/utils/metrics";

const FPL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const PRIORS_FILE = path.join(process.cwd(), "season_priors.json");
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: FPL_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("Non-JSON response");
      return await res.json();
    } catch (err: any) {
      if (attempt === retries) throw err;
      await sleep(500 * attempt);
    }
  }
}

async function run() {
  console.log("═══════════════════════════════════════════════");
  console.log("  FPL Season Archive");
  console.log("═══════════════════════════════════════════════");
  console.log("");

  // ── Phase 1: Fetch bootstrap and fixtures ──────────────

  console.log("Fetching bootstrap and fixtures...");
  const [bootstrapData, allFixtures] = await Promise.all([
    fetchWithRetry("https://fantasy.premierleague.com/api/bootstrap-static/"),
    fetchWithRetry("https://fantasy.premierleague.com/api/fixtures/"),
  ]);

  const allPlayers: any[] = bootstrapData.elements;
  const allTeams: any[] = bootstrapData.teams;
  console.log(`  ${allPlayers.length} players, ${allTeams.length} teams, ${allFixtures.length} fixtures loaded.`);

  // ── Phase 2: Fetch all player summaries ────────────────

  console.log(`\nFetching player summaries (${allPlayers.length} players, batches of ${BATCH_SIZE})...`);
  const summaries: Record<number, any> = {};
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    const batch = allPlayers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (player) => {
        try {
          const data = await fetchWithRetry(
            `https://fantasy.premierleague.com/api/element-summary/${player.id}/`
          );
          if (data && Array.isArray(data.history)) {
            summaries[player.id] = data;
            fetched++;
          }
        } catch {
          failed++;
          console.warn(`  ⚠ Failed to fetch summary for player ${player.id} (${player.web_name})`);
        }
      })
    );

    const done = Math.min(i + BATCH_SIZE, allPlayers.length);
    process.stdout.write(`\r  ${done} / ${allPlayers.length} fetched (${failed} failed)`);
    await sleep(BATCH_DELAY_MS);
  }

  console.log(`\n  Done. ${fetched} summaries fetched, ${failed} failed.`);
  if (failed > 20) {
    console.error("\nERROR: Too many fetch failures. FPL API may be rate-limiting. Try again later.");
    process.exit(1);
  }

  // ── Phase 3: Build TFDR map ────────────────────────────

  console.log("\nBuilding TFDR map...");
  const standings = calculateLiveStandings(allFixtures);
  const rawTfdrMap: Record<number, any> = {};

  allTeams.forEach((t: any) => {
    const st = standings[t.id] || {
      position: 10,
      rank_attack_home: 10, rank_attack_away: 10, rank_attack_overall: 10,
      rank_defense_home: 10, rank_defense_away: 10, rank_defense_overall: 10,
    };
    rawTfdrMap[t.id] = {
      home: {
        defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_home, calculateAttackForm(t.id, allFixtures, "home")),
        attack_fdr: calculateRawTFDR(t.strength, st.rank_defense_home, calculateDefenseForm(t.id, allFixtures, "home"), true),
        overall: calculateRawTFDR(t.strength, st.position, calculateAttackForm(t.id, allFixtures, "home")),
      },
      away: {
        defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_away, calculateAttackForm(t.id, allFixtures, "away")),
        attack_fdr: calculateRawTFDR(t.strength, st.rank_defense_away, calculateDefenseForm(t.id, allFixtures, "away"), true),
        overall: calculateRawTFDR(t.strength, st.position, calculateAttackForm(t.id, allFixtures, "away")),
      },
    };
  });
  normalizeTFDRMap(rawTfdrMap);

  // ── Phase 4: Compute performance profiles ─────────────

  console.log("Computing performance profiles...");
  const playerArchive: Record<number, any> = {};
  let archived = 0;
  let skipped = 0;

  for (const player of allPlayers) {
    const summary = summaries[player.id];
    if (!summary || !Array.isArray(summary.history) || summary.history.length === 0) {
      skipped++;
      continue;
    }
    const profile = calculatePerformanceProfile(
      summary.history, allFixtures, rawTfdrMap, player.status, 3, 270, player.element_type
    );
    playerArchive[player.id] = {
      web_name: player.web_name,
      team: player.team,
      element_type: player.element_type,
      now_cost: player.now_cost,
      total_points: player.total_points,
      points_per_game: player.points_per_game,
      base_pp90: profile.base_pp90,
      pp90_fdr2: profile.pp90_fdr2,
      pp90_fdr3: profile.pp90_fdr3,
      pp90_fdr4: profile.pp90_fdr4,
      pp90_fdr5: profile.pp90_fdr5,
      reliability_score: profile.reliability_score,
      efficiency_rating: profile.efficiency_rating,
      archetype: profile.archetype,
      appearances: profile.appearances,
      total_minutes: profile.total_minutes,
    };
    archived++;
  }
  console.log(`  ${archived} profiles computed, ${skipped} players skipped (no history).`);

  // ── Phase 5: Write output ──────────────────────────────

  const currentSeason =
    bootstrapData.events?.[0]?.deadline_time?.substring(0, 4) ||
    new Date().getFullYear().toString();

  const archive = {
    season: `${currentSeason}-${(parseInt(currentSeason) + 1).toString().slice(-2)}`,
    archivedAt: new Date().toISOString(),
    teamStandings: standings,
    tfdrMap: rawTfdrMap,
    teams: allTeams.map((t: any) => ({
      id: t.id, name: t.name, short_name: t.short_name, strength: t.strength,
    })),
    players: playerArchive,
  };

  fs.writeFileSync(PRIORS_FILE, JSON.stringify(archive, null, 2));

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Season:  ${archive.season}`);
  console.log(`  Players: ${archived}`);
  console.log(`  Output:  ${PRIORS_FILE}`);
  console.log("═══════════════════════════════════════════════");
}

run().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
