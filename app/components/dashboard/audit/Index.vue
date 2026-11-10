<script setup lang="ts">
import { toast } from 'vue-sonner'

interface AuditItem {
  id: number
  at: number
  actorEmail: string
  actorRole: string
  action: string
  slug: string | null
  detail: unknown
}

interface AuditPage {
  items: AuditItem[]
  nextBefore: number | null
}

const { t, te } = useI18n()

const items = shallowRef<AuditItem[]>([])
const nextBefore = shallowRef<number | null>(null)
const loading = shallowRef(true)
const slugFilter = shallowRef('')
const actorFilter = shallowRef('')

async function load(append = false) {
  loading.value = true
  try {
    const query = new URLSearchParams({ limit: '50' })
    if (append && nextBefore.value)
      query.set('before', String(nextBefore.value))
    if (slugFilter.value.trim())
      query.set('slug', slugFilter.value.trim())
    if (actorFilter.value.trim())
      query.set('actor', actorFilter.value.trim())

    const page = await useAPI<AuditPage>(`/api/audit?${query}`)
    items.value = append ? [...items.value, ...page.items] : page.items
    nextBefore.value = page.nextBefore
  }
  catch {
    toast.error(t('audit.load_failed'))
  }
  finally {
    loading.value = false
  }
}

function actionLabel(action: string) {
  const key = `audit.actions.${action.replace('.', '_')}`
  return te(key) ? t(key) : action
}

function detailText(detail: unknown) {
  return detail === null || detail === undefined ? '' : JSON.stringify(detail)
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-6">
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="load()">
      <div class="grid gap-2">
        <Label for="audit-slug">{{ $t('audit.filter_slug') }}</Label>
        <Input id="audit-slug" v-model="slugFilter" autocomplete="off" />
      </div>
      <div class="grid gap-2">
        <Label for="audit-actor">{{ $t('audit.filter_actor') }}</Label>
        <Input id="audit-actor" v-model="actorFilter" type="email" autocomplete="off" />
      </div>
      <Button type="submit" :disabled="loading">
        {{ $t('audit.apply') }}
      </Button>
    </form>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('audit.columns.time') }}</TableHead>
          <TableHead>{{ $t('audit.columns.actor') }}</TableHead>
          <TableHead>{{ $t('audit.columns.action') }}</TableHead>
          <TableHead>{{ $t('audit.columns.target') }}</TableHead>
          <TableHead>{{ $t('audit.columns.detail') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="item in items" :key="item.id">
          <TableCell class="whitespace-nowrap">
            {{ new Date(item.at * 1000).toLocaleString() }}
          </TableCell>
          <TableCell>
            {{ item.actorEmail }}
            <Badge variant="secondary">
              {{ item.actorRole }}
            </Badge>
          </TableCell>
          <TableCell>{{ actionLabel(item.action) }}</TableCell>
          <TableCell class="font-mono">
            {{ item.slug ?? '—' }}
          </TableCell>
          <TableCell
            class="max-w-md truncate font-mono text-xs text-muted-foreground" :title="detailText(item.detail)"
          >
            {{ detailText(item.detail) }}
          </TableCell>
        </TableRow>
        <TableEmpty v-if="!loading && items.length === 0" :colspan="5">
          {{ $t('audit.empty') }}
        </TableEmpty>
      </TableBody>
    </Table>

    <div v-if="nextBefore" class="flex justify-center">
      <Button variant="outline" :disabled="loading" @click="load(true)">
        {{ $t('audit.load_more') }}
      </Button>
    </div>
  </div>
</template>
