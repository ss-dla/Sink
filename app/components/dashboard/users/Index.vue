<script setup lang="ts">
import type { UserRole } from '@/types'
import { toast } from 'vue-sonner'

interface UserRow {
  email: string
  role: UserRole
  disabled: boolean
  createdAt: number
  createdBy: string
}

const { t } = useI18n()
const { userEmail } = useAuthSession()

const rows = shallowRef<UserRow[]>([])
const loading = shallowRef(true)
const busy = shallowRef(false)
const email = shallowRef('')
const role = shallowRef<UserRole>('editor')

async function load() {
  try {
    rows.value = (await useAPI<{ users: UserRow[] }>('/api/users')).users
  }
  catch {
    toast.error(t('users.load_failed'))
  }
  finally {
    loading.value = false
  }
}

async function add() {
  if (busy.value || !email.value.trim())
    return
  busy.value = true
  try {
    await useAPI('/api/users', { method: 'POST', body: { email: email.value, role: role.value } })
    toast.success(t('users.add_success'))
    email.value = ''
    await load()
  }
  catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 0
    toast.error(t(status === 409 ? 'users.exists' : 'users.add_failed'))
  }
  finally {
    busy.value = false
  }
}

async function update(user: UserRow, change: { role?: UserRole, disabled?: boolean }) {
  if (busy.value)
    return
  busy.value = true
  try {
    await useAPI('/api/users', { method: 'PATCH', body: { email: user.email, ...change } })
    await load()
  }
  catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 0
    toast.error(t(status === 409 ? 'users.self_change' : 'users.update_failed'))
    await load()
  }
  finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="add">
      <div class="grid min-w-64 flex-1 gap-2">
        <Label for="user-email">{{ $t('users.email_label') }}</Label>
        <Input
          id="user-email"
          v-model="email"
          type="email"
          autocomplete="off"
          :placeholder="$t('users.email_placeholder')"
          :disabled="busy"
        />
      </div>
      <div class="grid gap-2">
        <Label for="user-role">{{ $t('users.role_label') }}</Label>
        <NativeSelect id="user-role" v-model="role" :disabled="busy">
          <NativeSelectOption value="editor">
            {{ $t('users.role_editor') }}
          </NativeSelectOption>
          <NativeSelectOption value="admin">
            {{ $t('users.role_admin') }}
          </NativeSelectOption>
        </NativeSelect>
      </div>
      <Button type="submit" :disabled="busy || !email.trim()">
        {{ $t('users.add') }}
      </Button>
    </form>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('users.columns.email') }}</TableHead>
          <TableHead>{{ $t('users.columns.role') }}</TableHead>
          <TableHead>{{ $t('users.columns.status') }}</TableHead>
          <TableHead>{{ $t('users.columns.added') }}</TableHead>
          <TableHead class="text-right">
            <span class="sr-only">{{ $t('users.columns.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="user in rows" :key="user.email">
          <TableCell class="font-medium">
            {{ user.email }}
          </TableCell>
          <TableCell>
            <NativeSelect
              :model-value="user.role"
              :aria-label="$t('users.role_label')"
              :disabled="busy || user.email === userEmail"
              @change="update(user, { role: ($event.target as HTMLSelectElement).value as UserRole })"
            >
              <NativeSelectOption value="editor">
                {{ $t('users.role_editor') }}
              </NativeSelectOption>
              <NativeSelectOption value="admin">
                {{ $t('users.role_admin') }}
              </NativeSelectOption>
            </NativeSelect>
          </TableCell>
          <TableCell>
            <Badge :variant="user.disabled ? 'destructive' : 'secondary'">
              {{ $t(user.disabled ? 'users.status_disabled' : 'users.status_active') }}
            </Badge>
          </TableCell>
          <TableCell class="text-muted-foreground">
            {{ new Date(user.createdAt * 1000).toLocaleDateString() }} · {{ user.createdBy }}
          </TableCell>
          <TableCell class="text-right">
            <Button
              variant="outline"
              size="sm"
              :disabled="busy || user.email === userEmail"
              @click="update(user, { disabled: !user.disabled })"
            >
              {{ $t(user.disabled ? 'users.enable' : 'users.disable') }}
            </Button>
          </TableCell>
        </TableRow>
        <TableEmpty v-if="!loading && rows.length === 0" :colspan="5">
          {{ $t('users.empty') }}
        </TableEmpty>
      </TableBody>
    </Table>
  </div>
</template>
