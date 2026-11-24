<script setup lang="ts">
withDefaults(defineProps<{
  data: string
  image?: string
}>(), {
  image: '/qr-logo.png',
})

const emit = defineEmits<{
  closeAutoFocus: [event: Event]
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <ResponsiveModal
    v-model:open="open"
    :title="$t('links.download_qr_code')"
    @close-auto-focus="emit('closeAutoFocus', $event)"
  >
    <DashboardLinksQRCode :data="data" :image="image" />
  </ResponsiveModal>
</template>
