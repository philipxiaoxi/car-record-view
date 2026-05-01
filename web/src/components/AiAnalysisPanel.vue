<template>
  <v-card class="ai-analysis-panel">
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-brain</v-icon>
      AI 安全分析
      <v-spacer />
      <v-btn
        v-if="!hasTask"
        color="primary"
        :loading="creating"
        @click="startAnalysis"
      >
        <v-icon class="mr-1">mdi-play</v-icon>
        开始分析
      </v-btn>
      <v-btn
        v-else-if="task?.status === 'pending'"
        color="warning"
        size="small"
        @click="cancelAnalysis"
      >
        取消
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- 摄像头选择对话框 -->
      <v-dialog v-model="showCameraDialog" max-width="400">
        <v-card>
          <v-card-title>选择摄像头</v-card-title>
          <v-card-text>
            <v-btn
              v-if="video?.front"
              block
              class="mb-2"
              @click="createTask('front')"
            >
              前视摄像头
            </v-btn>
            <v-btn
              v-if="video?.rear"
              block
              @click="createTask('rear')"
            >
              后视摄像头
            </v-btn>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="showCameraDialog = false">取消</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- 任务状态 -->
      <div v-if="task" class="mb-4">
        <v-alert
          v-if="task.status === 'pending'"
          type="info"
          variant="tonal"
        >
          <v-progress-circular indeterminate size="16" class="mr-2" />
          任务排队中，请稍候...
        </v-alert>

        <v-alert
          v-else-if="task.status === 'processing'"
          type="info"
          variant="tonal"
        >
          <v-progress-circular indeterminate size="16" class="mr-2" />
          正在分析视频，请稍候...
        </v-alert>

        <v-alert
          v-else-if="task.status === 'failed'"
          type="error"
          variant="tonal"
        >
          分析失败: {{ task.error_message }}
        </v-alert>

        <v-alert
          v-else-if="task.status === 'completed' && task.result?.events"
          type="success"
          variant="tonal"
          class="mb-4"
        >
          分析完成，发现 {{ task.result.events?.length || 0 }} 个事件
        </v-alert>
      </div>

      <!-- 分析结果 -->
      <div v-if="task?.status === 'completed' && task.result" class="analysis-result">
        <!-- 风险概述 -->
        <div v-if="task.result.summary" class="mb-4">
          <div class="text-subtitle-1 font-weight-bold mb-2">风险概述</div>
          <p class="text-body-2">{{ task.result.summary }}</p>
          <v-chip
            :color="riskLevelColor"
            size="small"
            class="mt-2"
          >
            风险等级: {{ task.result.risk_level?.toUpperCase() || 'UNKNOWN' }}
          </v-chip>
        </div>

        <!-- 时间线列表 -->
        <div v-if="task.result.events?.length" class="events-timeline">
          <div class="text-subtitle-1 font-weight-bold mb-2">事件列表</div>
          <v-timeline density="compact" align="start">
            <v-timeline-item
              v-for="(event, index) in sortedEvents"
              :key="index"
              :dot-color="event.danger ? 'error' : 'success'"
              size="small"
            >
              <div class="d-flex align-center mb-1">
                <span class="text-caption text-grey mr-2">
                  {{ event.start_time }} - {{ event.end_time }}
                </span>
                <v-chip
                  :color="getRiskTypeColor(event.risk_type)"
                  size="x-small"
                >
                  {{ getRiskTypeLabel(event.risk_type) }}
                </v-chip>
                <v-chip
                  v-if="event.danger"
                  color="error"
                  size="x-small"
                  class="ml-1"
                >
                  危险
                </v-chip>
              </div>
              <div class="text-body-2">{{ event.event }}</div>
              <div v-if="event.description" class="text-caption text-grey">
                {{ event.description }}
              </div>
              <v-btn
                size="x-small"
                variant="text"
                class="mt-1"
                @click="$emit('seek', parseTimeToSeconds(event.start_time))"
              >
                <v-icon size="small" class="mr-1">mdi-play-circle</v-icon>
                跳转查看
              </v-btn>
            </v-timeline-item>
          </v-timeline>
        </div>

        <!-- 原始结果（调试用） -->
        <div v-if="task.result.raw" class="mt-4">
          <v-expansion-panels>
            <v-expansion-panel>
              <v-expansion-panel-title>原始响应</v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre class="text-caption">{{ task.result.raw }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { analysisApi } from '../api/analysis'

const props = defineProps({
  video: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['seek'])

const task = ref(null)
const creating = ref(false)
const showCameraDialog = ref(false)
const selectedCamera = ref('front')
let pollTimer = null

const hasTask = computed(() => {
  return task.value && ['pending', 'processing'].includes(task.value.status)
})

const sortedEvents = computed(() => {
  if (!task.value?.result?.events) return []
  return [...task.value.result.events].sort((a, b) => {
    return parseTimeToSeconds(a.start_time) - parseTimeToSeconds(b.start_time)
  })
})

const riskLevelColor = computed(() => {
  const level = task.value?.result?.risk_level
  if (level === 'high') return 'error'
  if (level === 'medium') return 'warning'
  return 'success'
})

function getRiskTypeColor(type) {
  const colors = {
    collision: 'error',
    distance: 'warning',
    lane: 'info',
    pedestrian: 'orange'
  }
  return colors[type] || 'grey'
}

function getRiskTypeLabel(type) {
  const labels = {
    collision: '碰撞风险',
    distance: '车距问题',
    lane: '车道偏离',
    pedestrian: '行人/障碍物'
  }
  return labels[type] || type
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return 0
}

async function startAnalysis() {
  if (props.video?.front && props.video?.rear) {
    showCameraDialog.value = true
  } else if (props.video?.front) {
    await createTask('front')
  } else if (props.video?.rear) {
    await createTask('rear')
  }
}

async function createTask(cameraType) {
  showCameraDialog.value = false
  creating.value = true
  selectedCamera.value = cameraType

  try {
    const response = await analysisApi.create(props.video.timestamp, cameraType)
    const result = response.data
    task.value = { ...result, status: result.status }
    if (result.status === 'pending' || result.status === 'processing') {
      startPolling()
    }
  } catch (err) {
    console.error('创建分析任务失败:', err)
  } finally {
    creating.value = false
  }
}

async function fetchTask() {
  if (!props.video?.timestamp) return

  try {
    const response = await analysisApi.getAll(props.video.timestamp)
    const tasks = response.data || []
    // 找到最新的非失败任务
    const validTask = tasks.find(t => t.status !== 'failed') || tasks[0]
    if (validTask) {
      task.value = validTask
      selectedCamera.value = validTask.camera_type

      if (validTask.status === 'pending' || validTask.status === 'processing') {
        startPolling()
      }
    }
  } catch (err) {
    console.error('获取分析任务失败:', err)
  }
}

async function pollTask() {
  if (!task.value || !props.video?.timestamp) return

  try {
    const response = await analysisApi.get(props.video.timestamp, selectedCamera.value)
    const updatedTask = response.data
    if (updatedTask) {
      task.value = updatedTask

      if (updatedTask.status !== 'pending' && updatedTask.status !== 'processing') {
        stopPolling()
      }
    }
  } catch (err) {
    console.error('轮询任务状态失败:', err)
  }
}

async function cancelAnalysis() {
  if (!props.video?.timestamp) return

  try {
    await analysisApi.cancel(props.video.timestamp, selectedCamera.value)
    task.value = null
    stopPolling()
  } catch (err) {
    console.error('取消任务失败:', err)
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(pollTask, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(() => props.video, (newVideo) => {
  if (newVideo?.timestamp) {
    fetchTask()
  }
}, { immediate: true })

onMounted(() => {
  if (props.video?.timestamp) {
    fetchTask()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.ai-analysis-panel {
  margin-top: 16px;
}
.events-timeline {
  max-height: 400px;
  overflow-y: auto;
}
</style>
