import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BACKLOG_ALERT_DAYS,
  dedupeBatches,
  deriveBacklogAlert,
  normalizeBacklogDays,
  normalizeCapacity,
  normalizeRisk,
  riskRank,
} from '../src/utils/backlogAlert.js'
import { riskMeta } from '../src/utils/restorationFormatters.js'
import {
  restorationBatches,
  restorationCapacity,
  restorationTasks,
} from '../src/data/restorationData.js'

const sampleBatches = [
  { code: 'A-03', risk: 'high', backlogDays: 21 },
  { code: 'B-11', risk: 'medium', backlogDays: 12 },
  { code: 'C-02', risk: 'low', backlogDays: 6 },
]

test('无数据：全部入参缺失时返回稳定的空结果', () => {
  const alert = deriveBacklogAlert()

  assert.deepEqual(alert.pendingBatches, [])
  assert.equal(alert.pendingCount, 0)
  assert.equal(alert.backlogValue, '0 册')
  assert.equal(alert.alertCount, 0)
  assert.equal(alert.maxBacklogDays, 0)
  assert.equal(alert.capacity, null)
  assert.equal(alert.overCapacity, false)
  assert.equal(alert.highRiskCount, 0)
})

test('无数据：非数组输入按空列表处理', () => {
  const alert = deriveBacklogAlert({ batches: null, tasks: 'oops' })

  assert.equal(alert.pendingCount, 0)
  assert.equal(alert.highRiskCount, 0)
})

test('容量缺失：容量不是有限非负数时不做容量限制', () => {
  for (const capacity of [undefined, null, Number.NaN, 'many', -1]) {
    const alert = deriveBacklogAlert({ batches: sampleBatches, capacity })

    assert.equal(alert.capacity, null)
    assert.equal(alert.overCapacity, false)
    assert.equal(alert.pendingCount, 3)
  }
})

test('容量判断：容量有效时按上限判断是否超容', () => {
  const fits = deriveBacklogAlert({ batches: sampleBatches, capacity: 3 })
  assert.equal(fits.capacity, 3)
  assert.equal(fits.overCapacity, false)

  const overflow = deriveBacklogAlert({ batches: sampleBatches, capacity: 2 })
  assert.equal(overflow.capacity, 2)
  assert.equal(overflow.overCapacity, true)

  const zero = deriveBacklogAlert({ batches: sampleBatches, capacity: 0 })
  assert.equal(zero.capacity, 0)
  assert.equal(zero.overCapacity, true)
})

test('重复标记：同一 code 只计一次，保留首次出现且顺序稳定', () => {
  const duplicated = [
    { code: 'A-03', risk: 'high', backlogDays: 21 },
    { code: 'B-11', risk: 'medium', backlogDays: 12 },
    { code: 'A-03', risk: 'low', backlogDays: 1 },
    { code: 'A-03', risk: 'low', backlogDays: 2 },
  ]

  const alert = deriveBacklogAlert({ batches: duplicated })

  assert.equal(alert.pendingCount, 2)
  assert.deepEqual(
    alert.pendingBatches.map((batch) => batch.code),
    ['A-03', 'B-11'],
  )
  assert.equal(alert.pendingBatches[0].backlogDays, 21)
})

test('重复标记：缺 code 的条目不参与去重，非法条目被忽略', () => {
  const batches = [
    { title: '无编号甲' },
    null,
    { title: '无编号乙' },
    'junk',
    { code: 'C-02' },
  ]

  assert.equal(dedupeBatches(batches).length, 3)
})

test('风险等级：未知等级按低风险处理，排序权重保持高>中>低', () => {
  assert.equal(normalizeRisk('high'), 'high')
  assert.equal(normalizeRisk(undefined), 'low')
  assert.equal(normalizeRisk('strange'), 'low')
  assert.ok(riskRank('high') > riskRank('medium'))
  assert.ok(riskRank('medium') > riskRank('low'))
  assert.equal(riskRank('strange'), riskRank('low'))

  assert.deepEqual(riskMeta('high'), { label: '高', tone: 'high' })
  assert.deepEqual(riskMeta('medium'), { label: '中', tone: 'medium' })
  assert.deepEqual(riskMeta('strange'), { label: '低', tone: 'low' })
})

test('风险等级：高风险任务计数只统计 high，口径与风险归一化一致', () => {
  const tasks = [
    { risk: 'high' },
    { risk: 'medium' },
    { risk: undefined },
    { risk: 'strange' },
    null,
  ]

  const alert = deriveBacklogAlert({ tasks })
  assert.equal(alert.highRiskCount, 1)
})

test('积压时长：达到阈值或高风险即进入预警名单', () => {
  const alert = deriveBacklogAlert({ batches: sampleBatches })

  assert.equal(alert.maxBacklogDays, 21)
  assert.deepEqual(
    alert.alertedBatches.map((batch) => batch.code),
    ['A-03'],
  )

  const staleOnly = deriveBacklogAlert({
    batches: [{ code: 'X-01', risk: 'low', backlogDays: BACKLOG_ALERT_DAYS }],
  })
  assert.equal(staleOnly.alertCount, 1)
})

test('积压时长：非法积压天数按 0 处理', () => {
  assert.equal(normalizeBacklogDays(undefined), 0)
  assert.equal(normalizeBacklogDays('many'), 0)
  assert.equal(normalizeBacklogDays(-3), 0)
  assert.equal(normalizeBacklogDays('12'), 12)
})

test('容量归一化：只接受有限非负数值并取整', () => {
  assert.equal(normalizeCapacity(undefined), null)
  assert.equal(normalizeCapacity('6'), 6)
  assert.equal(normalizeCapacity(2.8), 2)
  assert.equal(normalizeCapacity(-1), null)
})

test('排序保留：派生列表顺序与输入一致', () => {
  const alert = deriveBacklogAlert({ batches: sampleBatches })

  assert.deepEqual(
    alert.pendingBatches.map((batch) => batch.code),
    ['A-03', 'B-11', 'C-02'],
  )
})

test('工作台提醒与档案页计数同源：真实数据下计数一致', () => {
  const alert = deriveBacklogAlert({
    batches: restorationBatches,
    tasks: restorationTasks,
    capacity: restorationCapacity.maxParallelBatches,
  })

  assert.equal(alert.pendingCount, restorationBatches.length)
  assert.equal(alert.backlogValue, `${restorationBatches.length} 册`)
  assert.equal(alert.overCapacity, false)
  assert.equal(alert.highRiskCount, 1)
})
