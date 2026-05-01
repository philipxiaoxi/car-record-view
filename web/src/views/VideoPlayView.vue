<template>
  <v-layout>
    <v-app-bar app color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>{{ pageTitle }}</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <v-skeleton-loader v-if="loading" type="card" class="mb-4" />
        <template v-else-if="video">
          <div :class="['video-container', isMobile ? 'mobile' : 'desktop']">
            <div class="video-wrapper" v-if="video.front">
              <video ref="frontVideo" :src="`/api/videos/${video.front.filename}/stream`" class="video-element" playsinline @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate" @play="onPlay('front')" @pause="onPause('front')" />
              <div class="video-label">前视</div>
            </div>
            <div class="video-wrapper" v-if="video.rear">
              <video ref="rearVideo" :src="`/api/videos/${video.rear.filename}/stream`" class="video-element" playsinline @play="onPlay('rear')" @pause="onPause('rear')" />
              <div class="video-label">后视</div>
            </div>
          </div>

          <v-card class="controls-card mt-2">
            <v-slider v-model="progress" :max="duration" :min="0" class="mx-4" thumb-label @update:modelValue="seekTo" />
            <v-row align="center" class="px-4 pb-2">
              <v-btn icon @click="togglePlay"><v-icon>{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon></v-btn>
              <span class="text-caption ml-2">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
              <v-spacer />
              <v-btn icon @click="favoriteStore.toggle(video.timestamp)">
                <v-icon :color="favoriteStore.isFavorited(video.timestamp) ? 'red' : undefined">
                  {{ favoriteStore.isFavorited(video.timestamp) ? 'mdi-heart' : 'mdi-heart-outline' }}
                </v-icon>
              </v-btn>
              <v-btn icon @click="showAiPanel = !showAiPanel">
                <v-icon>mdi-brain</v-icon>
              </v-btn>
              <v-select v-model="playbackSpeed" :items="[0.5, 1, 1.5, 2, 4]" density="compact" hide-details class="speed-select" @update:modelValue="changeSpeed" />
              <v-btn icon :disabled="!video.prev" @click="goToVideo(video.prev)"><v-icon>mdi-skip-previous</v-icon></v-btn>
              <v-btn icon :disabled="!video.next" @click="goToVideo(video.next)"><v-icon>mdi-skip-next</v-icon></v-btn>
            </v-row>
          </v-card>

          <AiAnalysisPanel
            v-if="showAiPanel"
            :video="video"
            @seek="seekTo"
          />
        </template>
        <v-alert v-else type="error">视频不存在或加载失败</v-alert>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVideoStore } from '../stores/video'
import { useFavoriteStore } from '../stores/favorite'
import AiAnalysisPanel from '../components/AiAnalysisPanel.vue'

const route = useRoute()
const router = useRouter()
const videoStore = useVideoStore()
const favoriteStore = useFavoriteStore()

const frontVideo = ref(null)
const rearVideo = ref(null)
const loading = ref(true)
const video = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const progress = ref(0)
const playbackSpeed = ref(1)
const showAiPanel = ref(false)

const timestamp = computed(() => decodeURIComponent(route.params.timestamp))
const isMobile = computed(() => window.innerWidth < 768)

const pageTitle = computed(() => {
  if (!video.value) return '视频播放'
  const d = new Date(video.value.timestamp)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const togglePlay = () => {
  if (!frontVideo.value) return
  if (isPlaying.value) { frontVideo.value.pause(); rearVideo.value?.pause() }
  else { frontVideo.value.play(); rearVideo.value?.play() }
  isPlaying.value = !isPlaying.value
}

const seekTo = (time) => {
  if (!frontVideo.value) return
  frontVideo.value.currentTime = time
  if (rearVideo.value) rearVideo.value.currentTime = time
  currentTime.value = time
}

const changeSpeed = (speed) => {
  if (frontVideo.value) frontVideo.value.playbackRate = speed
  if (rearVideo.value) rearVideo.value.playbackRate = speed
}

const onLoadedMetadata = () => { if (frontVideo.value) duration.value = frontVideo.value.duration }
const onTimeUpdate = () => { if (frontVideo.value) { currentTime.value = frontVideo.value.currentTime; progress.value = frontVideo.value.currentTime } }
const onPlay = (source) => { isPlaying.value = true }
const onPause = (source) => { isPlaying.value = false }

const goBack = () => router.push('/')
const goToVideo = (ts) => router.push(`/play/${encodeURIComponent(ts)}`)

const loadVideo = async () => {
  loading.value = true
  try {
    video.value = await videoStore.fetchVideoDetail(timestamp.value)
    await videoStore.addHistory(timestamp.value)
  } catch (err) { console.error('Failed to load video:', err) }
  finally { loading.value = false }
}

onMounted(loadVideo)
watch(() => route.params.timestamp, loadVideo)
</script>

<style scoped>
.video-container { display: flex; gap: 8px; width: 100%; }
.video-container.desktop { flex-direction: row; }
.video-container.mobile { flex-direction: column; }
.video-wrapper { position: relative; flex: 1; background: #000; border-radius: 8px; overflow: hidden; }
.video-element { width: 100%; height: 100%; object-fit: contain; }
.video-label { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.controls-card { border-radius: 8px; }
.speed-select { max-width: 80px; margin-right: 16px; }
</style>
