import { computed } from 'vue'

import {
  restorationBatches,
  restorationCapacity,
  restorationEnvironment,
  restorationTasks,
} from '../data/restorationData'
import { deriveBacklogAlert } from '../utils/backlogAlert.js'

export function useRestorationOverview() {
  const backlogAlert = computed(() =>
    deriveBacklogAlert({
      batches: restorationBatches,
      tasks: restorationTasks,
      capacity: restorationCapacity.maxParallelBatches,
    }),
  )

  const pendingBatches = computed(() => backlogAlert.value.pendingBatches)
  const batchCount = computed(() => backlogAlert.value.pendingCount)
  const backlogValue = computed(() => backlogAlert.value.backlogValue)
  const highRiskCount = computed(() => backlogAlert.value.highRiskCount)
  const environmentCount = computed(() => restorationEnvironment.length)
  const ownerCount = computed(() => new Set(restorationTasks.map((item) => item.owner)).size)

  return {
    backlogAlert,
    pendingBatches,
    batchCount,
    backlogValue,
    highRiskCount,
    environmentCount,
    ownerCount,
  }
}
