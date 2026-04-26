import { defineStore } from 'pinia'
import { favoriteApi } from '../api/favorite'

export const useFavoriteStore = defineStore('favorite', {
  state: () => ({
    list: [],
    favoriteSet: new Set(),
    loaded: false,
  }),
  actions: {
    async fetchFavorites() {
      const { data } = await favoriteApi.getList()
      this.list = data.list
      this.favoriteSet = new Set(data.list.map(f => f.timestamp))
      this.loaded = true
    },
    async addFavorite(timestamp) {
      await favoriteApi.add(timestamp)
      this.favoriteSet.add(timestamp)
      await this.fetchFavorites()
    },
    async removeFavorite(timestamp) {
      await favoriteApi.remove(timestamp)
      this.favoriteSet.delete(timestamp)
      this.list = this.list.filter(f => f.timestamp !== timestamp)
    },
    async toggle(timestamp) {
      if (this.favoriteSet.has(timestamp)) {
        await this.removeFavorite(timestamp)
      } else {
        await this.addFavorite(timestamp)
      }
    },
    isFavorited(timestamp) {
      return this.favoriteSet.has(timestamp)
    },
  },
})
