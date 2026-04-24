<template>
  <v-card>
    <v-card-title>系统配置</v-card-title>
    <v-card-text>
      <v-form @submit.prevent="saveConfig">
        <v-text-field v-model="config.videoRootDir" label="视频根目录" outlined :rules="[v => !!v || '必填']" />
        <v-alert type="info" variant="tonal" class="mb-4">缓存大小：{{ config.cacheSize?.mb || 0 }} MB</v-alert>
        <v-btn color="error" variant="outlined" class="mr-2" @click="clearCache('all')">清理所有缓存</v-btn>
        <v-btn color="warning" variant="outlined" class="mr-2" @click="clearCache('mp4')">清理 MP4 缓存</v-btn>
        <v-btn color="info" variant="outlined" @click="clearCache('covers')">清理封面缓存</v-btn>
        <v-divider class="my-4" />
        <v-btn type="submit" color="primary" :loading="saving">保存配置</v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '../api/admin'

const config = ref({ videoRootDir: '', cacheSize: { bytes: 0, mb: '0' } })
const saving = ref(false)

const loadConfig = async () => {
  const { data } = await adminApi.getConfig()
  config.value = data
}

const saveConfig = async () => {
  saving.value = true
  try {
    await adminApi.updateConfig({ videoRootDir: config.value.videoRootDir })
    alert('配置保存成功')
  } catch (err) { alert(err.response?.data?.error || '保存失败') }
  finally { saving.value = false }
}

const clearCache = async (type) => {
  if (!confirm(`确定要清理${type === 'all' ? '所有' : type}缓存吗？`)) return
  try {
    await adminApi.clearCache(type)
    await loadConfig()
    alert('缓存清理成功')
  } catch (err) { alert(err.response?.data?.error || '清理失败') }
}

onMounted(loadConfig)
</script>
