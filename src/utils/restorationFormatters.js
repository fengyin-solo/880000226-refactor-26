import { normalizeRisk } from './backlogAlert.js'

const RISK_META = {
  high: {
    label: '高',
    tone: 'high',
  },
  medium: {
    label: '中',
    tone: 'medium',
  },
  low: {
    label: '低',
    tone: 'low',
  },
}

export function riskMeta(risk) {
  return RISK_META[normalizeRisk(risk)]
}
