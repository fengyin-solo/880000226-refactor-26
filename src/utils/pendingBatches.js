export const RISK_ORDER = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
})

export const BACKLOG_DAY_THRESHOLDS = Object.freeze({
  high: 7,
  medium: 14,
  low: 21,
})

const DAY_IN_MS = 24 * 60 * 60 * 1000

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeRiskLevel(risk) {
  return Object.hasOwn(RISK_ORDER, risk) ? risk : null
}

function getBatchKey(batch, index) {
  return String(batch.code ?? batch.id ?? `__batch_${index}`)
}

function isMarkedDuplicate(batch) {
  return batch.isDuplicate === true
    || batch.isDuplicated === true
    || batch.duplicate === true
}

function getBacklogDays(batch, now) {
  if (Number.isFinite(batch.backlogDays)) {
    return Math.max(0, batch.backlogDays)
  }

  if (!batch.queuedAt) {
    return 0
  }

  const queuedAt = new Date(batch.queuedAt).getTime()
  const referenceTime = now instanceof Date ? now.getTime() : toFiniteNumber(now, Date.now())

  if (!Number.isFinite(queuedAt) || !Number.isFinite(referenceTime)) {
    return 0
  }

  return Math.max(0, Math.floor((referenceTime - queuedAt) / DAY_IN_MS))
}

function normalizeCapacity(capacity) {
  if (Number.isFinite(capacity)) {
    return capacity
  }

  if (capacity && typeof capacity === 'object') {
    const total = capacity.total ?? capacity.limit ?? capacity.value
    const normalizedTotal = Number(total)
    return Number.isFinite(normalizedTotal) ? normalizedTotal : null
  }

  return null
}

function comparePendingBatches(left, right) {
  const riskDifference = RISK_ORDER[left.risk] - RISK_ORDER[right.risk]
  if (riskDifference !== 0) {
    return riskDifference
  }

  if (left.backlogDays !== right.backlogDays) {
    return right.backlogDays - left.backlogDays
  }

  if (left.key === right.key) {
    return 0
  }

  return left.key < right.key ? -1 : 1
}

export function derivePendingBatches(batches, options = {}) {
  const thresholds = {
    ...BACKLOG_DAY_THRESHOLDS,
    ...options.backlogThresholds,
  }
  const seenKeys = new Set()
  const pendingBatches = []
  let duplicateCount = 0

  if (!Array.isArray(batches)) {
    return { pendingBatches: [], duplicateCount: 0 }
  }

  batches.forEach((batch, index) => {
    if (!batch || typeof batch !== 'object') {
      return
    }

    const key = getBatchKey(batch, index)

    if (isMarkedDuplicate(batch)) {
      duplicateCount += 1
      return
    }

    if (seenKeys.has(key)) {
      duplicateCount += 1
      return
    }
    seenKeys.add(key)

    const risk = normalizeRiskLevel(batch.risk)
    if (!risk) {
      return
    }

    const threshold = Number(thresholds[risk])
    const backlogDays = getBacklogDays(batch, options.now)
    if (!Number.isFinite(threshold) || backlogDays < threshold) {
      return
    }

    pendingBatches.push({
      key: String(key),
      code: batch.code ? String(batch.code) : null,
      risk,
      backlogDays,
      volume: Math.max(0, toFiniteNumber(batch.volume, 0)),
      batch,
    })
  })

  return {
    pendingBatches: pendingBatches.sort(comparePendingBatches),
    duplicateCount,
  }
}

export function derivePendingBatchAlert(batches, options = {}) {
  const { pendingBatches, duplicateCount } = derivePendingBatches(batches, options)
  const totalVolume = pendingBatches.reduce(
    (total, item) => total + item.volume,
    0,
  )
  const capacity = normalizeCapacity(options.capacity)
  const capacityStatus = capacity === null
    ? 'unknown'
    : totalVolume > capacity
      ? 'exceeded'
      : 'ok'

  return {
    pendingBatches,
    duplicateCount,
    count: pendingBatches.length,
    totalVolume,
    backlogValue: `${totalVolume} 册`,
    capacity,
    capacityStatus,
    capacityExceeded: capacityStatus === 'exceeded',
  }
}
