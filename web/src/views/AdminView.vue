<template>
  <v-layout>
    <v-navigation-drawer v-model="drawer" app>
      <v-list>
        <v-list-item to="/admin/users" prepend-icon="mdi-account-group"><v-list-item-title>用户管理</v-list-item-title></v-list-item>
        <v-list-item to="/admin/config" prepend-icon="mdi-cog"><v-list-item-title>系统配置</v-list-item-title></v-list-item>
        <v-list-item to="/admin/transcode" prepend-icon="mdi-video-outline"><v-list-item-title>视频转码</v-list-item-title></v-list-item>
        <v-divider class="my-2" />
        <v-list-item to="/" prepend-icon="mdi-video"><v-list-item-title>返回首页</v-list-item-title></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app color="primary" dark>
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-toolbar-title>管理后台</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup>
import { ref } from 'vue'
const drawer = ref(true)
</script>
