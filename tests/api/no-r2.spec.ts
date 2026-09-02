import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { fetch, fetchWithAuth, postJson, setLinkStoreD1Mode, TEST_PNG_BYTES } from '../utils'

describe('no-R2 fallback behavior (KV storage)', () => {
  it('triggers backup to KV when R2 is disabled', async () => {
    await setLinkStoreD1Mode()
    const originalR2 = env.R2
    try {
      Object.defineProperty(env, 'R2', { value: undefined, configurable: true, writable: true })

      const response = await postJson('/api/backup', {})
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, message: 'Backup completed successfully' })

      // Check KV for the backup object
      const list = await env.KV.list({ prefix: 'backups/manual-links-' })
      expect(list.keys.length).toBeGreaterThan(0)
      const backupKey = list.keys[list.keys.length - 1].name

      const backupContent = await env.KV.get(backupKey)
      expect(backupContent).toBeTruthy()
      const data = JSON.parse(backupContent!)
      expect(typeof data.count).toBe('number')
      expect(Array.isArray(data.links)).toBe(true)

      // Clean up KV
      await env.KV.delete(backupKey)
    }
    finally {
      Object.defineProperty(env, 'R2', { value: originalR2, configurable: true, writable: true })
    }
  })

  it('uploads and serves an image via KV when R2 is disabled', async () => {
    const originalR2 = env.R2
    try {
      // Simulate environment where R2 is not configured
      Object.defineProperty(env, 'R2', { value: undefined, configurable: true, writable: true })

      const formData = new FormData()
      const file = new File([TEST_PNG_BYTES], 'kv-test.png', { type: 'image/png' })
      const slug = `upload-kv-${crypto.randomUUID()}`
      formData.append('file', file)
      formData.append('slug', slug)

      let key: string | undefined
      try {
        const response = await fetchWithAuth('/api/upload/image', {
          method: 'POST',
          body: formData,
        })
        expect(response.status).toBe(200)

        const data = await response.json() as { url: string, key: string }
        key = data.key
        expect(data.url).toBe(`/_assets/${data.key}`)

        // Verify it was stored in KV
        const kvItem = await env.KV.get(key, 'arrayBuffer')
        expect(kvItem).toBeTruthy()
        expect(new Uint8Array(kvItem!)).toEqual(TEST_PNG_BYTES)

        // Verify it is served correctly from the asset route
        const assetResponse = await fetch(data.url)
        expect(assetResponse.status).toBe(200)
        expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(TEST_PNG_BYTES)
        expect(assetResponse.headers.get('Content-Type')).toBe('image/png')
        expect(assetResponse.headers.get('ETag')).toBeTruthy()
        expect(assetResponse.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
      }
      finally {
        if (key)
          await env.KV.delete(key)
      }
    }
    finally {
      Object.defineProperty(env, 'R2', { value: originalR2, configurable: true, writable: true })
    }
  })
})
