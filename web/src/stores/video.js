import { defineStore } from 'pinia'
import { videoApi } from '../api/video'
import { historyApi } from '../api/history'

export const useVideoStore = defineStore('video', {
  state: () => ({
    videoList: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    currentVideo: null,
    history: [],
    scrollPosition: 0,
    listPage: 1,
  }),
  actions: {
    async fetchVideoList(page = 1) {
      const { data } = await videoApi.getList(page, 50)
      this.videoList = data.list
      this.pagination = data.pagination
      this.listPage = page
    },
    async fetchVideoDetail(timestamp) {
      const { data } = await videoApi.getDetail(timestamp)
      this.currentVideo = data
      return data
    },
    async fetchHistory() {
      const { data } = await historyApi.getList()
      this.history = data.list
    },
    async addHistory(timestamp) {
      await historyApi.add(timestamp)
    },
    saveScrollPosition(position) {
      this.scrollPosition = position
    },
  },
})
