<template>
  <v-card>
    <v-card-title>视频转码</v-card-title>
    <v-card-text>
      <!-- 转码控制区域 -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-h6">转码任务</v-card-title>
        <v-card-text>
          <div v-if="transcodeStatus.status === 'idle' || transcodeStatus.status === 'completed'">
            <v-btn color="primary" @click="startTranscode" :loading="starting">开始转码</v-btn>
            <v-btn
              v-if="transcodeStatus.status === 'completed' && transcodeStatus.failedCount > 0"
              color="warning"
              variant="outlined"
              class="ml-2"
              @click="retryFailed"
              :loading="retrying"
            >重试失败文件</v-btn>
          </div>

          <div v-else>
            <!-- 进度条 -->
            <div class="mb-2">
              <span class="text-body-2">进度：{{ transcodeStatus.progress }}%</span>
              <v-progress-linear :model-value="transcodeStatus.progress" color="primary" class="mt-1" height="8" />
            </div>

            <!-- 详细信息 -->
            <div class="text-body-2 mb-2">
              {{ transcodeStatus.processedFiles }} / {{ transcodeStatus.totalFiles }} 个文件
            </div>
            <div class="text-body-2 mb-2">
              成功：{{ transcodeStatus.successCount }}  失败：{{ transcodeStatus.failedCount }}
            </div>
            <div class="text-body-2 mb-2" v-if="transcodeStatus.currentFile">
              当前：{{ transcodeStatus.currentFile }}
            </div>
            <div class="text-body-2 mb-2">
              已用时：{{ formatTime(transcodeStatus.elapsedSeconds) }}
            </div>

            <!-- 错误信息 -->
            <v-alert v-if="transcodeStatus.status === 'error'" type="error" density="compact" class="mb-2">
              {{ transcodeStatus.errorMessage }}
            </v-alert>

            <!-- 控制按钮 -->
            <div class="mt-3">
              <v-btn
                v-if="transcodeStatus.status === 'running'"
                color="warning"
                variant="outlined"
                @click="pauseTranscode"
                class="mr-2"
              >暂停</v-btn>
              <v-btn
                v-if="transcodeStatus.status === 'paused'"
                color="success"
                variant="outlined"
                @click="resumeTranscode"
                class="mr-2"
              >继续</v-btn>
              <v-btn
                v-if="transcodeStatus.status === 'running' || transcodeStatus.status === 'paused' || transcodeStatus.status === 'error'"
                color="error"
                variant="outlined"
                @click="stopTranscode"
              >停止</v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- 失败文件列表 -->
      <v-card variant="outlined" v-if="failedFiles.length > 0">
        <v-card-title class="text-h6 d-flex justify-space-between align-center">
          <span>失败文件</span>
          <v-btn color="warning" variant="outlined" size="small" @click="retryFailed" :loading="retrying">
            重试全部
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-list density="compact">
            <v-list-item v-for="file in failedFiles" :key="file.filename">
              <v-list-item-title>{{ file.filename }}</v-list-item-title>
              <v-list-item-subtitle class="text-error">{{ file.error_message }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { adminApi } from '../api/admin'

const transcodeStatus = ref({ status: 'idle' })
const failedFiles = ref([])
const starting = ref(false)
const retrying = ref(false)
let pollTimer = null

const loadTranscodeStatus = async () => {
  try {
    const { data } = await adminApi.getTranscodeStatus()
    transcodeStatus.value = data
  } catch (err) {
    console.error('Failed to load transcode status:', err)
  }
}

const loadFailedFiles = async () => {
  try {
    const { data } = await adminApi.getTranscodeErrors()
    failedFiles.value = data.list || []
  } catch (err) {
    console.error('Failed to load failed files:', err)
  }
}

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    loadTranscodeStatus()
    loadFailedFiles()
  }, 2000)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startTranscode = async () => {
  starting.value = true
  try {
    const { data } = await adminApi.startTranscode()
    transcodeStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '启动失败')
  } finally {
    starting.value = false
  }
}

const pauseTranscode = async () => {
  try {
    await adminApi.pauseTranscode()
    await loadTranscodeStatus()
  } catch (err) {
    alert(err.response?.data?.error || '暂停失败')
  }
}

const resumeTranscode = async () => {
  try {
    const { data } = await adminApi.resumeTranscode()
    transcodeStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '继续失败')
  }
}

const stopTranscode = async () => {
  try {
    await adminApi.stopTranscode()
    stopPolling()
    await loadTranscodeStatus()
  } catch (err) {
    alert(err.response?.data?.error || '停止失败')
  }
}

const retryFailed = async () => {
  retrying.value = true
  try {
    const { data } = await adminApi.retryTranscode()
    transcodeStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '重试失败')
  } finally {
    retrying.value = false
  }
}

const formatTime = (seconds) => {
  if (!seconds) return '0秒'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

onMounted(async () => {
  await loadTranscodeStatus()
  await loadFailedFiles()
  if (transcodeStatus.value.status === 'running') {
    startPolling()
  }
})

onUnmounted(stopPolling)
</script>
