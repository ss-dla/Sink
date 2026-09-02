import { SlugSchema } from '#shared/schemas/link'

const slugValidator = SlugSchema

export default eventHandler(async (event) => {
  const env = event.context.cloudflare.env
  const key = getRouterParam(event, 'key')

  if (!key) {
    throw createError({ status: 400, statusText: 'Key is required' })
  }

  // Only allow access to images/ path
  if (!key.startsWith('images/')) {
    throw createError({ status: 403, statusText: 'Access denied' })
  }

  // Validate slug in path: images/{slug}/{filename}
  const parts = key.split('/')
  if (parts.length < 3) {
    throw createError({ status: 400, statusText: 'Invalid path format' })
  }

  const slug = parts[1]
  const slugResult = slugValidator.safeParse(slug)
  if (!slugResult.success) {
    throw createError({ status: 400, statusText: 'Invalid slug format' })
  }

  // Try R2 if available
  if (env.R2) {
    const object = await env.R2.get(key)
    if (object) {
      const contentType = object.httpMetadata?.contentType || 'application/octet-stream'
      setHeader(event, 'Content-Type', contentType)
      setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
      setHeader(event, 'ETag', object.etag)
      return object.body
    }
  }

  // Fallback to KV if available
  if (env.KV) {
    const { value, metadata } = await env.KV.getWithMetadata<{ contentType?: string, etag?: string }>(key, { type: 'arrayBuffer' })
    if (value) {
      const contentType = metadata?.contentType || 'application/octet-stream'
      setHeader(event, 'Content-Type', contentType)
      setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
      if (metadata?.etag) {
        setHeader(event, 'ETag', metadata.etag)
      }
      return new Uint8Array(value)
    }
  }

  throw createError({ status: 404, statusText: 'Image not found' })
})
