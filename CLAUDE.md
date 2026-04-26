# FPL Team Builder - AI Assistant Guidelines

## Project Overview
This is a full-stack application for building and analyzing Fantasy Premier League (FPL) teams.
- **Frontend:** React, TypeScript, Vite, Tailwind CSS.
- **Backend:** Express/Node.js, acting as a proxy to avoid CORS and rate-limiting from the official FPL API.

## Global Development Commands
- Install dependencies: `npm install`
- Start development servers (frontend + backend): `npm run dev`
- Build for production: `npm run build`

## Global Coding Standards
- **TypeScript:** Always use strict typing. Refer to `src/types.ts` for domain models like `Player` and `Fixture`.
- **Styling:** Use Tailwind CSS utility classes.
- **Imports:** Use relative paths or designated aliases if configured.

## AI Instructions
- Always review the `.claude/skills/` directory for domain-specific instructions before modifying hooks, UI components, backend sync logic, or metrics calculations.
