const ALLOWED_ORIGINS = new Set([
  'https://smallyunet.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const UPSTREAM = 'https://konachan.net/post.json'
const TAGS_UPSTREAM = 'https://konachan.net/tag.json'
const RELATED_TAGS_UPSTREAM = 'https://konachan.net/tag/related.json'
const POPULAR_RECENT_UPSTREAM = 'https://konachan.net/post/popular_recent.json'
const TRENDING_TAG_ENDPOINTS = {
  day: 'https://konachan.net/tag/popular_by_day',
  week: 'https://konachan.net/tag/popular_by_week',
  month: 'https://konachan.net/tag/popular_by_month',
}
const ALLOWED_SORTS = new Map([
  ['latest', ''],
  ['popular', 'order:score'],
  ['random', 'order:random'],
])
const ALLOWED_ASPECTS = new Set(['all', 'landscape', 'portrait', 'ultrawide'])
const ALLOWED_POPULAR_PERIODS = new Set(['1d', '1w', '1m', '1y'])
const ALLOWED_TRENDING_TAG_PERIODS = new Set(Object.keys(TRENDING_TAG_ENDPOINTS))
const UPSTREAM_LIMITS = {
  all: 36,
  landscape: 80,
  portrait: 240,
  ultrawide: 120,
}

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

function cleanTagQuery(value) {
  const query = String(value || '').trim().slice(0, 80)
  return /^[\p{L}\p{N}_.*~()\-]+$/u.test(query) ? query : ''
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function createdAt(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  const date = new Date(timestamp * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
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
    sourceUrl: safeUrl(post.source),
    author: typeof post.author === 'string' ? post.author : null,
    createdAt: createdAt(post.created_at),
    fileSize: Number(post.file_size) || null,
  }
}

function normalizeTag(tag) {
  const name = typeof tag?.name === 'string' ? tag.name : ''
  const count = Number(tag?.count) || 0
  if (!name || count <= 0) return null
  return { name, count, type: Number(tag.type) || 0 }
}

function parseTrendingTags(html, limit) {
  const tagList = String(html || '').match(/<div\s+id=["']tag-list["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''
  const anchors = tagList.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)
  const tags = []

  for (const [, attributes] of anchors) {
    const title = attributes.match(/\btitle=["']([^"']+)["']/i)?.[1] || ''
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1] || ''
    const countMatch = title.match(/^([\d,]+)\s+posts?$/i)
    if (!countMatch || !href.startsWith('/post?')) continue

    try {
      const upstreamUrl = new URL(href.replaceAll('&amp;', '&'), 'https://konachan.net')
      const name = upstreamUrl.searchParams.get('tags') || ''
      const count = Number(countMatch[1].replaceAll(',', ''))
      if (!name || name.includes(' ') || !Number.isFinite(count) || count <= 0) continue
      tags.push({ name, count, type: 0 })
    } catch {
      // Ignore malformed upstream tag links.
    }
  }

  return tags
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit)
}

async function fetchUpstream(url, cacheTtl = 300) {
  return fetch(url, {
    headers: { 'User-Agent': 'KonaView/0.1 (+https://github.com/smallyunet/konaview)' },
    cf: { cacheEverything: true, cacheTtl },
  })
}

async function handleTagSuggestions(request, url) {
  const query = cleanTagQuery(url.searchParams.get('query'))
  if (query.length < 2) return json(request, { tags: [] }, 200, 'public, max-age=60')

  const upstreamUrl = new URL(TAGS_UPSTREAM)
  upstreamUrl.searchParams.set('name', query)
  upstreamUrl.searchParams.set('order', 'count')
  upstreamUrl.searchParams.set('limit', '12')

  try {
    const response = await fetchUpstream(upstreamUrl, 900)
    if (!response.ok) return json(request, { error: 'Upstream request failed' }, 502)
    const payload = await response.json()
    const tags = Array.isArray(payload)
      ? payload.map(normalizeTag).filter(Boolean).slice(0, 10)
      : []
    return json(request, { tags }, 200, 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800')
  } catch {
    return json(request, { error: 'Tag service unavailable' }, 503)
  }
}

async function handleRelatedTags(request, url) {
  const requestedTags = cleanTags(url.searchParams.get('tags') || '').slice(0, 3)
  if (requestedTags.length === 0) return json(request, { tags: [] }, 200, 'public, max-age=60')

  const upstreamUrl = new URL(RELATED_TAGS_UPSTREAM)
  upstreamUrl.searchParams.set('tags', requestedTags.join(' '))

  try {
    const response = await fetchUpstream(upstreamUrl, 1800)
    if (!response.ok) return json(request, { error: 'Upstream request failed' }, 502)
    const payload = await response.json()
    const requested = new Set(requestedTags)
    const entries = payload && typeof payload === 'object'
      ? Object.values(payload).flatMap(value => Array.isArray(value) ? value : [])
      : []
    const counts = new Map()
    for (const entry of entries) {
      if (!Array.isArray(entry)) continue
      const [name, rawCount] = entry
      const count = Number(rawCount) || 0
      if (typeof name !== 'string' || !name || requested.has(name) || count <= 0) continue
      counts.set(name, Math.max(counts.get(name) || 0, count))
    }
    const tags = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))
    return json(request, { tags }, 200, 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600')
  } catch {
    return json(request, { error: 'Related tag service unavailable' }, 503)
  }
}

async function handleTagRankings(request, url) {
  const mode = url.searchParams.get('mode') === 'top' ? 'top' : 'trending'
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '60', 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 60

  if (mode === 'top') {
    const upstreamUrl = new URL(TAGS_UPSTREAM)
    upstreamUrl.searchParams.set('order', 'count')
    upstreamUrl.searchParams.set('limit', String(limit))

    try {
      const response = await fetchUpstream(upstreamUrl, 3600)
      if (!response.ok) return json(request, { error: 'Upstream request failed' }, 502)
      const payload = await response.json()
      const tags = Array.isArray(payload) ? payload.map(normalizeTag).filter(Boolean).slice(0, limit) : []
      return json(request, { mode, tags }, 200, 'public, max-age=900, s-maxage=3600, stale-while-revalidate=7200')
    } catch {
      return json(request, { error: 'Tag ranking service unavailable' }, 503)
    }
  }

  const requestedPeriod = url.searchParams.get('period') || 'day'
  const period = ALLOWED_TRENDING_TAG_PERIODS.has(requestedPeriod) ? requestedPeriod : 'day'

  try {
    const response = await fetchUpstream(new URL(TRENDING_TAG_ENDPOINTS[period]), 1800)
    if (!response.ok) return json(request, { error: 'Upstream request failed' }, 502)
    const tags = parseTrendingTags(await response.text(), limit)
    return json(request, { mode, period, tags }, 200, 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600')
  } catch {
    return json(request, { error: 'Tag ranking service unavailable' }, 503)
  }
}

function matchesAspect(post, aspect) {
  if (aspect === 'all') return true
  const ratio = Number(post.width) / Number(post.height)
  if (!Number.isFinite(ratio)) return false
  if (aspect === 'landscape') return ratio >= 1.2
  if (aspect === 'portrait') return ratio < 0.9
  if (aspect === 'ultrawide') return ratio >= 1.75
  return true
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

    if (url.pathname === '/tags') return handleTagSuggestions(request, url)
    if (url.pathname === '/related') return handleRelatedTags(request, url)
    if (url.pathname === '/tag-rankings') return handleTagRankings(request, url)

    if (url.pathname !== '/posts') {
      return json(request, { error: 'Not found' }, 404)
    }

    const parsedPage = Number.parseInt(url.searchParams.get('page') || '1', 10)
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '36', 10)
    const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), 1000) : 1
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 60) : 36
    const requestedSort = url.searchParams.get('sort') || 'latest'
    const sort = ALLOWED_SORTS.get(requestedSort) ?? ''
    const isRandom = sort === 'order:random'
    const isPopular = requestedSort === 'popular'
    const requestedPeriod = url.searchParams.get('period') || '1d'
    const popularPeriod = ALLOWED_POPULAR_PERIODS.has(requestedPeriod) ? requestedPeriod : '1d'
    const requestedAspect = url.searchParams.get('aspect') || 'all'
    const aspect = ALLOWED_ASPECTS.has(requestedAspect) ? requestedAspect : 'all'
    const upstreamLimit = aspect === 'all' ? limit : UPSTREAM_LIMITS[aspect]
    const userTags = cleanTags(url.searchParams.get('tags') || '')
    const tags = [...userTags, 'rating:safe', sort].filter(Boolean).join(' ')

    const upstreamUrl = new URL(isPopular ? POPULAR_RECENT_UPSTREAM : UPSTREAM)
    if (isPopular) {
      upstreamUrl.searchParams.set('period', popularPeriod)
    } else {
      upstreamUrl.searchParams.set('page', String(page))
      upstreamUrl.searchParams.set('limit', String(upstreamLimit))
      upstreamUrl.searchParams.set('tags', tags)
    }

    try {
      const fetchOptions = {
        headers: { 'User-Agent': 'KonaView/0.1 (+https://github.com/smallyunet/konaview)' },
      }
      if (!isRandom) {
        fetchOptions.cf = { cacheEverything: true, cacheTtl: sort === 'order:score' ? 900 : 180 }
      }
      const response = await fetch(upstreamUrl, fetchOptions)

      if (!response.ok) {
        return json(request, { error: 'Upstream request failed' }, 502)
      }

      const posts = await response.json()
      const safePosts = Array.isArray(posts)
        ? posts.filter(post => (
          post.rating === 's'
          && post.status !== 'pending'
          && post.is_shown_in_index !== false
          && matchesAspect(post, aspect)
        ))
        : []

      return json(request, {
        posts: safePosts.map(normalizePost),
        page,
        hasMore: !isPopular && safePosts.length > 0 && posts.length >= upstreamLimit,
      }, 200, isRandom ? 'no-store' : 'public, max-age=60, s-maxage=180, stale-while-revalidate=600')
    } catch {
      return json(request, { error: 'Image service unavailable' }, 503)
    }
  },
}
