# FPL Form & Fixture Analyzer

A Fantasy Premier League tool to analyze player form over the last 5 gameweeks against upcoming fixture difficulty ratings (FDR).

## Features

- **Player List** — Browse and sort all FPL players by form, fixture ease, value score, goals, assists, clean sheets, and bonus points
- **Visualization** — Scatter chart plotting form vs. fixture ease to quickly identify transfer targets
- **Team Schedule** — View and compare upcoming fixture difficulty for all 20 Premier League teams
- **Squad Analysis** — Enter your FPL Team ID to analyze your squad and get transfer suggestions

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. Start the development server:
   ```
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000)

> No API key required. The app proxies data directly from the official Fantasy Premier League API.
