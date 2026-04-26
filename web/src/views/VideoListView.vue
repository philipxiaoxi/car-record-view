<template>
  <v-layout>
    <v-app-bar app color="primary" dark>
      <v-toolbar-title>信界后视镜视频</v-toolbar-title>
      <v-spacer />
      <v-menu v-if="authStore.isLoggedIn" offset-y>
        <template #activator="{ props }">
          <v-btn icon v-bind="props"><v-icon>mdi-account-circle</v-icon></v-btn>
        </template>
        <v-list>
          <v-list-item disabled><v-list-item-title>{{ authStore.user?.username }}</v-list-item-title></v-list-item>
          <v-divider />
          <v-list-item v-if="authStore.isAdmin" to="/admin"><v-list-item-title><v-icon small class="mr-2">mdi-cog</v-icon>管理后台</v-list-item-title></v-list-item>
          <v-list-item @click="handleLogout"><v-list-item-title><v-icon small class="mr-2">mdi-logout</v-icon>退出登录</v-list-item-title></v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <v-tabs v-model="activeTab" class="mb-4">
          <v-tab value="all">全部视频</v-tab>
          <v-tab value="history">播放历史</v-tab>
          <v-tab value="favorites">我的收藏</v-tab>
        </v-tabs>

        <v-window v-model="activeTab">
          <v-window-item value="all">
            <v-row>
              <v-col v-for="video in videoStore.videoList" :key="video.timestamp" cols="12" sm="6" md="4" lg="3" xl="2">
                <v-card hover @click="playVideo(video)" class="video-card">
                  <v-img :src="video.front || video.rear ? `/api/videos/${video.front || video.rear}/cover` : ''" aspect-ratio="16/9" cover>
                    <div class="favorite-btn" @click.stop="favoriteStore.toggle(video.timestamp)">
                      <v-icon size="small" :color="favoriteStore.isFavorited(video.timestamp) ? 'red' : 'white'">
                        {{ favoriteStore.isFavorited(video.timestamp) ? 'mdi-heart' : 'mdi-heart-outline' }}
                      </v-icon>
                    </div>
                    <div class="video-badge" v-if="video.front && video.rear"><v-chip size="x-small" color="success">前后视</v-chip></div>
                  </v-img>
                  <v-card-text class="pa-2">
                    <div class="text-subtitle-2 text-truncate">{{ formatTime(video.timestamp) }}</div>
                    <div class="text-caption text-grey" v-if="video.duration">{{ Math.floor(video.duration / 60) }}:{{ (video.duration % 60).toString().padStart(2, '0') }}</div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
            <div class="text-center mt-4" v-if="videoStore.pagination.totalPages > 1">
              <v-pagination v-model="currentPage" :length="videoStore.pagination.totalPages" :total-visible="7" @update:modelValue="loadPage" />
            </div>
          </v-window-item>

          <v-window-item value="history">
            <v-row v-if="videoStore.history.length > 0">
              <v-col v-for="video in videoStore.history" :key="video.timestamp" cols="12" sm="6" md="4" lg="3" xl="2">
                <v-card hover @click="playVideo(video)" class="video-card">
                  <v-img :src="video.front || video.rear ? `/api/videos/${video.front || video.rear}/cover` : ''" aspect-ratio="16/9" cover>
                    <div class="favorite-btn" @click.stop="favoriteStore.toggle(video.timestamp)">
                      <v-icon size="small" :color="favoriteStore.isFavorited(video.timestamp) ? 'red' : 'white'">
                        {{ favoriteStore.isFavorited(video.timestamp) ? 'mdi-heart' : 'mdi-heart-outline' }}
                      </v-icon>
                    </div>
                  </v-img>
                  <v-card-text class="pa-2">
                    <div class="text-subtitle-2 text-truncate">{{ formatTime(video.timestamp) }}</div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
            <v-empty-state v-else title="暂无播放历史" icon="mdi-history" />
          </v-window-item>

          <v-window-item value="favorites">
            <v-row v-if="favoriteStore.list.length > 0">
              <v-col v-for="video in favoriteStore.list" :key="video.timestamp" cols="12" sm="6" md="4" lg="3" xl="2">
                <v-card hover @click="playVideo(video)" class="video-card">
                  <v-img :src="video.front || video.rear ? `/api/videos/${video.front || video.rear}/cover` : ''" aspect-ratio="16/9" cover>
                    <div class="favorite-btn" @click.stop="favoriteStore.toggle(video.timestamp)">
                      <v-icon size="small" :color="favoriteStore.isFavorited(video.timestamp) ? 'red' : 'white'">
                        {{ favoriteStore.isFavorited(video.timestamp) ? 'mdi-heart' : 'mdi-heart-outline' }}
                      </v-icon>
                    </div>
                    <div class="video-badge" v-if="video.front && video.rear"><v-chip size="x-small" color="success">前后视</v-chip></div>
                  </v-img>
                  <v-card-text class="pa-2">
                    <div class="text-subtitle-2 text-truncate">{{ formatTime(video.timestamp) }}</div>
                    <div class="text-caption text-grey" v-if="video.duration">{{ Math.floor(video.duration / 60) }}:{{ (video.duration % 60).toString().padStart(2, '0') }}</div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
            <v-empty-state v-else title="暂无收藏" icon="mdi-heart-outline" />
          </v-window-item>
        </v-window>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useVideoStore } from '../stores/video'
import { useAuthStore } from '../stores/auth'
import { useFavoriteStore } from '../stores/favorite'

const router = useRouter()
const videoStore = useVideoStore()
const authStore = useAuthStore()
const favoriteStore = useFavoriteStore()

const activeTab = ref('all')
const currentPage = ref(1)

const formatTime = (ts) => {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const loadPage = async (page) => {
  await videoStore.fetchVideoList(page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const playVideo = (video) => {
  videoStore.saveScrollPosition(window.scrollY)
  router.push(`/play/${encodeURIComponent(video.timestamp)}`)
}

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

onMounted(async () => {
  await videoStore.fetchVideoList(videoStore.listPage)
  await videoStore.fetchHistory()
  await favoriteStore.fetchFavorites()
  await nextTick()
  if (videoStore.scrollPosition > 0) window.scrollTo({ top: videoStore.scrollPosition, behavior: 'instant' })
  currentPage.value = videoStore.listPage
})
</script>

<style scoped>
.video-card { cursor: pointer; transition: transform 0.2s; }
.video-card:hover { transform: translateY(-4px); }
.video-badge { position: absolute; top: 8px; right: 8px; }
.favorite-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s;
}
.favorite-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}
</style>
