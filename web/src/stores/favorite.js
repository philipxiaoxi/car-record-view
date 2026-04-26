import { defineStore } from 'pinia'
import { favoriteApi } from '../api/favorite'

export const useFavoriteStore = defineStore('favorite', {
  state: () => ({
    list: [],
    favoriteTimestamps: [], // Use array instead of Set for serializability
    loaded: false,
  }),
  getters: {
    favoriteSet(state) {
      return new Set(state.favoriteTimestamps)
    },
    isFavorited: (state) => (timestamp) => {
      return state.favoriteTimestamps.includes(timestamp)
    },
  },
  actions: {
    async fetchFavorites() {
      const { data } = await favoriteApi.getList()
      this.list = data.list
      this.favoriteTimestamps = data.list.map(f => f.timestamp)
      this.loaded = true
    },
    async addFavorite(timestamp) {
      await favoriteApi.add(timestamp)
      await this.fetchFavorites()
    },
    async removeFavorite(timestamp) {
      await favoriteApi.remove(timestamp)
      this.favoriteTimestamps = this.favoriteTimestamps.filter(t => t !== timestamp)
      this.list = this.list.filter(f => f.timestamp !== timestamp)
    },
    async toggle(timestamp) {
      if (this.isFavorited(timestamp)) {
        await this.removeFavorite(timestamp)
      } else {
        await this.addFavorite(timestamp)
      }
    },
  },
})
