import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'

const API_BASE = 'https://konachan-browser-api.smallyu.workers.dev'
const FAVORITES_KEY = 'konaview:favorites'
const SEEN_KEY = 'konaview:seen'

const views = [
  { id: 'latest', label: 'Latest' },
  { id: 'popular', label: 'Popular' },
  { id: 'favorites', label: 'Favorites' },
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

function App() {
  const [view, setView] = useState('latest')
  const [aspect, setAspect] = useState('all')
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [posts, setPosts] = useState([])
  const [favorites, setFavorites] = useState(readFavorites)
  const [seenIds, setSeenIds] = useState(readSeen)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const sentinelRef = useRef(null)
  const requestGenerationRef = useRef(0)

  const fetchPosts = useCallback(async (nextPage, replace = false) => {
    if (view === 'favorites') return
    const generation = replace ? requestGenerationRef.current + 1 : requestGenerationRef.current
    if (replace) {
      requestGenerationRef.current = generation
      setPosts([])
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

      const response = await fetch(`${API_BASE}/posts?${params}`)
      if (!response.ok) throw new Error(`Request failed with ${response.status}`)
      const data = await response.json()
      if (generation !== requestGenerationRef.current) return
      setPosts(current => replace ? data.posts : [...current, ...data.posts])
      setHasMore(data.posts.length > 0 && data.hasMore)
    } catch {
      if (generation !== requestGenerationRef.current) return
      setError('KonaView could not reach the image service. Please try again in a moment.')
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false)
    }
  }, [activeQuery, aspect, view])

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

  const sourcePosts = view === 'favorites' ? favorites : posts
  const visiblePosts = useMemo(() => sourcePosts.filter(post => {
    const ratio = post.width / post.height
    if (aspect === 'landscape') return ratio >= 1.2
    if (aspect === 'portrait') return ratio < 0.9
    if (aspect === 'ultrawide') return ratio >= 1.75
    return true
  }), [aspect, sourcePosts])

  const selectedIndex = visiblePosts.findIndex(post => post.id === selectedId)
  const selectedPost = selectedIndex >= 0 ? visiblePosts[selectedIndex] : null
  const seenSet = useMemo(() => new Set(seenIds), [seenIds])

  useEffect(() => {
    if (!selectedPost || seenSet.has(selectedPost.id)) return
    setSeenIds(current => [selectedPost.id, ...current].slice(0, 5000))
  }, [seenSet, selectedPost])

  useEffect(() => {
    if (!selectedPost) return
    const handleKey = event => {
      if (event.key === 'Escape') setSelectedId(null)
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
  }, [selectedIndex, selectedPost, visiblePosts])

  const toggleFavorite = post => {
    setFavorites(current => current.some(item => item.id === post.id)
      ? current.filter(item => item.id !== post.id)
      : [post, ...current])
  }

  const submitSearch = event => {
    event.preventDefault()
    setActiveQuery(query.trim())
    if (view === 'favorites') setView('latest')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#gallery-content">Skip to gallery</a>
      <header className="topbar">
        <a className="brand" href="./" aria-label="KonaView home">
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></span>
          <span>KonaView</span>
        </a>

        <form className="search" onSubmit={submitSearch} role="search">
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="search-input">Search characters, series, or artists</label>
          <input
            id="search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search characters, series, artists…"
            autoComplete="off"
          />
          {query && (
            <button type="button" className="icon-button compact" onClick={() => { setQuery(''); setActiveQuery('') }} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
          <kbd>Enter</kbd>
        </form>

        <a className="source-link" href="https://konachan.net" target="_blank" rel="noreferrer">
          Konachan <ExternalLink size={14} />
        </a>
      </header>

      <main id="gallery-content">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow"><span></span> A quieter way to discover</p>
            <h1 id="page-title">Wallpaper browsing,<br /><em>beautifully focused.</em></h1>
            <p className="lede">Explore high-resolution anime artwork in a fast, distraction-free gallery built for every screen.</p>
          </div>
          <div className="intro-stats" aria-label="Gallery information">
            <div><strong>{visiblePosts.length}</strong><span>in view</span></div>
            <div><strong>{favorites.length}</strong><span>saved locally</span></div>
            <div><strong>{seenIds.length}</strong><span>seen locally</span></div>
          </div>
        </section>

        <section className="gallery-toolbar" aria-label="Gallery controls">
          <div className="view-tabs" role="tablist" aria-label="Gallery view">
            {views.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => setView(item.id)}
              >
                {item.id === 'favorites' && <Heart size={15} />}
                {item.label}
                {item.id === 'favorites' && favorites.length > 0 && <span className="count">{favorites.length}</span>}
              </button>
            ))}
          </div>

          <div className="format-filter">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="aspect-filter">Image format</label>
            <select id="aspect-filter" value={aspect} onChange={event => setAspect(event.target.value)}>
              {aspectOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
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
          <section className="masonry" aria-live="polite" aria-label="Wallpaper gallery">
            {visiblePosts.map(post => (
              <article className={`wallpaper-card ${seenSet.has(post.id) ? 'seen' : ''}`} key={post.id}>
                <button
                  type="button"
                  className="image-button"
                  onClick={() => setSelectedId(post.id)}
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
        )}

        {!loading && !error && visiblePosts.length === 0 && (
          <div className="state-card">
            <Grid2X2 size={24} />
            <h2>{view === 'favorites' ? 'Your collection starts here' : 'No wallpapers found'}</h2>
            <p>{view === 'favorites' ? 'Tap the heart on any wallpaper to keep it close.' : 'Try a different tag or image format.'}</p>
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
          if (event.target === event.currentTarget) setSelectedId(null)
        }}>
          <button type="button" className="lightbox-close icon-button" onClick={() => setSelectedId(null)} aria-label="Close viewer"><X /></button>
          {selectedIndex > 0 && (
            <button type="button" className="lightbox-nav previous icon-button" onClick={() => setSelectedId(visiblePosts[selectedIndex - 1].id)} aria-label="Previous wallpaper"><ChevronLeft /></button>
          )}
          <div className="lightbox-panel">
            <div className="lightbox-image-wrap">
              <img src={selectedPost.sampleUrl || selectedPost.fileUrl} alt={selectedPost.displayTags.join(', ')} />
            </div>
            <aside className="lightbox-meta">
              <div>
                <p className="eyebrow"><span></span> Wallpaper {selectedPost.id}</p>
                <h2>{selectedPost.displayTags.slice(0, 3).join(' · ')}</h2>
                <p className="dimensions">{selectedPost.width} × {selectedPost.height} · {selectedPost.fileExt.toUpperCase()}</p>
              </div>
              <div className="tag-list">
                {selectedPost.displayTags.slice(0, 12).map(tag => (
                  <button key={tag} type="button" onClick={() => {
                    setQuery(tag)
                    setActiveQuery(tag)
                    setView('latest')
                    setSelectedId(null)
                  }}>{tag.replaceAll('_', ' ')}</button>
                ))}
              </div>
              <div className="lightbox-actions">
                <button type="button" className="primary-action" onClick={() => toggleFavorite(selectedPost)}>
                  <Heart size={17} fill={favorites.some(item => item.id === selectedPost.id) ? 'currentColor' : 'none'} />
                  {favorites.some(item => item.id === selectedPost.id) ? 'Saved' : 'Save'}
                </button>
                <a href={selectedPost.fileUrl} target="_blank" rel="noreferrer"><ArrowDownToLine size={17} /> Original</a>
                <a href={selectedPost.postUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Source</a>
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
