# DEVLOG

Iteration notes for scheduled improvement runs. Newest last.

## Run 1 — Rail severance (anti-paving mechanic)
- **Did:** Added `CFG.SEVERANCE` and `railSeverance()` (js/sim.js). In
  `computeCatchments`, each hex's pop/attraction is scaled down by the amount
  of track in the hex + its 6 neighbours beyond 3 (−12% per extra track hex,
  floor 45%). A single through-line touches ≤3 hexes so trunks are free;
  paving a district with rail throttles the demand it was meant to serve.
  Feeds the core loop: sparse deliberate lines keep demand → money → growth.
- **Decided against:** a flat per-hex idle-track surcharge (upkeep already
  exists at ~12% of build cost and punishes only unused track, not carpet
  paving of used track); penalising stations directly.
- **Tests:** tools/smoke.js passes (357 checks; takes ~17 min).
- **Next:** surface severance to the player (hex inspector line + a map
  overlay, tip text); tune numbers with tools/balance.js; note there is no
  DEVLOG before this run, README is the only history. Highest-need area is
  still onboarding (tips exist behind a toggle; no guided tutorial). Audio:
  not audited this run.
