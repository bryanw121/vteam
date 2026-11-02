/**
 * The finished scoresheet as one self-contained HTML page, laid out like the USA Volleyball
 * two-set scoresheet (header, a block per set with starting lineups, substitutions, service
 * rounds, time-outs and the running score, then results, sanctions, remarks and signatures).
 * Used for the web preview / print and for native PDF export (expo-print), so both match.
 * Ink colors are plain black on white on purpose: this is a printed form.
 */
import type { MatchDoc, MatchState, SetState, TeamSetState, TeamSide } from '../../types/scoresheet'
import { POSITION_LABELS, other } from './engine'
import { SANCTION_CODES, whoLabel } from './describe'
import { teamName } from './summary'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const time = (ms: number | null) => (ms == null ? '' : new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
const minutes = (s: SetState) => (s.endedAt == null ? '' : `${Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000))}'`)

function runningScore(t: TeamSetState, target: number): string {
  const max = Math.max(36, target + 11, t.marks.length)
  const cells: string[] = []
  for (let n = 1; n <= max; n++) {
    const mark = t.marks[n - 1]
    const cls = mark === 'penalty' ? 'pt pen' : mark ? 'pt hit' : 'pt'
    const final = n === t.score && t.score > 0 ? ' final' : ''
    cells.push(`<span class="${cls}${final}">${n}</span>`)
  }
  return `<div class="run">${cells.join('')}</div>`
}

function teamBlock(doc: MatchDoc, set: SetState, side: TeamSide): string {
  const t = set.teams[side]
  const opp = set.teams[other(side)]
  const serveFirst = set.firstServe === side
  const cols = POSITION_LABELS.map((label, slot) => {
    const subs = t.subs.filter(s => s.slot === slot)
    const subsHtml = subs.length
      ? subs.map(s => `<div class="sub${s.exceptional ? ' exc' : ''}"><b>${esc(s.in)}</b><small>${s.score[0]}:${s.score[1]}</small></div>`).join('')
      : '<div class="sub empty"></div>'
    const turns = t.turns[slot]
    const turnsHtml = turns.length
      ? turns.map(turn => `<span class="turn">${turn.endScore ?? '&nbsp;'}</span>`).join('')
      : '<span class="turn">&nbsp;</span>'
    return `<td><div class="pos">${label}</div><div class="start">${esc(t.lineup[slot])}</div>${subsHtml}<div class="turns">${turnsHtml}</div></td>`
  }).join('')
  const timeouts = [0, 1].map(i => {
    const to = t.timeouts[i]
    return `<span class="box">${to ? `${to.score[0]}:${to.score[1]}` : '&nbsp;'}</span>`
  }).join('')
  const extraTimeouts = t.timeouts.length > 2 ? `<span class="note">+${t.timeouts.length - 2} more</span>` : ''
  const liberos = t.liberos.length ? t.liberos.map(n => `<span class="box">${esc(n)}</span>`).join('') : '<span class="box">&nbsp;</span>'
  return `
  <div class="team">
    <div class="teamhead">
      <span class="sr">${serveFirst ? 'S' : 'R'}</span>
      <span class="ab">${side}</span>
      <span class="tname">${esc(teamName(doc, side))}</span>
      <span class="final-score">${t.score}</span>
    </div>
    <table class="lineup"><tr>${cols}</tr></table>
    <div class="row-small">
      <span>Time-outs ${timeouts}${extraTimeouts}</span>
      <span>Libero ${liberos}</span>
      <span>Subs <b>${t.subs.length}</b></span>
      ${t.cancelled ? `<span>Cancelled points <b>${t.cancelled}</b></span>` : ''}
    </div>
    <div class="label">Points (opponent ${opp.score})</div>
    ${runningScore(t, set.target)}
  </div>`
}

function setBlock(doc: MatchDoc, set: SetState): string {
  const winner = set.winner ? esc(teamName(doc, set.winner)) : 'in progress'
  return `
  <section class="set">
    <div class="sethead">
      <b>Set ${set.index + 1}</b>
      <span>to ${set.target}</span>
      <span>Start ${esc(time(set.startedAt))}</span>
      <span>End ${esc(time(set.endedAt))}</span>
      ${set.courtSwitchAt != null ? `<span>Court switch at ${set.courtSwitchAt}</span>` : ''}
      <span class="right">Winner: ${winner}</span>
    </div>
    <div class="teams">${teamBlock(doc, set, 'A')}${teamBlock(doc, set, 'B')}</div>
  </section>`
}

function results(doc: MatchDoc, state: MatchState): string {
  const rows = state.sets.map(s => {
    const a = s.teams.A
    const b = s.teams.B
    const w = (side: TeamSide) => (s.winner === side ? 1 : 0)
    return `<tr><td>${a.timeouts.length}</td><td>${a.subs.length}</td><td>${w('A')}</td><td><b>${a.score}</b></td>
      <td class="mid">Set ${s.index + 1} <small>${minutes(s)}</small></td>
      <td><b>${b.score}</b></td><td>${w('B')}</td><td>${b.subs.length}</td><td>${b.timeouts.length}</td></tr>`
  })
  const sum = (f: (s: SetState) => number) => state.sets.reduce((acc, s) => acc + f(s), 0)
  const total = state.sets.reduce((acc, s) => acc + (s.endedAt != null ? s.endedAt - s.startedAt : 0), 0)
  const verdict = state.over
    ? state.winner
      ? `Winner: <b>${esc(teamName(doc, state.winner))}</b> ${Math.max(state.setsWon.A, state.setsWon.B)}–${Math.min(state.setsWon.A, state.setsWon.B)}`
      : `Split ${state.setsWon.A}–${state.setsWon.B}`
    : 'Match not finished'
  return `
  <section class="box-section">
    <h3>Results</h3>
    <table class="results">
      <tr><th colspan="4">${esc(teamName(doc, 'A'))}</th><th></th><th colspan="4">${esc(teamName(doc, 'B'))}</th></tr>
      <tr class="sub"><th>T</th><th>S</th><th>W</th><th>P</th><th>Set</th><th>P</th><th>W</th><th>S</th><th>T</th></tr>
      ${rows.join('')}
      <tr class="total"><td>${sum(s => s.teams.A.timeouts.length)}</td><td>${sum(s => s.teams.A.subs.length)}</td><td>${state.setsWon.A}</td><td>${sum(s => s.teams.A.score)}</td>
      <td class="mid">Total <small>${total ? `${Math.round(total / 60000)}'` : ''}</small></td>
      <td>${sum(s => s.teams.B.score)}</td><td>${state.setsWon.B}</td><td>${sum(s => s.teams.B.subs.length)}</td><td>${sum(s => s.teams.B.timeouts.length)}</td></tr>
    </table>
    <p class="verdict">${verdict}</p>
  </section>`
}

function sanctions(doc: MatchDoc, state: MatchState): string {
  const rows = state.sanctions.map(s => `<tr><td>${SANCTION_CODES[s.kind]}</td><td>${esc(whoLabel(doc.setup, s.team, s.who))}</td><td>${s.team}</td><td>${s.set + 1}</td><td>${s.score[0]}:${s.score[1]}</td></tr>`)
  return `
  <section class="box-section">
    <h3>Sanctions</h3>
    <div class="ir">Improper request: A <span class="box">${state.improperRequests.A ? '✕' : '&nbsp;'}</span> B <span class="box">${state.improperRequests.B ? '✕' : '&nbsp;'}</span></div>
    <table class="sanctions"><tr><th>Code</th><th>Who</th><th>Team</th><th>Set</th><th>Score</th></tr>${rows.join('') || '<tr><td colspan="5" class="none">None</td></tr>'}</table>
    <p class="legend">DW delay warning · DP delay penalty · W warning · P penalty · E expulsion · D disqualification · IR improper request. Score is the sanctioned team's first.</p>
  </section>`
}

function rosters(doc: MatchDoc): string {
  return (['A', 'B'] as const).map(side => {
    const players = doc.setup.teams[side].players
    const rows = players.map(p => `<li><b>${esc(p.number)}</b> ${esc(p.name ?? '')}${p.libero ? ' <i>L</i>' : ''}${p.captain ? ' <i>C</i>' : ''}</li>`).join('')
    return `<div><h4>${side} · ${esc(teamName(doc, side))}</h4><ul class="roster">${rows || '<li>No roster</li>'}</ul></div>`
  }).join('')
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:16px;font:11px/1.35 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#000;background:#fff}
h1{font-size:16px;margin:0}h3{font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:.04em}h4{margin:0 0 4px;font-size:11px}
.sheet{max-width:1100px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px;gap:12px}
.info{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid #000;margin-bottom:10px}
.info div{border-right:1px solid #000;border-bottom:1px solid #000;padding:3px 5px;min-height:30px}
.info small{display:block;font-size:9px;text-transform:uppercase;color:#333}
.set{border:1.5px solid #000;margin-bottom:10px;break-inside:avoid}
.sethead{display:flex;gap:14px;padding:4px 6px;border-bottom:1px solid #000;background:#eee;flex-wrap:wrap}
.sethead .right{margin-left:auto}
.teams{display:grid;grid-template-columns:1fr 1fr}
.team{padding:6px;border-right:1px solid #000}.team:last-child{border-right:0}
.teamhead{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.sr,.ab{display:inline-flex;width:18px;height:18px;border:1px solid #000;align-items:center;justify-content:center;font-weight:700}
.sr{border-radius:50%}
.tname{font-weight:700;flex:1}
.final-score{font-size:16px;font-weight:800;border:2px solid #000;padding:0 6px}
table.lineup{width:100%;border-collapse:collapse;table-layout:fixed}
table.lineup td{border:1px solid #000;vertical-align:top;padding:0;text-align:center}
.pos{font-size:9px;border-bottom:1px solid #000;background:#f4f4f4}
.start{font-size:15px;font-weight:800;padding:2px 0;border-bottom:1px solid #000}
.sub{border-bottom:1px dotted #000;padding:1px 0;min-height:24px}.sub b{display:block;font-size:12px}.sub small{font-size:9px}
.sub.exc b{text-decoration:underline}
.turns{display:flex;flex-wrap:wrap;gap:1px;padding:2px;justify-content:center;min-height:22px}
.turn{display:inline-block;min-width:18px;border:1px solid #000;font-size:10px;padding:0 1px}
.row-small{display:flex;flex-wrap:wrap;gap:10px;margin:5px 0;align-items:center}
.box{display:inline-block;min-width:30px;border:1px solid #000;text-align:center;margin-left:3px;padding:0 2px}
.note{margin-left:4px;font-style:italic}
.label{font-size:9px;text-transform:uppercase;margin:4px 0 2px}
.run{display:grid;grid-template-columns:repeat(12,1fr);border-left:1px solid #000;border-top:1px solid #000}
.pt{border-right:1px solid #000;border-bottom:1px solid #000;text-align:center;font-size:10px;position:relative;color:#555}
.pt.hit{color:#000;font-weight:700;background:linear-gradient(to top right,transparent calc(50% - 1px),#000 calc(50% - .5px),#000 calc(50% + .5px),transparent calc(50% + 1px))}
.pt.pen{color:#000;font-weight:700;border-radius:50%;outline:1.5px solid #000;outline-offset:-3px}
.pt.final{box-shadow:inset 0 0 0 2px #000}
.lower{display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-bottom:10px}
.box-section{border:1.5px solid #000;padding:6px;break-inside:avoid}
table.results,table.sanctions{width:100%;border-collapse:collapse;text-align:center}
table.results td,table.results th,table.sanctions td,table.sanctions th{border:1px solid #000;padding:2px 3px}
table.results tr.sub th{font-size:9px;background:#f4f4f4}
table.results .mid{background:#f4f4f4}
table.results tr.total td{font-weight:800}
.verdict{margin:6px 0 0;font-size:12px}
.ir{margin-bottom:4px}.none{color:#555}.legend{font-size:9px;margin:4px 0 0}
.remarks{border:1.5px solid #000;padding:6px;min-height:50px;margin-bottom:10px;break-inside:avoid}
.remarks ol{margin:0;padding-left:16px}
.rosters{display:grid;grid-template-columns:1fr 1fr;gap:10px;border:1.5px solid #000;padding:6px;margin-bottom:10px;break-inside:avoid}
ul.roster{list-style:none;margin:0;padding:0;columns:3;font-size:10px}
.sign{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;break-inside:avoid}
.sign div{border-top:1px solid #000;padding-top:2px;font-size:9px;margin-top:26px}
.sign b{display:block;font-size:11px;margin-top:-24px;height:22px}
.foot{font-size:9px;color:#444;margin-top:10px}
@media (max-width:700px){.teams{grid-template-columns:1fr}.team{border-right:0;border-bottom:1px solid #000}.lower{grid-template-columns:1fr}.info{grid-template-columns:repeat(2,1fr)}.sign{grid-template-columns:repeat(2,1fr)}}
@page{size:letter landscape;margin:8mm}
@media print{body{padding:0}.set{page-break-inside:avoid}}
`

/** The completed scoresheet page. `generatedAt` is injectable for tests. */
export function scoresheetHtml(doc: MatchDoc, state: MatchState, generatedAt: number = Date.now()): string {
  const { info } = doc.setup
  const field = (label: string, value: unknown) => `<div><small>${label}</small>${esc(value)}</div>`
  const gender = info.gender ? { men: 'Men', women: 'Women', coed: 'CoEd' }[info.gender] : ''
  const rules = doc.setup.rules
  const remarks = state.remarks.length ? `<ol>${state.remarks.map(r => `<li>${esc(r)}</li>`).join('')}</ol>` : '<p>&nbsp;</p>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(teamName(doc, 'A'))} vs ${esc(teamName(doc, 'B'))} · Scoresheet</title><style>${CSS}</style></head>
<body><div class="sheet">
<div class="top"><div><h1>Official Scoresheet</h1><div>${esc(teamName(doc, 'A'))} <b>vs</b> ${esc(teamName(doc, 'B'))}</div></div>
<div>Rules: ${esc({ usav: 'USA Volleyball', international: 'International', casual: 'Recreational' }[rules.preset])} · ${rules.subsPerSet ?? 'unlimited'} subs · ${rules.timeoutsPerSet} time-outs per set</div></div>
<div class="info">
${field('Competition', info.competition)}${field('Match no.', info.matchNo)}${field('Division / category', info.division)}${field('City, state', info.city)}${field('Hall', info.hall)}
${field('Court', info.court)}${field('Date', info.date)}${field('Time', time(state.sets[0]?.startedAt ?? null))}${field('Gender', gender)}${field('Scorer', info.scorer)}
</div>
${state.sets.map(s => setBlock(doc, s)).join('') || '<p>No sets played yet.</p>'}
<div class="lower">${results(doc, state)}${sanctions(doc, state)}</div>
<div class="remarks"><h3>Remarks</h3>${remarks}</div>
<div class="rosters">${rosters(doc)}</div>
<div class="sign">
<div><b>${esc(info.firstReferee)}</b>1st referee</div><div><b>${esc(info.secondReferee)}</b>2nd referee</div><div><b>${esc(info.scorer)}</b>Scorer</div><div><b>&nbsp;</b>Captain A / Captain B</div>
</div>
<p class="foot">Service rounds: the box under each position is the team's score when that server lost the serve. Substitutions: entering player and score (team:opponent). Running score: slashed numbers were points won, circled numbers came from penalties. Generated by vteam ${esc(new Date(generatedAt).toLocaleString('en-US'))}.</p>
</div></body></html>`
}
