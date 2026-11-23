# token-radar-radar6

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hendricontrex/token-radar-radar6/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hendricontrex/token-radar-radar6/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for the 2026-11-14 snapshot: 340 pre-token protocols ranked by the
market value a token would have if each protocol's record stayed as it is. The value model
prices exactly the three inputs the bounty names — TVL, seven-day growth, and how long a
protocol has run with no token — fitted on the snapshot's own 128 live-token peers, with
every term kept or dropped per four blind tests (random holdout, time split, leave-one-
category-out, leave-one-out). Every row carries a conformal range, token odds from the
share of peers that already record a token (by category and age band — the direction was
tested, not assumed), and a seven-step farm plan with costs and a break-even calculator.
All 758 protocols are accounted for: 340 ranked, 24 live-token peers set aside for
reference, and 274 excluded for stated reasons.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Reads the snapshot, writes `out/board.json` (the ranked board), `out/data.js`, the
`out/dashboard/` page, four screenshots under `out/screenshots/`, and `out/dossier.json`
(the judge's dossier: dashboard source plus screenshots, 1.06 MB).

---

<sub>Entered on [make.fun](https://make.fun/?ref=r2yvbqdz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
