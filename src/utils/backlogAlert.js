// 待处理批次预警的统一派生口径。
// 积压时长、风险等级、容量判断全部收拢到本模块，
// 工作台提醒与批次档案页共用同一份结果，避免计数漂移。

// 风险等级口径：未知等级一律按低风险处理（与既有 riskMeta 行为一致）。
const RISK_LEVELS = ['high', 'medium', 'low']

const RISK_RANK = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
})

export function normalizeRisk(risk) {
  return RISK_LEVELS.includes(risk) ? risk : 'low'
}

export function riskRank(risk) {
  return RISK_RANK[normalizeRisk(risk)]
}

// 积压时长口径：积压达到该天数即计入预警名单。
export const BACKLOG_ALERT_DAYS = 14

export function normalizeBacklogDays(value) {
  const days = Number(value)
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0
}

// 容量判断口径：容量缺失（非数值、空串、负数等）时不做容量限制，
// 返回 null 表示“无容量信息”，调用方得到稳定结果。
export function normalizeCapacity(capacity) {
  if (typeof capacity !== 'number' && typeof capacity !== 'string') return null
  if (typeof capacity === 'string' && capacity.trim() === '') return null
  const value = Number(capacity)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

// 重复标记口径：同一 code 只保留首次出现，顺序稳定，计数不重复。
export function dedupeBatches(batches) {
  if (!Array.isArray(batches)) return []

  const seen = new Set()
  const result = []

  for (const batch of batches) {
    if (!batch || typeof batch !== 'object') continue
    const code = typeof batch.code === 'string' ? batch.code : null
    if (code !== null) {
      if (seen.has(code)) continue
      seen.add(code)
    }
    result.push(batch)
  }

  return result
}

// 待处理批次预警派生入口。
// 无数据、容量缺失、重复标记均返回稳定结构，不抛错。
export function deriveBacklogAlert({ batches, tasks, capacity } = {}) {
  const pendingBatches = dedupeBatches(batches)
  const pendingCount = pendingBatches.length

  const backlogDaysList = pendingBatches.map((batch) =>
    normalizeBacklogDays(batch.backlogDays),
  )
  const maxBacklogDays = backlogDaysList.reduce((max, days) => Math.max(max, days), 0)

  const alertedBatches = pendingBatches.filter(
    (batch, index) =>
      backlogDaysList[index] >= BACKLOG_ALERT_DAYS || normalizeRisk(batch.risk) === 'high',
  )

  const normalizedCapacity = normalizeCapacity(capacity)
  const overCapacity = normalizedCapacity !== null && pendingCount > normalizedCapacity

  const safeTasks = Array.isArray(tasks) ? tasks : []
  const highRiskCount = safeTasks.filter(
    (task) => task && normalizeRisk(task.risk) === 'high',
  ).length

  return {
    pendingBatches,
    pendingCount,
    backlogValue: `${pendingCount} 册`,
    alertedBatches,
    alertCount: alertedBatches.length,
    maxBacklogDays,
    capacity: normalizedCapacity,
    overCapacity,
    highRiskCount,
  }
}
