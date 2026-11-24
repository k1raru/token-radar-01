# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/k1raru/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/k1raru/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 226 pre-token protocols by implied value: every protocol on the snapshot's watchlist, plus every rankable pre-token protocol below the $50M floor. The model scores each protocol from the snapshot's own figures — TVL, seven-day growth measured against its own category's median, how long it has run with no token, and how many chains it lives on — and the dashboard recomputes every row from the same figures, so the page and the board always agree. Each row carries a seven-step farm plan with concrete costs and times, derived from the protocol's category, chains, TVL and age. Protocols the watchlist leaves out above the floor are listed under Set aside with their reason, and live-token protocols are shown with their market caps instead of a model's guess.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=g7dnvnq2&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
