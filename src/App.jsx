import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://konachan-browser-api.smallyu.workers.dev'
const FAVORITES_KEY = 'konaview:favorites'
const SEEN_KEY = 'konaview:seen'
const HIDE_SEEN_KEY = 'konaview:hide-seen'
const SEEN_HISTORY_LIMIT = 20_000

const views = [
  { id: 'latest', label: 'Latest' },
  { id: 'popular', label: 'Popular' },
  { id: 'random', label: 'Random' },
  { id: 'favorites', label: 'Favorites' },
]

const popularPeriods = [
  { id: 'day', label: '1D' },
  { id: 'week', label: '1W' },
  { id: 'month', label: '1M' },
]

const aspectOptions = [
  { id: 'all', label: 'All formats' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'ultrawide', label: 'Ultrawide' },
]

function readFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
  } catch {
    return []
  }
}

function readSeen() {
  try {
    const ids = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')
    return Array.isArray(ids) ? ids.filter(Number.isFinite) : []
  } catch {
    return []
  }
}

function readHideSeen() {
  try {
    return localStorage.getItem(HIDE_SEEN_KEY) !== 'false'
  } catch {
    return true
  }
}

function localDateStamp() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown'
  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / (1024 ** unitIndex)
  return `${amount.toFixed(amount >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function sourceLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'Original source'
  }
}

function tagTypeLabel(type) {
  if (type === 1) return 'Artist'
  if (type === 3) return 'Series'
  if (type === 4) return 'Character'
  return 'Tag'
}

function App() {
  const [view, setView] = useState('latest')
  const [aspect, setAspect] = useState('all')
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [postBatches, setPostBatches] = useState([])
  const [favorites, setFavorites] = useState(readFavorites)
  const [seenIds, setSeenIds] = useState(readSeen)
  const [hideSeen, setHideSeen] = useState(readHideSeen)
  const [seenFilterBaseline, setSeenFilterBaseline] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [randomKey, setRandomKey] = useState(0)
  const [popularPeriod, setPopularPeriod] = useState('week')
  const [tagSuggestions, setTagSuggestions] = useState([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const sentinelRef = useRef(null)
  const requestGenerationRef = useRef(0)

  const fetchPosts = useCallback(async (nextPage, replace = false) => {
    if (view === 'favorites') return
    const generation = replace ? requestGenerationRef.current + 1 : requestGenerationRef.current
    if (replace) {
      requestGenerationRef.current = generation
      setPostBatches([])
      setHasMore(true)
    }
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: '36',
        sort: view,
        aspect,
      })
      if (activeQuery) params.set('tags', activeQuery)
      if (view === 'random') params.set('shuffle', String(randomKey))
      if (view === 'popular') {
        params.set('period', popularPeriod)
        params.set('date', localDateStamp())
      }

      const response = await fetch(`${API_BASE}/posts?${params}`)
      if (!response.ok) throw new Error(`Request failed with ${response.status}`)
      const data = await response.json()
      if (generation !== requestGenerationRef.current) return
      setPostBatches(current => {
        if (replace) return data.posts.length > 0 ? [data.posts] : []
        const existingIds = new Set(current.flatMap(batch => batch.map(post => post.id)))
        const nextBatch = data.posts.filter(post => !existingIds.has(post.id))
        return nextBatch.length > 0 ? [...current, nextBatch] : current
      })
      setHasMore(data.posts.length > 0 && data.hasMore)
    } catch {
      if (generation !== requestGenerationRef.current) return
      setError('KonaView could not reach the image service. Please try again in a moment.')
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false)
    }
  }, [activeQuery, aspect, popularPeriod, randomKey, view])

  useEffect(() => {
    if (view === 'favorites') return
    setPage(1)
    setHasMore(true)
    fetchPosts(1, true)
  }, [fetchPosts, view])

  useEffect(() => {
    if (!sentinelRef.current || loading || !hasMore || view === 'favorites') return
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      const nextPage = page + 1
      setPage(nextPage)
      fetchPosts(nextPage)
    }, { rootMargin: '500px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [fetchPosts, hasMore, loading, page, view])

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenIds))
  }, [seenIds])

  useEffect(() => {
    localStorage.setItem(HIDE_SEEN_KEY, String(hideSeen))
  }, [hideSeen])

  const sourcePosts = useMemo(
    () => view === 'favorites' ? favorites : postBatches.flat(),
    [favorites, postBatches, view],
  )
  const aspectFilteredPosts = useMemo(() => sourcePosts.filter(post => {
    const ratio = post.width / post.height
    if (aspect === 'landscape') return ratio >= 1.2
    if (aspect === 'portrait') return ratio < 0.9
    if (aspect === 'ultrawide') return ratio >= 1.75
    return true
  }), [aspect, sourcePosts])
  const seenSet = useMemo(() => new Set(seenIds), [seenIds])
  const filteredSeenSet = useMemo(
    () => new Set(seenFilterBaseline ?? seenIds),
    [seenFilterBaseline, seenIds],
  )
  const visiblePosts = useMemo(
    () => view === 'favorites' || !hideSeen
      ? aspectFilteredPosts
      : aspectFilteredPosts.filter(post => !filteredSeenSet.has(post.id)),
    [aspectFilteredPosts, filteredSeenSet, hideSeen, view],
  )
  const hiddenSeenCount = view === 'favorites' || !hideSeen
    ? 0
    : aspectFilteredPosts.length - visiblePosts.length
  const visiblePostIds = useMemo(() => new Set(visiblePosts.map(post => post.id)), [visiblePosts])
  const visibleBatches = useMemo(() => {
    if (view === 'favorites') return visiblePosts.length > 0 ? [visiblePosts] : []
    return postBatches
      .map(batch => batch.filter(post => visiblePostIds.has(post.id)))
      .filter(batch => batch.length > 0)
  }, [postBatches, view, visiblePostIds, visiblePosts])

  const selectedIndex = visiblePosts.findIndex(post => post.id === selectedId)
  const selectedPost = selectedIndex >= 0 ? visiblePosts[selectedIndex] : null

  const openViewer = postId => {
    setSeenFilterBaseline(seenIds)
    setSelectedId(postId)
  }

  const closeViewer = useCallback(() => {
    setSelectedId(null)
    setSeenFilterBaseline(null)
  }, [])

  useEffect(() => {
    const token = query.trim().split(/\s+/).at(-1) || ''
    if (token.length < 2) {
      setTagSuggestions([])
      setActiveSuggestion(-1)
      return undefined
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/tags?query=${encodeURIComponent(token)}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        const data = await response.json()
        setTagSuggestions(Array.isArray(data.tags) ? data.tags : [])
        setActiveSuggestion(-1)
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') setTagSuggestions([])
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    if (!selectedPost || seenSet.has(selectedPost.id)) return
    setSeenIds(current => [selectedPost.id, ...current].slice(0, SEEN_HISTORY_LIMIT))
  }, [seenSet, selectedPost])

  useEffect(() => {
    if (!selectedPost) return
    const handleKey = event => {
      if (event.key === 'Escape') closeViewer()
      if (event.key === 'ArrowLeft' && selectedIndex > 0) {
        setSelectedId(visiblePosts[selectedIndex - 1].id)
      }
      if (event.key === 'ArrowRight' && selectedIndex < visiblePosts.length - 1) {
        setSelectedId(visiblePosts[selectedIndex + 1].id)
      }
    }
    window.addEventListener('keydown', handleKey)
    document.body.classList.add('modal-open')
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.classList.remove('modal-open')
    }
  }, [closeViewer, selectedIndex, selectedPost, visiblePosts])

  const toggleFavorite = post => {
    setFavorites(current => current.some(item => item.id === post.id)
      ? current.filter(item => item.id !== post.id)
      : [post, ...current])
  }

  const saveFavorite = post => {
    setFavorites(current => current.some(item => item.id === post.id)
      ? current
      : [post, ...current])
  }

  const searchFor = value => {
    const nextQuery = value.trim()
    setQuery(nextQuery)
    setActiveQuery(nextQuery)
    setSuggestionsOpen(false)
    setActiveSuggestion(-1)
    if (view !== 'latest') setView('latest')
  }

  const selectSuggestion = name => {
    const tokens = query.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) tokens.push(name)
    else tokens[tokens.length - 1] = name
    searchFor(tokens.join(' '))
  }

  const submitSearch = event => {
    event.preventDefault()
    if (suggestionsOpen && activeSuggestion >= 0 && tagSuggestions[activeSuggestion]) {
      selectSuggestion(tagSuggestions[activeSuggestion].name)
      return
    }
    searchFor(query)
  }

  const handleSearchKeyDown = event => {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false)
      setActiveSuggestion(-1)
      return
    }
    if (tagSuggestions.length === 0 || !suggestionsOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestion(current => (current + 1) % tagSuggestions.length)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestion(current => current <= 0 ? tagSuggestions.length - 1 : current - 1)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#gallery-content">Skip to gallery</a>
      <header className="topbar">
        <a className="brand" href="./" aria-label="KonaView home">
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></span>
          <span>KonaView</span>
        </a>

        <form
          className="search"
          onSubmit={submitSearch}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSuggestionsOpen(false)
          }}
          role="search"
        >
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="search-input">Search characters, series, or artists</label>
          <input
            id="search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search characters, series, artists…"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen && tagSuggestions.length > 0}
            aria-controls="tag-suggestions"
            aria-activedescendant={activeSuggestion >= 0 ? `tag-suggestion-${activeSuggestion}` : undefined}
          />
          {query && (
            <button type="button" className="icon-button compact" onClick={() => { setQuery(''); setActiveQuery(''); setTagSuggestions([]) }} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
          <kbd>Enter</kbd>
          {suggestionsOpen && tagSuggestions.length > 0 && (
            <div className="tag-suggestions" id="tag-suggestions" role="listbox" aria-label="Tag suggestions">
              {tagSuggestions.map((tag, index) => (
                <button
                  type="button"
                  role="option"
                  id={`tag-suggestion-${index}`}
                  aria-selected={activeSuggestion === index}
                  className={activeSuggestion === index ? 'active' : ''}
                  key={tag.name}
                  onMouseEnter={() => setActiveSuggestion(index)}
                  onClick={() => selectSuggestion(tag.name)}
                >
                  <span><strong>{tag.name.replaceAll('_', ' ')}</strong><small>{tagTypeLabel(tag.type)}</small></span>
                  <span className="suggestion-count">{tag.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        <a className="source-link" href="https://konachan.net" target="_blank" rel="noreferrer">
          Konachan <ExternalLink size={14} />
        </a>
      </header>

      <main id="gallery-content">
        <h1 className="sr-only">KonaView wallpaper gallery</h1>
        <section className="gallery-toolbar" aria-label="Gallery controls">
          <div className="view-tabs" role="tablist" aria-label="Gallery view">
            {views.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => {
                  if (item.id === 'random' && view === 'random') {
                    setRandomKey(current => current + 1)
                    return
                  }
                  if (item.id === 'popular') {
                    setQuery('')
                    setActiveQuery('')
                  }
                  setView(item.id)
                }}
                aria-label={item.id === 'random' && view === 'random' ? 'Random, shuffle again' : item.label}
              >
                {item.id === 'latest' && <Clock3 size={15} />}
                {item.id === 'popular' && <Flame size={15} />}
                {item.id === 'random' && <Shuffle size={15} />}
                {item.id === 'favorites' && <Heart size={15} />}
                {item.label}
                {item.id === 'favorites' && favorites.length > 0 && <span className="count">{favorites.length}</span>}
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            {view === 'popular' && (
              <div className="period-filter" role="group" aria-label="Popular period">
                {popularPeriods.map(period => (
                  <button
                    key={period.id}
                    type="button"
                    className={popularPeriod === period.id ? 'active' : ''}
                    aria-pressed={popularPeriod === period.id}
                    onClick={() => setPopularPeriod(period.id)}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            )}
            {view !== 'favorites' && (
              <button
                type="button"
                className={`seen-filter ${hideSeen ? 'active' : ''}`}
                aria-pressed={hideSeen}
                onClick={() => setHideSeen(current => !current)}
                title={hideSeen && hiddenSeenCount > 0 ? `${hiddenSeenCount} seen hidden` : undefined}
              >
                <EyeOff size={16} aria-hidden="true" />
                Hide seen
                {hideSeen && hiddenSeenCount > 0 && <span className="count">{hiddenSeenCount}</span>}
              </button>
            )}
            <div className="format-filter">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <label className="sr-only" htmlFor="aspect-filter">Image format</label>
              <select id="aspect-filter" value={aspect} onChange={event => setAspect(event.target.value)}>
                {aspectOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        {activeQuery && (
          <div className="query-banner">
            <span>Showing results for</span>
            <strong>{activeQuery.replaceAll('_', ' ')}</strong>
            <button type="button" onClick={() => { setQuery(''); setActiveQuery('') }}>Clear</button>
          </div>
        )}

        {error && (
          <div className="state-card error-state">
            <ImageIcon size={24} />
            <p>{error}</p>
            <button type="button" onClick={() => fetchPosts(1, true)}>Try again</button>
          </div>
        )}

        {!error && visiblePosts.length > 0 && (
          <div className="gallery-batches" aria-live="polite" aria-label="Wallpaper gallery">
            {visibleBatches.map((batch, batchIndex) => (
              <section className="masonry" key={`${view}-${aspect}-${activeQuery}-${batchIndex}`} aria-label={`Wallpaper batch ${batchIndex + 1}`}>
                {batch.map(post => (
              <article className={`wallpaper-card ${seenSet.has(post.id) ? 'seen' : ''}`} key={post.id}>
                <button
                  type="button"
                  className="image-button"
                  onClick={() => openViewer(post.id)}
                  aria-label={`Open wallpaper ${post.id}${seenSet.has(post.id) ? ', seen' : ''}`}
                >
                  <img
                    src={post.sampleUrl || post.previewUrl}
                    alt={post.displayTags.slice(0, 4).join(', ')}
                    width={post.sampleWidth || post.width}
                    height={post.sampleHeight || post.height}
                    loading="lazy"
                  />
                  <span className="card-scrim"></span>
                  {seenSet.has(post.id) && <span className="seen-badge"><Eye size={13} aria-hidden="true" /> Seen</span>}
                  <span className="resolution">{post.width} × {post.height}</span>
                  <span className="card-copy">
                    <strong>{post.displayTags.slice(0, 2).join(' · ') || `Post ${post.id}`}</strong>
                    <small>{post.score} score</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`favorite-button ${favorites.some(item => item.id === post.id) ? 'saved' : ''}`}
                  onClick={() => toggleFavorite(post)}
                  aria-label={favorites.some(item => item.id === post.id) ? 'Remove from favorites' : 'Save to favorites'}
                >
                  <Heart size={17} fill="currentColor" />
                </button>
              </article>
                ))}
              </section>
            ))}
          </div>
        )}

        {!loading && !error && visiblePosts.length === 0 && (
          <div className="state-card">
            <Grid2X2 size={24} />
            <h2>{view === 'favorites' ? 'Your collection starts here' : hiddenSeenCount > 0 ? "You're all caught up" : 'No wallpapers found'}</h2>
            <p>{view === 'favorites'
              ? 'Tap the heart on any wallpaper to keep it close.'
              : hiddenSeenCount > 0
                ? `${hiddenSeenCount} seen ${hiddenSeenCount === 1 ? 'wallpaper is' : 'wallpapers are'} hidden.`
                : 'Try a different tag or image format.'}</p>
            {view !== 'favorites' && hiddenSeenCount > 0 && (
              <button type="button" onClick={() => setHideSeen(false)}>Show seen</button>
            )}
          </div>
        )}

        {loading && visiblePosts.length === 0 && (
          <section className={`skeleton-grid ${aspect}`} aria-label={`Loading ${aspect} wallpapers`} aria-busy="true">
            {Array.from({ length: 12 }, (_, index) => <span key={index}></span>)}
          </section>
        )}

        {loading && visiblePosts.length > 0 && (
          <div className="loading-row" role="status">
            <span className="spinner"></span> Loading more artwork…
          </div>
        )}
        <div ref={sentinelRef} className="sentinel" aria-hidden="true"></div>
      </main>

      <footer>
        <span>KonaView is an independent interface.</span>
        <span>Images and metadata are provided by Konachan.</span>
      </footer>

      {selectedPost && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Wallpaper viewer" onMouseDown={event => {
          if (event.target === event.currentTarget) closeViewer()
        }}>
          <button type="button" className="lightbox-close icon-button" onClick={closeViewer} aria-label="Close viewer"><X /></button>
          {selectedIndex > 0 && (
            <button type="button" className="lightbox-nav previous icon-button" onClick={() => setSelectedId(visiblePosts[selectedIndex - 1].id)} aria-label="Previous wallpaper"><ChevronLeft /></button>
          )}
          <div className="lightbox-panel">
            <button type="button" className="lightbox-image-wrap" onClick={closeViewer} aria-label="Close viewer">
              <img src={selectedPost.sampleUrl || selectedPost.fileUrl} alt={selectedPost.displayTags.join(', ')} draggable="false" />
            </button>
            <aside className="lightbox-meta">
              <div>
                <p className="eyebrow"><span></span> Wallpaper {selectedPost.id}</p>
                <h2>{selectedPost.displayTags.slice(0, 3).join(' · ')}</h2>
                <p className="dimensions">{selectedPost.width} × {selectedPost.height} · {selectedPost.fileExt.toUpperCase()}</p>
              </div>
              <dl className="post-details">
                <div><dt>Author</dt><dd>{selectedPost.author || 'Unknown'}</dd></div>
                <div><dt>Uploaded</dt><dd>{formatDate(selectedPost.createdAt)}</dd></div>
                <div><dt>Original size</dt><dd>{formatBytes(selectedPost.fileSize)}</dd></div>
                {selectedPost.sourceUrl && (
                  <div>
                    <dt>Artwork source</dt>
                    <dd><a href={selectedPost.sourceUrl} target="_blank" rel="noreferrer">{sourceLabel(selectedPost.sourceUrl)} <ExternalLink size={12} /></a></dd>
                  </div>
                )}
              </dl>
              <div className="tag-list">
                {selectedPost.displayTags.slice(0, 12).map(tag => (
                  <button key={tag} type="button" onClick={() => { closeViewer(); searchFor(tag) }}>{tag.replaceAll('_', ' ')}</button>
                ))}
              </div>
              <div className="lightbox-actions">
                <button type="button" className="primary-action" onClick={() => toggleFavorite(selectedPost)}>
                  <Heart size={17} fill={favorites.some(item => item.id === selectedPost.id) ? 'currentColor' : 'none'} />
                  {favorites.some(item => item.id === selectedPost.id) ? 'Saved' : 'Save'}
                </button>
                <a href={selectedPost.fileUrl} target="_blank" rel="noreferrer" onClick={() => saveFavorite(selectedPost)}><ArrowDownToLine size={17} /> Original</a>
                <a href={selectedPost.postUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Konachan</a>
              </div>
              <p className="viewer-hint">Use ← → to browse · Esc to close</p>
            </aside>
          </div>
          {selectedIndex < visiblePosts.length - 1 && (
            <button type="button" className="lightbox-nav next icon-button" onClick={() => setSelectedId(visiblePosts[selectedIndex + 1].id)} aria-label="Next wallpaper"><ChevronRight /></button>
          )}
        </div>
      )}
    </div>
  )
}

export default App
