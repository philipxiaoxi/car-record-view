<template>
  <v-card>
    <v-card-title>系统配置</v-card-title>
    <v-card-text>
      <!-- 扫描控制区域 -->
      <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-h6">视频扫描</v-card-title>
        <v-card-text>
          <div v-if="scanStatus.status === 'idle' || scanStatus.status === 'completed'">
            <v-btn color="primary" @click="startScan" :loading="starting">开始扫描</v-btn>
            <v-btn color="warning" variant="outlined" class="ml-2" @click="rescan" :loading="rescanning">重新扫描</v-btn>
          </div>

          <div v-else>
            <!-- 进度条 -->
            <div class="mb-2">
              <span class="text-body-2">进度：{{ scanStatus.progress }}%</span>
              <v-progress-linear :model-value="scanStatus.progress" color="primary" class="mt-1" height="8" />
            </div>

            <!-- 详细信息 -->
            <div class="text-body-2 mb-2">
              {{ scanStatus.processedFiles }} / {{ scanStatus.totalFiles }} 个文件
            </div>
            <div class="text-body-2 mb-2" v-if="scanStatus.currentFile">
              当前：{{ scanStatus.currentFile }}
            </div>
            <div class="text-body-2 mb-2">
              已用时：{{ formatTime(scanStatus.elapsedSeconds) }}
            </div>

            <!-- 错误信息 -->
            <v-alert v-if="scanStatus.status === 'error'" type="error" density="compact" class="mb-2">
              {{ scanStatus.errorMessage }}
            </v-alert>

            <!-- 控制按钮 -->
            <div class="mt-3">
              <v-btn
                v-if="scanStatus.status === 'running'"
                color="warning"
                variant="outlined"
                @click="pauseScan"
                class="mr-2"
              >暂停</v-btn>
              <v-btn
                v-if="scanStatus.status === 'paused'"
                color="success"
                variant="outlined"
                @click="resumeScan"
                class="mr-2"
              >继续</v-btn>
              <v-btn
                v-if="scanStatus.status === 'running' || scanStatus.status === 'paused' || scanStatus.status === 'error'"
                color="error"
                variant="outlined"
                @click="stopScan"
              >停止</v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- 配置表单 -->
      <v-form @submit.prevent="saveConfig">
        <v-text-field v-model="config.videoRootDir" label="视频根目录" outlined :rules="[v => !!v || '必填']" />
        <v-alert type="info" variant="tonal" class="mb-4">缓存大小：{{ config.cacheSize?.mb || 0 }} MB</v-alert>
        <v-btn color="error" variant="outlined" class="mr-2" @click="clearCache('all')">清理所有缓存</v-btn>
        <v-btn color="warning" variant="outlined" class="mr-2" @click="clearCache('mp4')">清理 MP4 缓存</v-btn>
        <v-btn color="info" variant="outlined" @click="clearCache('covers')">清理封面缓存</v-btn>
        <v-divider class="my-4" />
        <v-btn type="submit" color="primary" :loading="saving">保存配置</v-btn>
      </v-form>

      <!-- AI 配置 -->
      <v-card variant="outlined" class="mt-4">
        <v-card-title class="text-h6">AI 配置</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="aiConfig.ark_api_key"
            label="火山引擎 API Key"
            type="password"
            hint="在火山引擎控制台获取"
            persistent-hint
          />
          <v-text-field
            v-model="aiConfig.ark_model_id"
            label="模型 ID"
            hint="如: doubao-seed-2-0-lite-260215"
            persistent-hint
          />
          <v-text-field
            v-model="aiConfig.ark_base_url"
            label="API Base URL"
            hint="默认: https://ark.cn-beijing.volces.com/api/v3"
            persistent-hint
          />
          <v-btn color="primary" class="mt-4" @click="saveAiConfig" :loading="savingAi">
            保存 AI 配置
          </v-btn>
        </v-card-text>
      </v-card>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { adminApi } from '../api/admin'

const config = ref({ videoRootDir: '', cacheSize: { bytes: 0, mb: '0' } })
const saving = ref(false)
const scanStatus = ref({ status: 'idle' })
const starting = ref(false)
const rescanning = ref(false)
let pollTimer = null

const aiConfig = ref({
  ark_api_key: '',
  ark_model_id: '',
  ark_base_url: 'https://ark.cn-beijing.volces.com/api/v3'
})
const savingAi = ref(false)

const loadConfig = async () => {
  const { data } = await adminApi.getConfig()
  config.value = data
}

const loadAiConfig = async () => {
  try {
    const { data } = await adminApi.getAiConfig()
    aiConfig.value = { ...aiConfig.value, ...data }
  } catch (err) {
    console.error('加载 AI 配置失败:', err)
  }
}

const loadScanStatus = async () => {
  try {
    const { data } = await adminApi.getScanStatus()
    scanStatus.value = data
  } catch (err) {
    console.error('Failed to load scan status:', err)
  }
}

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(loadScanStatus, 2000)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startScan = async () => {
  starting.value = true
  try {
    const { data } = await adminApi.startScan()
    scanStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '启动失败')
  } finally {
    starting.value = false
  }
}

const pauseScan = async () => {
  try {
    await adminApi.pauseScan()
    await loadScanStatus()
  } catch (err) {
    alert(err.response?.data?.error || '暂停失败')
  }
}

const resumeScan = async () => {
  try {
    const { data } = await adminApi.resumeScan()
    scanStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '继续失败')
  }
}

const stopScan = async () => {
  try {
    await adminApi.stopScan()
    stopPolling()
    await loadScanStatus()
  } catch (err) {
    alert(err.response?.data?.error || '停止失败')
  }
}

const rescan = async () => {
  if (!confirm('重新扫描将清除所有现有数据，确定继续吗？')) return
  rescanning.value = true
  try {
    const { data } = await adminApi.rescan()
    scanStatus.value = data
    startPolling()
  } catch (err) {
    alert(err.response?.data?.error || '重新扫描失败')
  } finally {
    rescanning.value = false
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    await adminApi.updateConfig({ videoRootDir: config.value.videoRootDir })
    alert('配置保存成功')
  } catch (err) {
    alert(err.response?.data?.error || '保存失败')
  }
  finally { saving.value = false }
}

const saveAiConfig = async () => {
  savingAi.value = true
  try {
    await adminApi.updateAiConfig(aiConfig.value)
    alert('AI 配置已保存')
  } catch (err) {
    alert('保存失败: ' + (err.response?.data?.error || err.message))
  } finally {
    savingAi.value = false
  }
}

const clearCache = async (type) => {
  if (!confirm(`确定要清理${type === 'all' ? '所有' : type}缓存吗？`)) return
  try {
    await adminApi.clearCache(type)
    await loadConfig()
    alert('缓存清理成功')
  } catch (err) { alert(err.response?.data?.error || '清理失败') }
}

const formatTime = (seconds) => {
  if (!seconds) return '0秒'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

onMounted(async () => {
  await loadConfig()
  await loadScanStatus()
  await loadAiConfig()
  if (scanStatus.value.status === 'running') {
    startPolling()
  }
})

onUnmounted(stopPolling)
</script>
