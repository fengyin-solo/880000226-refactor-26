import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BACKLOG_DAY_THRESHOLDS,
  derivePendingBatchAlert,
  derivePendingBatches,
} from '../src/utils/pendingBatches.js'

const baseBatches = [
  {
    code: 'A-03',
    risk: 'high',
    backlogDays: BACKLOG_DAY_THRESHOLDS.high,
    volume: 5,
  },
  {
    code: 'B-11',
    risk: 'medium',
    backlogDays: BACKLOG_DAY_THRESHOLDS.medium + 1,
    volume: 4,
  },
  {
    code: 'C-02',
    risk: 'low',
    backlogDays: BACKLOG_DAY_THRESHOLDS.low,
    volume: 3,
  },
]

describe('derivePendingBatches', () => {
  it('returns an empty result without input data', () => {
    assert.deepEqual(derivePendingBatches(undefined), {
      pendingBatches: [],
      duplicateCount: 0,
    })
    assert.deepEqual(derivePendingBatches(null), {
      pendingBatches: [],
      duplicateCount: 0,
    })
    assert.deepEqual(derivePendingBatchAlert([]), {
      pendingBatches: [],
      duplicateCount: 0,
      count: 0,
      totalVolume: 0,
      backlogValue: '0 册',
      capacity: null,
      capacityStatus: 'unknown',
      capacityExceeded: false,
    })
  })

  it('applies the same threshold at every risk level', () => {
    const result = derivePendingBatches(baseBatches)

    assert.deepEqual(
      result.pendingBatches.map((item) => item.code),
      ['A-03', 'B-11', 'C-02'],
    )
    assert.deepEqual(
      result.pendingBatches.map((item) => item.backlogDays),
      [7, 15, 21],
    )
  })

  it('excludes records below their risk threshold', () => {
    const batches = [
      { code: 'high', risk: 'high', backlogDays: 6 },
      { code: 'medium', risk: 'medium', backlogDays: 13 },
      { code: 'low', risk: 'low', backlogDays: 20 },
    ]

    assert.deepEqual(derivePendingBatches(batches).pendingBatches, [])
  })

  it('keeps risk and backlog ordering stable', () => {
    const batches = [
      { code: 'B', risk: 'low', backlogDays: 30 },
      { code: 'A', risk: 'low', backlogDays: 30 },
      { code: 'medium-old', risk: 'medium', backlogDays: 20 },
      { code: 'medium-new', risk: 'medium', backlogDays: 15 },
      { code: 'high-new', risk: 'high', backlogDays: 8 },
    ]

    assert.deepEqual(
      derivePendingBatches(batches).pendingBatches.map((item) => item.code),
      ['high-new', 'medium-old', 'medium-new', 'A', 'B'],
    )
  })

  it('counts explicit duplicate markers and repeated keys once', () => {
    const batches = [
      baseBatches[0],
      { ...baseBatches[1], isDuplicate: true },
      { ...baseBatches[2], isDuplicated: true },
      baseBatches[0],
    ]

    const result = derivePendingBatches(batches)

    assert.deepEqual(
      result.pendingBatches.map((item) => item.code),
      ['A-03'],
    )
    assert.equal(result.duplicateCount, 3)
  })

  it('derives backlog duration deterministically from queuedAt and now', () => {
    const now = new Date('2026-09-25T00:00:00.000Z')
    const batches = [
      {
        code: 'D-01',
        risk: 'high',
        queuedAt: '2026-09-18T00:00:00.000Z',
      },
    ]

    const result = derivePendingBatches(batches, { now })
    assert.equal(result.pendingBatches[0].backlogDays, 7)
  })
})

describe('derivePendingBatchAlert', () => {
  it('uses one aggregate for reminder value and archive count', () => {
    const alert = derivePendingBatchAlert(baseBatches, { capacity: 12 })

    assert.equal(alert.count, 3)
    assert.equal(alert.totalVolume, 12)
    assert.equal(alert.backlogValue, '12 册')
    assert.equal(alert.capacityStatus, 'ok')
  })

  it('marks exceeded capacity using the same aggregate', () => {
    const alert = derivePendingBatchAlert(baseBatches, {
      capacity: { total: 11 },
    })

    assert.equal(alert.capacity, 11)
    assert.equal(alert.capacityStatus, 'exceeded')
    assert.equal(alert.capacityExceeded, true)
  })

  it('keeps capacity judgement stable when capacity is missing', () => {
    const alert = derivePendingBatchAlert(baseBatches)

    assert.equal(alert.count, 3)
    assert.equal(alert.capacity, null)
    assert.equal(alert.capacityStatus, 'unknown')
    assert.equal(alert.capacityExceeded, false)
  })

  it('does not let malformed volume values produce non-numeric totals', () => {
    const batches = [{ ...baseBatches[0], volume: 'not-a-number' }]
    const alert = derivePendingBatchAlert(batches, { capacity: 12 })

    assert.equal(alert.totalVolume, 0)
    assert.equal(alert.backlogValue, '0 册')
  })
})
