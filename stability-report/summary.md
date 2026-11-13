## Stability check

PR run, 76 cases in 150 s: tours 24, refresh/Back 24, links 28.

**Passed.** No finding beyond `scripts/shots/stability-baseline.json`.

4 known finding(s) within the baseline.

Improved (run `npm run stability:baseline` and commit the smaller baseline):

- scroll / events / phone / back:jump: 794 → 0
- scroll / events / desktop / reload:layout-shift: 0.011 → 0
- scroll / events / desktop / back:not-restored: 259 → 0

Not exercised: 4 (listed in the report).
