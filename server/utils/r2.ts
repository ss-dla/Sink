export function requireR2Bucket(env: Cloudflare.Env): R2Bucket {
  if (!env.R2) {
    throw createError({
      statusCode: 503,
      statusMessage: 'R2 binding not configured',
    })
  }

  return env.R2
}

export function hasR2Bucket(env: Cloudflare.Env): boolean {
  return !!env.R2
}
