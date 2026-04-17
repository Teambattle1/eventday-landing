import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'

const STORAGE_KEY = 'ef_admin_access'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12h

// Resize an uploaded image to fit within `maxSize x maxSize`, preserving
// aspect ratio. Returns a PNG data URL (supports transparency).
function resizeImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode_failed'))
      img.onload = () => {
        const { width, height } = img
        const scale = Math.min(1, maxSize / Math.max(width, height))
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        try {
          resolve(canvas.toDataURL('image/png'))
        } catch (e) {
          reject(e)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Extract the last 4 digits from a phone number (ignores spaces, +45, etc.)
function defaultCodeFromPhone(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return ''
  return digits.slice(-4)
}

// Get initials from a name: "Thomas Sunke" → "TS", "CREW" → "CR"
function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const ROLE_LABELS = {
  admin: 'Admin',
  crew: 'Crew',
  ef_admin: 'Admin',
  ef_client: 'Kunde',
  ef_contact: 'Kontakt',
  venue: 'Venue',
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.code || !s?.expiresAt || Date.now() > s.expiresAt) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

async function callAdmin(code, action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('ef-admin-access', {
    body: { adminCode: code, action, ...extra },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

function buildAccessSet(rows) {
  const m = new Map()
  for (const r of rows || []) {
    const k = `${r.user_type}|${r.user_id}`
    if (!m.has(k)) m.set(k, new Set())
    m.get(k).add(r.site_id)
  }
  return m
}

// ── Admin login screen ─────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setLoading(true)
    setErr('')
    try {
      const data = await callAdmin(trimmed, 'list')
      const session = {
        code: trimmed,
        name: data.adminName,
        expiresAt: Date.now() + SESSION_TTL_MS,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      onLogin(session, data)
    } catch (e) {
      setErr(e.message === 'not_admin' ? 'Ikke en admin-kode.' : 'Forkert kode eller fejl.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-center">
      <form className="admin-card admin-card--narrow" onSubmit={submit}>
        <h1 className="admin-h1">Access Management</h1>
        <p className="admin-sub">Indtast din admin-kode for at fortsætte.</p>
        <input
          className="admin-input admin-input--code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="ADMIN CODE"
          autoFocus
          disabled={loading}
        />
        {err && <div className="admin-error">{err}</div>}
        <button className="admin-btn admin-btn--primary" disabled={loading || !code}>
          {loading ? 'Verificerer…' : 'Log ind'}
        </button>
        <a href="/" className="admin-link">← Tilbage til login</a>
      </form>
    </div>
  )
}

// Inline code editor — click to edit, Enter/blur to save, Esc to cancel
function CodeEditor({ user, onSetCode }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)
  const defaultCode = defaultCodeFromPhone(user.phone)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEdit(e) {
    e.stopPropagation()
    setValue(user.code || defaultCode || '')
    setEditing(true)
  }

  async function commit() {
    const trimmed = (value || '').trim().toUpperCase()
    if (!trimmed || trimmed === (user.code || '')) {
      setEditing(false)
      return
    }
    if (!/^[A-Z0-9]{3,8}$/.test(trimmed)) {
      setEditing(false)
      return
    }
    setSaving(true)
    await onSetCode(user, trimmed)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="admin-input admin-input--codecell"
        value={value}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        }}
      />
    )
  }

  if (user.code) {
    return (
      <button
        className="admin-user-code admin-user-code--btn"
        onClick={startEdit}
        title="Klik for at ændre koden"
      >
        {user.code}
      </button>
    )
  }

  if (defaultCode) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="admin-btn admin-btn--primary admin-btn--tinycode"
          onClick={(e) => { e.stopPropagation(); onSetCode(user, defaultCode) }}
          title={`Sæt kode til sidste 4 cifre: ${defaultCode}`}
        >
          Sæt · {defaultCode}
        </button>
        <button
          className="admin-btn admin-btn--tinycode"
          onClick={startEdit}
          title="Indtast en anden kode"
        >
          ✎
        </button>
      </div>
    )
  }

  return (
    <button
      className="admin-btn admin-btn--tinycode"
      onClick={startEdit}
      title="Sæt kode"
    >
      + Sæt kode
    </button>
  )
}

// ── User row (handles top-level users + nested ef_contacts under clients) ─
// Role → avatar background color
const ROLE_COLORS = {
  admin: 'var(--accent)',
  crew: 'var(--blue)',
  ef_admin: 'var(--gold)',
  ef_client: 'var(--green)',
  ef_contact: 'var(--gold)',
  venue: '#1a9e75',
}

function UserIconBtn({ user, onClick }) {
  return (
    <button
      className="admin-icon-btn"
      onClick={() => onClick(user)}
      title={`${user.name}\n${user.email || ''}\n${user.phone || ''}\n${user.code || 'Ingen kode'}`}
    >
      <div
        className="admin-icon-circle"
        style={{ background: ROLE_COLORS[user.role] || 'var(--muted)' }}
      >
        <span>{getInitials(user.name)}</span>
      </div>
      <span className="admin-icon-label">{user.name}</span>
    </button>
  )
}

// ── Icon preview helper ───────────────────────────────────────────────────
// Fills its parent container (cover). Parent must have overflow: hidden.
function IconPreview({ icon, color, name }) {
  if (!icon) {
    // Fallback: first letter of name
    return (
      <span style={{
        fontSize: 16,
        fontWeight: 700,
        fontFamily: "'Playfair Display', Georgia, serif",
        color: '#fff',
      }}>
        {(name || '?').charAt(0).toUpperCase()}
      </span>
    )
  }
  if (icon.startsWith('data:image/') || icon.startsWith('http')) {
    return (
      <img
        src={icon}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    )
  }
  // Plain name — render as text tag
  return (
    <span style={{
      fontSize: 10,
      padding: '2px 6px',
      background: color ? `${color}22` : 'var(--surface3)',
      color: color || 'var(--muted)',
      borderRadius: 4,
      fontWeight: 600,
    }}>{icon}</span>
  )
}

// ── Site editor modal ──────────────────────────────────────────────────────
function SiteEditor({ site, onSave, onCancel, onDelete, allSites }) {
  const [form, setForm] = useState({
    id: site?.id || null,
    key: site?.key || '',
    name: site?.name || '',
    url: site?.url || '',
    color: site?.color || '#d4af37',
    icon: site?.icon || '',
    sort_order: site?.sort_order ?? 0,
    active: site?.active !== false,
    parent_id: site?.parent_id || '',
  })

  // Only top-level sites (no parent) that aren't this site can be parents
  const parentOptions = useMemo(
    () => (allSites || [])
      .filter((s) => !s.parent_id && s.id !== form.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allSites, form.id]
  )
  const [iconError, setIconError] = useState('')
  const fileRef = useRef(null)

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleIconFile(file) {
    setIconError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setIconError('Kun billedfiler.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setIconError('Filen er større end 10 MB.')
      return
    }
    try {
      const dataUrl = await resizeImage(file, 256)
      set('icon', dataUrl)
    } catch (e) {
      setIconError('Kunne ikke behandle billedet.')
    }
  }

  const iconIsImage = form.icon && (form.icon.startsWith('data:image/') || form.icon.startsWith('http'))

  return (
    <div className="admin-modal-bg" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-h2">{form.id ? 'Rediger site' : 'Nyt site'}</h2>
        <label className="admin-label">Key (unique ID)
          <input className="admin-input" value={form.key} onChange={(e) => set('key', e.target.value)} placeholder="occ, crew, flow…" />
        </label>
        <label className="admin-label">Navn
          <input className="admin-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="OCC Control" />
        </label>
        <label className="admin-label">URL
          <input className="admin-input" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://occ.eventday.dk" />
        </label>
        <div className="admin-row">
          <label className="admin-label" style={{ flex: 1 }}>Farve
            <input className="admin-input" type="color" value={form.color || '#d4af37'} onChange={(e) => set('color', e.target.value)} />
          </label>
          <label className="admin-label" style={{ flex: 1 }}>Sort order
            <input className="admin-input" type="number" value={form.sort_order} onChange={(e) => set('sort_order', parseInt(e.target.value) || 0)} />
          </label>
        </div>

        <div className="admin-label">Ikon
          <div className="admin-icon-box">
            <div className="admin-icon-preview" style={{ borderColor: form.color || 'var(--border2)' }}>
              {iconIsImage ? (
                <img src={form.icon} alt="" />
              ) : form.icon ? (
                <span className="admin-icon-text">{form.icon}</span>
              ) : (
                <span className="admin-icon-empty">?</span>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                className="admin-btn"
                onClick={() => fileRef.current?.click()}
              >
                Upload ikon
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleIconFile(e.target.files?.[0])}
              />
              {form.icon && (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={() => set('icon', '')}
                >
                  Fjern
                </button>
              )}
            </div>
          </div>
          {iconError && <div className="admin-error" style={{ marginTop: 8 }}>{iconError}</div>}
        </div>

        <label className="admin-label">Parent site (valgfri)
          <select
            className="admin-input"
            value={form.parent_id || ''}
            onChange={(e) => set('parent_id', e.target.value || null)}
          >
            <option value="">— Ingen (top-level) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="admin-check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          Aktiv
        </label>
        <div className="admin-modal-actions">
          {form.id && (
            <button className="admin-btn admin-btn--danger" onClick={() => onDelete(form.id)}>Slet</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="admin-btn" onClick={onCancel}>Annuller</button>
          <button className="admin-btn admin-btn--primary" style={{ width: 'auto' }} onClick={() => onSave(form)}>Gem</button>
        </div>
      </div>
    </div>
  )
}

// ── Site access tree for UserDetail (parent/child with +/- expand) ─────────
function SiteAccessTree({ sites, localGrants, savingSites, onToggle }) {
  const [expanded, setExpanded] = useState(new Set())

  const parentSites = useMemo(
    () => sites.filter((s) => !s.parent_id).sort((a, b) => a.name.localeCompare(b.name)),
    [sites]
  )
  const childrenByParent = useMemo(() => {
    const m = new Map()
    for (const s of sites) {
      if (s.parent_id) {
        if (!m.has(s.parent_id)) m.set(s.parent_id, [])
        m.get(s.parent_id).push(s)
      }
    }
    for (const [, arr] of m) arr.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [sites])

  function toggleExpand(id) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function renderSiteRow(s, indent = false) {
    const on = localGrants.has(s.id)
    const busy = savingSites.has(s.id)
    return (
      <div
        key={s.id}
        className={`admin-site-row ${on ? 'on' : ''} ${indent ? 'admin-site-row--indent' : ''}`}
        onClick={() => !busy && onToggle(s.id)}
        style={on ? { borderLeftColor: s.color || 'var(--accent)' } : {}}
      >
        <div className="admin-site-row-icon" style={{ background: s.color ? `${s.color}22` : 'var(--surface3)' }}>
          <IconPreview icon={s.icon} color={s.color} name={s.name} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="admin-site-row-name">{s.name}</div>
          <div className="admin-site-row-url">{s.url}</div>
        </div>
        <div
          className={`admin-switch ${on ? 'on' : ''}`}
          style={on ? { background: s.color || 'var(--accent)' } : {}}
        >
          <div className="admin-switch-knob" />
        </div>
      </div>
    )
  }

  return (
    <div className="admin-site-toggle-list">
      {parentSites.map((s) => {
        const children = childrenByParent.get(s.id) || []
        const isExpanded = expanded.has(s.id)
        const childGrantCount = children.filter((c) => localGrants.has(c.id)).length
        if (children.length === 0) return renderSiteRow(s)
        return (
          <div key={s.id} className="admin-site-tree-group">
            <div className="admin-site-row admin-site-row--parent" style={{ borderLeftColor: s.color || 'var(--accent)' }}>
              <button
                className="admin-site-expand"
                onClick={(e) => { e.stopPropagation(); toggleExpand(s.id) }}
              >
                {isExpanded ? '−' : '+'}
              </button>
              <div className="admin-site-row-icon" style={{ background: s.color ? `${s.color}22` : 'var(--surface3)' }}>
                <IconPreview icon={s.icon} color={s.color} name={s.name} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggleExpand(s.id)}>
                <div className="admin-site-row-name">
                  {s.name}
                  <span className="admin-site-child-count">{childGrantCount}/{children.length}</span>
                </div>
              </div>
            </div>
            {isExpanded && (
              <div className="admin-site-tree-children">
                {children.map((c) => renderSiteRow(c, true))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sites section with hierarchy + collapse ────────────────────────────────
function SitesSection({ sites, onEdit, onSetParent, onAdd }) {
  const [open, setOpen] = useState(false)

  const sorted = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)),
    [sites]
  )

  return (
    <section className="admin-section">
      <div
        className="admin-section-head admin-section-head--toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="admin-h2">
          <span className="admin-collapse-icon">{open ? '▾' : '▸'}</span>
          Sites ({sites.length})
        </h2>
        <button
          className="admin-btn admin-btn--primary"
          style={{ width: 'auto' }}
          onClick={(e) => { e.stopPropagation(); onAdd() }}
        >
          + Tilføj
        </button>
      </div>
      {open && (
        <div className="admin-icon-grid">
          {sorted.map((s) => {
            const isImg = s.icon && (s.icon.startsWith('data:image/') || s.icon.startsWith('http'))
            return (
              <button
                key={s.id}
                className="admin-icon-btn"
                onClick={() => onEdit(s)}
                title={`${s.name}\n${s.url}\nkey: ${s.key}`}
              >
                <div
                  className="admin-icon-circle"
                  style={{ background: s.color || 'var(--accent)' }}
                >
                  {isImg ? (
                    <img src={s.icon} alt="" />
                  ) : (
                    <span>{s.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="admin-icon-label">{s.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── User detail modal ──────────────────────────────────────────────────────
function UserDetail({ user, sites, grants, adminCode, onClose, onChanged }) {
  const [localGrants, setLocalGrants] = useState(() => new Set(grants || []))
  const [savingSites, setSavingSites] = useState(new Set())
  const [code, setCode] = useState(user.code || '')
  const [codeSaving, setCodeSaving] = useState(false)
  const [codeMsg, setCodeMsg] = useState('')
  const [codeErr, setCodeErr] = useState('')

  async function toggleSite(siteId) {
    const had = localGrants.has(siteId)
    const grant = !had
    // Warn when granting non-default site to a client
    if (grant && user.user_type === 'ef_client') {
      const site = sites.find((s) => s.id === siteId)
      const isEventday = site && /eventday\.dk/i.test(site.url)
      if (!isEventday) {
        const ok = confirm(
          `Advarsel: Kunden "${user.name}" logger normalt kun ind på eventday.dk.\n\n` +
          `Vil du virkelig give dem adgang til "${site?.name || 'dette site'}"?`
        )
        if (!ok) return
      }
    }
    setLocalGrants((prev) => {
      const next = new Set(prev)
      if (grant) next.add(siteId)
      else next.delete(siteId)
      return next
    })
    setSavingSites((prev) => new Set(prev).add(siteId))
    try {
      await callAdmin(adminCode, 'toggle', {
        user_type: user.user_type,
        user_id: user.user_id,
        site_id: siteId,
        grant,
      })
      onChanged?.({ type: 'toggle', user, site_id: siteId, grant })
    } catch (e) {
      // rollback
      setLocalGrants((prev) => {
        const next = new Set(prev)
        if (grant) next.delete(siteId)
        else next.add(siteId)
        return next
      })
    } finally {
      setSavingSites((prev) => {
        const next = new Set(prev)
        next.delete(siteId)
        return next
      })
    }
  }

  async function saveCode() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setCodeErr('Kode må ikke være tom.')
      return
    }
    if (!/^[A-Z0-9]{3,8}$/.test(trimmed)) {
      setCodeErr('3–8 tegn, kun A–Z og 0–9.')
      return
    }
    setCodeErr('')
    setCodeMsg('')
    setCodeSaving(true)
    try {
      const res = await callAdmin(adminCode, 'update_user_code', {
        user_type: user.user_type,
        user_id: user.user_id,
        code: trimmed,
      })
      setCode(res.code || trimmed)
      setCodeMsg('Gemt')
      onChanged?.({ type: 'code', user, code: res.code || trimmed })
      setTimeout(() => setCodeMsg(''), 2000)
    } catch (e) {
      const msg = e.message
      if (msg === 'bad_code_length') setCodeErr('3–8 tegn påkrævet.')
      else if (msg === 'bad_code_format') setCodeErr('Kun A–Z og 0–9.')
      else if (msg === 'code_taken') setCodeErr(`Koden "${trimmed}" er allerede i brug af en anden bruger.`)
      else setCodeErr(`Kunne ikke gemme: ${msg}`)
    } finally {
      setCodeSaving(false)
    }
  }

  const roleLabel = ROLE_LABELS[user.role] || user.role

  return (
    <div className="admin-modal-bg" onClick={onClose}>
      <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-user-head">
          <div>
            <h2 className="admin-h2" style={{ marginBottom: 4 }}>{user.name}</h2>
            <div className="admin-user-sub">
              <span className={`admin-role admin-role--${user.role}`}>{roleLabel}</span>
              <span>{user.subtitle}</span>
            </div>
            {(user.email || user.phone) && (
              <div className="admin-user-meta" style={{ marginTop: 6 }}>
                {user.email && <span>{user.email}</span>}
                {user.phone && <span>{user.phone}</span>}
              </div>
            )}
          </div>
          <button className="admin-btn admin-btn--ghost" onClick={onClose} aria-label="Luk">✕</button>
        </div>

        {/* Code editor */}
        <section className="admin-user-section">
          <h3 className="admin-h3">Login-kode</h3>
          <p className="admin-sub" style={{ marginBottom: 12 }}>3–8 tegn, A–Z og 0–9.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input
              className="admin-input admin-input--code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
                setCodeErr('')
                setCodeMsg('')
              }}
              placeholder="4027"
              style={{ flex: 1, maxWidth: 200, marginBottom: 0 }}
              disabled={codeSaving}
            />
            <button
              className="admin-btn admin-btn--primary"
              style={{ width: 'auto' }}
              onClick={saveCode}
              disabled={codeSaving || !code || code === (user.code || '')}
            >
              {codeSaving ? 'Gemmer…' : 'Gem kode'}
            </button>
          </div>
          {codeErr && <div className="admin-error" style={{ marginTop: 8 }}>{codeErr}</div>}
          {codeMsg && <div className="admin-success" style={{ marginTop: 8 }}>{codeMsg}</div>}
        </section>

        {user.user_type === 'ef_client' && (
          <div className="admin-info-box">
            <strong>Kunde-login:</strong> Logger altid ind på <b>eventday.dk</b> og redirectes til kundens portal.
            Tilføj kun ekstra sites hvis kunden skal have adgang til andre områder.
          </div>
        )}

        {/* Site access */}
        <section className="admin-user-section">
          <h3 className="admin-h3">Adgang til projekter</h3>
          {sites.length === 0 ? (
            <div className="admin-empty">Ingen sites oprettet endnu.</div>
          ) : (
            <SiteAccessTree
              sites={sites}
              localGrants={localGrants}
              savingSites={savingSites}
              onToggle={toggleSite}
            />
          )}
        </section>
      </div>
    </div>
  )
}

// ── Main access-management view ────────────────────────────────────────────
function AccessManager({ session, initialData, onLogout }) {
  const [sites, setSites] = useState(initialData.sites)
  const [users, setUsers] = useState(initialData.users)
  const [access, setAccess] = useState(() => buildAccessSet(initialData.access))
  const [filter, setFilter] = useState('employee') // default to Crew tab
  const [search, setSearch] = useState('')
  const [editingSite, setEditingSite] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [err, setErr] = useState('')
  const [usersOpen, setUsersOpen] = useState(false)

  const refreshAll = useCallback(async () => {
    try {
      const data = await callAdmin(session.code, 'list')
      setSites(data.sites)
      setUsers(data.users)
      setAccess(buildAccessSet(data.access))
    } catch (e) {
      setErr(e.message)
    }
  }, [session.code])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matchFields = (u) =>
      !q ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.code || '').toLowerCase().includes(q)

    return users.filter((u) => {
      if (filter === 'employee') {
        if (!(u.user_type === 'employee' && u.role === 'crew')) return false
      } else if (filter === 'ef_admin') {
        const isAdminEmp = u.user_type === 'employee' && u.role === 'admin'
        if (!(u.user_type === 'ef_admin' || isAdminEmp)) return false
      } else if (filter === 'venue') {
        if (u.user_type !== 'venue') return false
      } else if (filter !== 'all' && u.user_type !== filter) {
        return false
      }
      if (matchFields(u)) return true
      if (u.user_type === 'ef_client' && Array.isArray(u.contacts)) {
        return u.contacts.some(matchFields)
      }
      return false
    })
  }, [users, filter, search])

  async function saveSite(form) {
    try {
      await callAdmin(session.code, 'site_upsert', { site: form })
      setEditingSite(null)
      await refreshAll()
    } catch (e) {
      setErr(e.message)
    }
  }
  // (admins are auto-granted to new sites by the edge function)

  async function setUserCode(user, code) {
    try {
      const res = await callAdmin(session.code, 'update_user_code', {
        user_type: user.user_type,
        user_id: user.user_id,
        code,
      })
      const newCode = res.code || code
      setUsers((prev) =>
        prev.map((u) => {
          // Top-level match
          if (u.user_type === user.user_type && u.user_id === user.user_id) {
            return { ...u, code: newCode }
          }
          // Nested contact under a client
          if (u.user_type === 'ef_client' && Array.isArray(u.contacts)) {
            const hit = u.contacts.some(
              (c) => c.user_type === user.user_type && c.user_id === user.user_id
            )
            if (hit) {
              return {
                ...u,
                contacts: u.contacts.map((c) =>
                  c.user_type === user.user_type && c.user_id === user.user_id
                    ? { ...c, code: newCode }
                    : c
                ),
              }
            }
          }
          return u
        })
      )
      return newCode
    } catch (e) {
      const msg = e.message === 'code_taken'
        ? `Koden "${code}" er allerede i brug af en anden bruger.`
        : e.message === 'bad_code_format'
          ? `Ugyldig kode "${code}" (kun A–Z og 0–9).`
          : `Kunne ikke gemme kode: ${e.message}`
      setErr(msg)
      return null
    }
  }

  async function deleteSite(id) {
    if (!confirm('Slet dette site? Alle adgange fjernes.')) return
    try {
      await callAdmin(session.code, 'site_delete', { site_id: id })
      setEditingSite(null)
      await refreshAll()
    } catch (e) {
      setErr(e.message)
    }
  }

  // Called by UserDetail on changes so parent stays in sync
  const handleUserChanged = useCallback((evt) => {
    if (evt.type === 'toggle') {
      setAccess((prev) => {
        const next = new Map(prev)
        const key = `${evt.user.user_type}|${evt.user.user_id}`
        const set = new Set(next.get(key) || [])
        if (evt.grant) set.add(evt.site_id)
        else set.delete(evt.site_id)
        next.set(key, set)
        return next
      })
    } else if (evt.type === 'code') {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_type === evt.user.user_type && u.user_id === evt.user.user_id
            ? { ...u, code: evt.code }
            : u
        )
      )
      // also update selectedUser so modal shows the new code
      setSelectedUser((cur) =>
        cur && cur.user_type === evt.user.user_type && cur.user_id === evt.user.user_id
          ? { ...cur, code: evt.code }
          : cur
      )
    }
  }, [])

  const counts = useMemo(() => {
    const c = { crew: 0, admin: 0, ef_client: 0, ef_contact: 0, venue: 0 }
    for (const u of users) {
      if (u.user_type === 'employee') {
        if (u.role === 'crew') c.crew++
        else if (u.role === 'admin') c.admin++
      } else if (u.user_type === 'ef_admin') {
        c.admin++
      } else if (u.user_type === 'ef_client') {
        c.ef_client++
        if (Array.isArray(u.contacts)) c.ef_contact += u.contacts.length
      } else if (u.user_type === 'venue') {
        c.venue++
      }
    }
    return c
  }, [users])

  const selectedUserGrants = useMemo(() => {
    if (!selectedUser) return new Set()
    return access.get(`${selectedUser.user_type}|${selectedUser.user_id}`) || new Set()
  }, [selectedUser, access])

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1 className="admin-h1">Access Management</h1>
          <p className="admin-sub">Logget ind som <strong>{session.name}</strong></p>
        </div>
        <div className="admin-header-actions">
          <button className="admin-btn" onClick={refreshAll}>Opdater</button>
          <button className="admin-btn admin-btn--ghost" onClick={onLogout}>Log ud</button>
        </div>
      </header>

      {err && (
        <div className="admin-error" style={{ marginBottom: 16 }}>
          {err} <button className="admin-btn admin-btn--tiny" onClick={() => setErr('')}>OK</button>
        </div>
      )}

      {/* Sites — collapsible, hierarchical */}
      <SitesSection
        sites={sites}
        onEdit={setEditingSite}
        onSetParent={async (childId, parentId) => {
          const child = sites.find((s) => s.id === childId)
          if (!child) return
          try {
            await callAdmin(session.code, 'site_upsert', {
              site: { ...child, parent_id: parentId },
            })
            await refreshAll()
          } catch (e) { setErr(e.message) }
        }}
        onAdd={() => setEditingSite({})}
      />

      {/* Users — collapsible */}
      <section className="admin-section">
        <div
          className="admin-section-head admin-section-head--toggle"
          onClick={() => setUsersOpen((v) => !v)}
        >
          <h2 className="admin-h2">
            <span className="admin-collapse-icon">{usersOpen ? '▾' : '▸'}</span>
            Users ({filteredUsers.length} / {users.length})
          </h2>
        </div>
        {usersOpen && (
          <>
            <div className="admin-filters">
              <input
                className="admin-input"
                placeholder="Søg navn, email, telefon, kode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 200 }}
              />
              <div className="admin-tabs">
                {[
                  { k: 'all', l: `Alle (${users.length})` },
                  { k: 'employee', l: `Crew (${counts.crew})` },
                  { k: 'ef_admin', l: `Admin (${counts.admin})` },
                  { k: 'ef_client', l: `Klienter (${counts.ef_client})` },
                  { k: 'venue', l: `Venues (${counts.venue})` },
                ].map((tab) => (
                  <button
                    key={tab.k}
                    className={`admin-tab ${filter === tab.k ? 'active' : ''}`}
                    onClick={() => setFilter(tab.k)}
                  >
                    {tab.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-icon-grid">
              {filteredUsers.map((u) => (
                <UserIconBtn
                  key={`${u.user_type}|${u.user_id}`}
                  user={u}
                  onClick={setSelectedUser}
                />
              ))}
              {filteredUsers.length === 0 && (
                <div className="admin-empty">Ingen brugere matcher søgningen.</div>
              )}
            </div>
          </>
        )}
      </section>

      {editingSite !== null && (
        <SiteEditor
          site={editingSite.id ? editingSite : null}
          allSites={sites}
          onSave={saveSite}
          onCancel={() => setEditingSite(null)}
          onDelete={deleteSite}
        />
      )}

      {selectedUser && (
        <UserDetail
          user={selectedUser}
          sites={sites}
          grants={selectedUserGrants}
          adminCode={session.code}
          onClose={() => setSelectedUser(null)}
          onChanged={handleUserChanged}
        />
      )}
    </div>
  )
}

// ── Top-level component ───────────────────────────────────────────────────
export default function AdminAccess() {
  const [session, setSession] = useState(null)
  const [data, setData] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const s = loadSession()
    if (!s) {
      setBooting(false)
      return
    }
    callAdmin(s.code, 'list')
      .then((d) => {
        setSession(s)
        setData(d)
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
      })
      .finally(() => setBooting(false))
  }, [])

  function handleLogin(newSession, newData) {
    setSession(newSession)
    setData(newData)
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setData(null)
  }

  if (booting) {
    return <div className="admin-center"><div className="admin-card">Henter…</div></div>
  }

  if (!session || !data) {
    return <AdminLogin onLogin={handleLogin} />
  }

  return <AccessManager session={session} initialData={data} onLogout={handleLogout} />
}
