import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HEADROOM, judgeMetrics, judgeProbe, parsePrometheus, renderSummary } from './server-health.mjs'

const GB = 1024 ** 3

/** A Metrics API payload shaped like Supabase's (node_exporter + postgres_exporter series). */
function payload({ committed, limit, available = 0.4 * GB, total = 1 * GB, swapTotal = 1 * GB, swapFree = 0.8 * GB, diskAvail = 6 * GB, diskSize = 8 * GB, backends = [12, 3], maxConn = 60, drop = [] } = {}) {
  const lines = [
    '# HELP node_memory_Committed_AS_bytes Memory information field Committed_AS_bytes.',
    '# TYPE node_memory_Committed_AS_bytes gauge',
    `node_memory_Committed_AS_bytes{service_type="db"} ${committed}`,
    `node_memory_CommitLimit_bytes{service_type="db"} ${limit}`,
    `node_memory_MemAvailable_bytes{service_type="db"} ${available}`,
    `node_memory_MemTotal_bytes{service_type="db"} ${total}`,
    `node_memory_SwapTotal_bytes{service_type="db"} ${swapTotal}`,
    `node_memory_SwapFree_bytes{service_type="db"} ${swapFree}`,
    `node_filesystem_size_bytes{device="/dev/nvme0n1",fstype="ext4",mountpoint="/"} ${20 * GB}`,
    `node_filesystem_avail_bytes{device="/dev/nvme0n1",fstype="ext4",mountpoint="/"} ${19 * GB}`,
    `node_filesystem_size_bytes{device="/dev/nvme1n1",fstype="ext4",mountpoint="/data"} ${diskSize}`,
    `node_filesystem_avail_bytes{device="/dev/nvme1n1",fstype="ext4",mountpoint="/data"} ${diskAvail}`,
    `node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",mountpoint="/run"} ${100 * GB}`,
    ...backends.map((b, i) => `pg_stat_database_num_backends{datname="db${i}"} ${b}`),
    `pg_settings_max_connections{server="localhost:5432"} ${maxConn}`,
    'some_weird_metric{label="x"} NaN',
  ]
  return lines.filter(l => !drop.some(d => l.startsWith(d))).join('\n')
}
const status = (results, check) => results.find(r => r.check === check)?.status

test('parsePrometheus reads names, labels and values, skipping comments and NaN', () => {
  const m = parsePrometheus(payload({ committed: 1, limit: 2 }))
  assert.equal(m.get('node_memory_Committed_AS_bytes')[0].value, 1)
  assert.equal(m.get('node_filesystem_size_bytes').length, 3)
  assert.equal(m.get('node_filesystem_size_bytes')[1].labels.mountpoint, '/data')
  assert.equal(m.has('some_weird_metric'), false)
})

test('today on Micro (63% committed) passes every check', () => {
  const out = judgeMetrics(parsePrometheus(payload({ committed: 1.19 * GB, limit: 1.88 * GB })))
  assert.deepEqual(out.filter(r => r.status !== 'ok'), [])
  assert.match(out[0].detail, /^63%/)
})

test('the 11-12 outage (1.42 of 1.4 GB committed, swap ~95%) fails', () => {
  const out = judgeMetrics(parsePrometheus(payload({ committed: 1.42 * GB, limit: 1.4 * GB, total: 0.41 * GB, available: 0.004 * GB, swapTotal: 0.41 * GB, swapFree: 0.02 * GB })))
  assert.equal(status(out, 'memory commitment'), 'fail')
  assert.match(out.find(r => r.check === 'memory commitment').detail, /^101%/)
  assert.equal(status(out, 'swap'), 'fail')
  assert.equal(status(out, 'RAM available'), 'fail')
})

test('the week before the outage (~93% committed) already fails, and 85% warns', () => {
  assert.equal(status(judgeMetrics(parsePrometheus(payload({ committed: 1.3 * GB, limit: 1.4 * GB }))), 'memory commitment'), 'fail')
  assert.equal(status(judgeMetrics(parsePrometheus(payload({ committed: 0.85 * GB, limit: 1 * GB }))), 'memory commitment'), 'warn')
})

test('disk uses the /data mount, connections sum every database', () => {
  const out = judgeMetrics(parsePrometheus(payload({ committed: 1, limit: 2, diskAvail: 1 * GB, diskSize: 8 * GB, backends: [40, 15], maxConn: 60 })))
  assert.equal(status(out, 'disk'), 'warn')
  assert.match(out.find(r => r.check === 'disk').detail, /88% used of 8.00 GB \(\/data\)/)
  assert.equal(status(out, 'connections'), 'fail')
  assert.match(out.find(r => r.check === 'connections').detail, /55 of 60/)
})

test('a missing metric fails loudly instead of passing', () => {
  const out = judgeMetrics(parsePrometheus(payload({ committed: 1, limit: 2, drop: ['node_memory_CommitLimit_bytes', 'pg_settings_max_connections'] })))
  assert.equal(status(out, 'memory commitment'), 'fail')
  assert.match(out.find(r => r.check === 'memory commitment').detail, /metric missing: node_memory_CommitLimit_bytes/)
  assert.equal(status(out, 'connections'), 'fail')
})

test('no swap is fine', () => {
  const out = judgeMetrics(parsePrometheus(payload({ committed: 1, limit: 2, swapTotal: 0, swapFree: 0 })))
  assert.equal(status(out, 'swap'), 'ok')
})

test('the probe fails only when every try failed, and warns when slow', () => {
  assert.equal(judgeProbe([{ ok: true, status: 200, ms: 180 }]).status, 'ok')
  assert.equal(judgeProbe([{ ok: false, status: 522, ms: 90 }, { ok: true, status: 200, ms: 300 }]).status, 'ok')
  assert.equal(judgeProbe([{ ok: true, status: 200, ms: HEADROOM.probeMs.warn + 1 }]).status, 'warn')
  const down = judgeProbe([{ ok: false, status: 0, ms: 20000, error: 'timed out' }, { ok: false, status: 522, ms: 90 }])
  assert.equal(down.status, 'fail')
  assert.match(down.detail, /timed out after 20000 ms; then HTTP 522/)
})

test('the summary never contains the secret and explains a skipped metrics check', () => {
  const secret = 'sb_secret_abc123'
  const text = renderSummary('live', [{ check: 'metrics API', status: 'fail', detail: `bad key ${secret}` }], { secret, metricsSkipped: true })
  assert.ok(!text.includes(secret))
  assert.match(text, /SUPABASE_METRICS_KEY/)
  assert.match(text, /❌ 1 over the line/)
})
