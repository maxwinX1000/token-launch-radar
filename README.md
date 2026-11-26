# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/maxwinX1000/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/maxwinX1000/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The best token launch radar: 200 pre-token protocols ranked by implied value, with a farm plan for each one.

## The model (radar-2)

Implied value follows only from the snapshot's own figures:

```
implied = round( tvl_usd x category_multiple
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.02 x min(chains - 1, 10)) )
```

The **category multiple** is the market's own median market-cap-to-TVL for that kind of protocol, measured from the snapshot's live-token protocols (at least 3 comps, clamped to 0.05–1.0); a category with too few comps uses the overall median of 0.246. No protocol name is special-cased, and no row is hand-picked.

Top of the board: Steakhouse Financial ($641.9M implied), Gauntlet ($382.3M), Veda ($367.5M).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

This reads the sealed snapshot, writes the ranked board to `/output/board.json`, the dashboard's data to `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json`.

The dashboard is a static page with no network: a sortable, filterable board, a detail view for each protocol with its model breakdown and farm plan, and a live-token view set aside with market caps.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jh1mycz3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
