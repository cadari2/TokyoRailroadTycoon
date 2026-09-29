# DEVLOG

Iteration notes: what changed, what was rejected, what to look at next.

## 2026-09-29 — "First Steps" onboarding card
- **Did:** added a guided checklist card atop every sidebar panel (`guideSteps`/`guideCard` in js/ui.js). Six steps derived from live state (buy land → lay track → two stations → line → train → first profit), each with a one-line "why" and a "Go" button that jumps to the right build mode. Stateless (nothing saved), so loading a game or playing out of order just ticks steps off. Hidden by "Hide guide", by the existing "Show tutorial/tip text" toggle, or once the first profitable line runs. The last step's copy nudges toward sparse, deliberate networks.
- **Decided against:** a modal step-by-step tutorial that locks input (annoying for returning players); saving guide progress (derived state is more robust).
- **Tests:** domsmoke passes (no FAILs). tools/smoke.js takes >2 min here; didn't finish in-session, so re-run it.
- **Next:** highlight the relevant map hexes/buttons per step (pulse on top candidate dense hexes); the hex close-up inspect view; region-select map; density-vs-profit mechanics. Audio: not reviewed this run.
