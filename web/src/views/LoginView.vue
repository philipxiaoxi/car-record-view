<template>
  <v-container fluid class="login-container fill-height">
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="login-card">
          <v-card-title class="text-h5 text-center py-4">信界后视镜视频播放器</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="handleLogin" ref="form">
              <v-text-field v-model="username" label="用户名" prepend-icon="mdi-account" :rules="[v => !!v || '请输入用户名']" outlined dense />
              <v-text-field v-model="password" label="密码" prepend-icon="mdi-lock" type="password" :rules="[v => !!v || '请输入密码']" outlined dense />
              <v-alert v-if="error" type="error" dense text class="mb-4">{{ error }}</v-alert>
              <v-btn type="submit" color="primary" block large :loading="loading">登录</v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const form = ref(null)

const handleLogin = async () => {
  error.value = ''
  const { valid } = await form.value.validate()
  if (!valid) return
  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    router.push(route.query.redirect || '/')
  } catch (err) {
    error.value = err.response?.data?.error || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; }
.login-card { border-radius: 16px; }
</style>
