<template>
  <v-card class="ai-analysis-panel">
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-brain</v-icon>
      AI 安全分析
      <v-spacer />
      <v-btn
        v-if="!isTaskRunning"
        color="primary"
        :loading="creating"
        @click="startAnalysis"
      >
        <v-icon class="mr-1">mdi-play</v-icon>
        开始分析
      </v-btn>
      <v-btn
        v-if="isTaskRunning && task?.status === 'pending'"
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
          <span class="ml-2 text-caption">(自动刷新中)</span>
        </v-alert>

        <v-alert
          v-else-if="task.status === 'processing'"
          type="info"
          variant="tonal"
        >
          <v-progress-circular indeterminate size="16" class="mr-2" />
          正在分析视频，请稍候...
          <span class="ml-2 text-caption">(自动刷新中)</span>
        </v-alert>

        <v-alert
          v-else-if="task.status === 'failed'"
          type="error"
          variant="tonal"
        >
          <div class="font-weight-bold mb-1">分析失败</div>
          <div class="text-caption">{{ task.error_message }}</div>
          <v-btn size="small" color="error" class="mt-2" @click="retryAnalysis">
            重新分析
          </v-btn>
        </v-alert>

        <v-alert
          v-else-if="task.status === 'completed'"
          type="success"
          variant="tonal"
        >
          分析完成
        </v-alert>
      </div>

      <!-- 分析结果 -->
      <div v-if="task?.status === 'completed' && parsedResult" class="analysis-result">
        <!-- 风险概述 -->
        <div v-if="parsedResult.summary" class="mb-4">
          <div class="text-subtitle-1 font-weight-bold mb-2">风险概述</div>
          <p class="text-body-2">{{ parsedResult.summary }}</p>
          <v-chip
            v-if="parsedResult.risk_level"
            :color="riskLevelColor"
            size="small"
            class="mt-2"
          >
            风险等级: {{ parsedResult.risk_level?.toUpperCase() || 'UNKNOWN' }}
          </v-chip>
        </div>

        <!-- 事件列表 -->
        <div v-if="parsedResult.events && parsedResult.events.length > 0" class="events-timeline">
          <div class="text-subtitle-1 font-weight-bold mb-2">
            检测到 {{ parsedResult.events.length }} 个事件
          </div>
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

        <!-- 无法解析的结果 -->
        <div v-if="!parsedResult.events && !parsedResult.summary && parsedResult.raw" class="mt-4">
          <v-expansion-panels>
            <v-expansion-panel>
              <v-expansion-panel-title>原始响应</v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre class="text-caption" style="white-space: pre-wrap; word-break: break-all;">{{ parsedResult.raw }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </div>

      <!-- 摄像头信息 -->
      <div v-if="task" class="mt-2 text-caption text-grey">
        摄像头: {{ task.camera_type === 'front' ? '前视' : '后视' }}
        <span v-if="task.created_at"> | 创建时间: {{ formatDateTime(task.created_at) }}</span>
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

const isTaskRunning = computed(() => {
  return task.value && ['pending', 'processing'].includes(task.value.status)
})

const parsedResult = computed(() => {
  if (!task.value?.result) return null

  // 如果 result 已经是对象
  if (typeof task.value.result === 'object') {
    return task.value.result
  }

  // 如果 result 是字符串，尝试解析
  if (typeof task.value.result === 'string') {
    try {
      return JSON.parse(task.value.result)
    } catch (e) {
      return { raw: task.value.result }
    }
  }

  return null
})

const sortedEvents = computed(() => {
  if (!parsedResult.value?.events) return []
  return [...parsedResult.value.events].sort((a, b) => {
    return parseTimeToSeconds(a.start_time) - parseTimeToSeconds(b.start_time)
  })
})

const riskLevelColor = computed(() => {
  const level = parsedResult.value?.risk_level
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

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
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
    await analysisApi.create(props.video.timestamp, cameraType)
    // 创建任务后立即获取完整任务数据
    await refreshTask()
  } catch (err) {
    console.error('创建分析任务失败:', err)
    alert('创建分析任务失败: ' + (err.response?.data?.error || err.message))
  } finally {
    creating.value = false
  }
}

async function refreshTask() {
  if (!props.video?.timestamp) return

  try {
    const response = await analysisApi.get(props.video.timestamp, selectedCamera.value)
    if (response.data) {
      task.value = response.data

      // 根据状态决定是否继续轮询
      if (task.value.status === 'pending' || task.value.status === 'processing') {
        startPolling()
      } else {
        stopPolling()
      }
    }
  } catch (err) {
    console.error('获取任务状态失败:', err)
  }
}

async function fetchExistingTask() {
  if (!props.video?.timestamp) return

  try {
    const response = await analysisApi.getAll(props.video.timestamp)
    const tasks = response.data || []

    // 找到最新的任务
    if (tasks.length > 0) {
      // 按创建时间排序，取最新的
      const latestTask = tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      task.value = latestTask
      selectedCamera.value = latestTask.camera_type

      if (latestTask.status === 'pending' || latestTask.status === 'processing') {
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

      // 任务完成或失败时停止轮询
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

async function retryAnalysis() {
  // 删除失败的任务后重新创建
  if (task.value?.camera_type) {
    selectedCamera.value = task.value.camera_type
    await createTask(task.value.camera_type)
  }
}

function startPolling() {
  stopPolling() // 先清除之前的定时器
  pollTimer = setInterval(pollTask, 2000) // 改为 2 秒轮询
  console.log('[AI分析] 开始轮询任务状态')
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    console.log('[AI分析] 停止轮询')
  }
}

watch(() => props.video, (newVideo) => {
  if (newVideo?.timestamp) {
    stopPolling()
    fetchExistingTask()
  }
}, { immediate: true })

onMounted(() => {
  if (props.video?.timestamp) {
    fetchExistingTask()
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
