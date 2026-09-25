import { computed } from 'vue'

import {
  restorationBatches,
  restorationEnvironment,
  restorationHero,
  restorationTasks,
} from '../data/restorationData'
import { derivePendingBatchAlert } from '../utils/pendingBatches'

const pendingBatchAlert = computed(() =>
  derivePendingBatchAlert(restorationBatches, {
    capacity: restorationHero.capacity,
  }),
)
const pendingBatches = computed(() =>
  pendingBatchAlert.value.pendingBatches.map((item) => item.batch),
)

export function useRestorationOverview() {
  const batchCount = computed(() => restorationBatches.length)
  const highRiskCount = computed(
    () => restorationTasks.filter((item) => item.risk === 'high').length,
  )
  const environmentCount = computed(() => restorationEnvironment.length)
  const ownerCount = computed(() => new Set(restorationTasks.map((item) => item.owner)).size)

  return {
    batchCount,
    highRiskCount,
    environmentCount,
    ownerCount,
    pendingBatchAlert,
    pendingBatches,
  }
}
