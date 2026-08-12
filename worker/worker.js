const ALLOWED_ORIGINS = new Set([
  'https://smallyunet.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const UPSTREAM = 'https://konachan.net/post.json'
const ALLOWED_SORTS = new Map([
  ['latest', ''],
  ['popular', 'order:score'],
])

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://smallyunet.github.io'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(request, payload, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function cleanTags(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(tag => !tag.startsWith('rating:') && !tag.startsWith('status:') && !tag.startsWith('order:'))
    .filter(tag => /^[\p{L}\p{N}_.*~()-]+$/u.test(tag))
    .slice(0, 5)
}

function normalizePost(post) {
  const tags = String(post.tags || '').split(/\s+/).filter(Boolean)
  return {
    id: post.id,
    width: post.width,
    height: post.height,
    score: Number(post.score) || 0,
    fileExt: post.file_ext || 'jpg',
    fileUrl: post.file_url,
    sampleUrl: post.sample_url || post.file_url,
    sampleWidth: post.sample_width || post.width,
    sampleHeight: post.sample_height || post.height,
    previewUrl: post.preview_url,
    displayTags: tags,
    postUrl: `https://konachan.net/post/show/${post.id}`,
  }
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    if (request.method !== 'GET') {
      return json(request, { error: 'Method not allowed' }, 405)
    }

    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/health') {
      return json(request, { service: 'KonaView API', status: 'ok' }, 200, 'public, max-age=60')
    }

    if (url.pathname !== '/posts') {
      return json(request, { error: 'Not found' }, 404)
    }

    const parsedPage = Number.parseInt(url.searchParams.get('page') || '1', 10)
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '36', 10)
    const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), 1000) : 1
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 60) : 36
    const sort = ALLOWED_SORTS.get(url.searchParams.get('sort') || 'latest') ?? ''
    const userTags = cleanTags(url.searchParams.get('tags') || '')
    const tags = [...userTags, 'rating:safe', sort].filter(Boolean).join(' ')

    const upstreamUrl = new URL(UPSTREAM)
    upstreamUrl.searchParams.set('page', String(page))
    upstreamUrl.searchParams.set('limit', String(limit))
    upstreamUrl.searchParams.set('tags', tags)

    try {
      const response = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'KonaView/0.1 (+https://github.com/smallyunet/konachan-browser)' },
        cf: { cacheEverything: true, cacheTtl: sort === 'order:score' ? 900 : 180 },
      })

      if (!response.ok) {
        return json(request, { error: 'Upstream request failed' }, 502)
      }

      const posts = await response.json()
      const safePosts = Array.isArray(posts)
        ? posts.filter(post => post.rating === 's' && post.status !== 'pending' && post.is_shown_in_index !== false)
        : []

      return json(request, {
        posts: safePosts.map(normalizePost),
        page,
        hasMore: posts.length >= limit,
      }, 200, 'public, max-age=60, s-maxage=180, stale-while-revalidate=600')
    } catch {
      return json(request, { error: 'Image service unavailable' }, 503)
    }
  },
}
