<template>
  <v-card>
    <v-card-title>
      <v-row align="center">
        <v-col>用户管理</v-col>
        <v-col class="text-right">
          <v-btn color="primary" @click="showAddDialog = true"><v-icon left>mdi-plus</v-icon>添加用户</v-btn>
        </v-col>
      </v-row>
    </v-card-title>

    <v-data-table :headers="headers" :items="users" :loading="loading">
      <template #item.role="{ item }">
        <v-chip :color="item.role === 'admin' ? 'primary' : 'default'" size="small">{{ item.role === 'admin' ? '管理员' : '用户' }}</v-chip>
      </template>
      <template #item.created_at="{ item }">{{ new Date(item.created_at).toLocaleString('zh-CN') }}</template>
      <template #item.actions="{ item }">
        <v-btn size="small" variant="text" @click="openResetDialog(item)">重置密码</v-btn>
        <v-btn size="small" variant="text" color="error" @click="openDeleteDialog(item)" :disabled="item.id === currentUserId">删除</v-btn>
      </template>
    </v-data-table>

    <v-dialog v-model="showAddDialog" max-width="400">
      <v-card>
        <v-card-title>添加用户</v-card-title>
        <v-card-text>
          <v-form ref="addForm">
            <v-text-field v-model="newUser.username" label="用户名" :rules="[v => !!v || '必填']" />
            <v-text-field v-model="newUser.password" label="密码" type="password" :rules="[v => !!v || '必填']" />
            <v-select v-model="newUser.role" :items="['user', 'admin']" label="角色" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showAddDialog = false">取消</v-btn>
          <v-btn color="primary" @click="addUser">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showResetDialog" max-width="400">
      <v-card>
        <v-card-title>重置密码</v-card-title>
        <v-card-text><v-text-field v-model="newPassword" label="新密码" type="password" :rules="[v => !!v || '必填']" /></v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showResetDialog = false">取消</v-btn>
          <v-btn color="primary" @click="resetPassword">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>确认删除</v-card-title>
        <v-card-text>确定要删除用户 "{{ userToDelete?.username }}" 吗？</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showDeleteDialog = false">取消</v-btn>
          <v-btn color="error" @click="deleteUser">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { adminApi } from '../api/admin'

const authStore = useAuthStore()
const headers = [
  { title: '用户名', key: 'username' },
  { title: '角色', key: 'role' },
  { title: '创建时间', key: 'created_at' },
  { title: '操作', key: 'actions', sortable: false },
]

const users = ref([])
const loading = ref(true)
const currentUserId = computed(() => authStore.user?.id)

const showAddDialog = ref(false)
const showResetDialog = ref(false)
const showDeleteDialog = ref(false)
const addForm = ref(null)

const newUser = ref({ username: '', password: '', role: 'user' })
const newPassword = ref('')
const userToReset = ref(null)
const userToDelete = ref(null)

const loadUsers = async () => {
  loading.value = true
  try {
    const { data } = await adminApi.getUsers()
    users.value = data.list
  } finally { loading.value = false }
}

const addUser = async () => {
  const { valid } = await addForm.value.validate()
  if (!valid) return
  try {
    await adminApi.addUser(newUser.value.username, newUser.value.password, newUser.value.role)
    showAddDialog.value = false
    newUser.value = { username: '', password: '', role: 'user' }
    loadUsers()
  } catch (err) { alert(err.response?.data?.error || '添加失败') }
}

const openResetDialog = (user) => { userToReset.value = user; newPassword.value = ''; showResetDialog.value = true }
const resetPassword = async () => {
  if (!newPassword.value) return
  try {
    await adminApi.resetPassword(userToReset.value.id, newPassword.value)
    showResetDialog.value = false
    alert('密码重置成功')
  } catch (err) { alert(err.response?.data?.error || '重置失败') }
}

const openDeleteDialog = (user) => { userToDelete.value = user; showDeleteDialog.value = true }
const deleteUser = async () => {
  try {
    await adminApi.deleteUser(userToDelete.value.id)
    showDeleteDialog.value = false
    loadUsers()
  } catch (err) { alert(err.response?.data?.error || '删除失败') }
}

onMounted(loadUsers)
</script>
