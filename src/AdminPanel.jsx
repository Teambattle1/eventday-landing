import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import SVGIcon from './components/icons/SVGIcon'

// ── API helper ──────────────────────────────────────────────────────────────
async function api(adminCode, action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('ef-admin-access', {
    body: { adminCode, action, ...extra },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// ── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'sites', label: 'Sites' },
  { key: 'users', label: 'Brugere' },
  { key: 'access', label: 'Adgang' },
]

// ── Site edit modal ─────────────────────────────────────────────────────────
function SiteModal({ site, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    key: site?.key || '',
    name: site?.name || '',
    url: site?.url || '',
    color: site?.color || '#d4640a',
    sort_order: site?.sort_order ?? 0,
    active: site?.active !== false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 600, margin: '0 0 20px', color: 'var(--text)' }}>
          {site?.id ? 'Rediger site' : 'Ny site'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Key', key: 'key', placeholder: 'f.eks. game-teamplay' },
            { label: 'Navn', key: 'name', placeholder: 'TeamPlay' },
            { label: 'URL', key: 'url', placeholder: 'https://...' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, width: '100%', padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--r)', background: 'var(--surface2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Farve</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }} />
                <input value={form.color} onChange={e => set('color', e.target.value)} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, flex: 1, padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--r)', background: 'var(--surface2)', color: 'var(--text)', outline: 'none' }} />
              </div>
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Sort</label>
              <input type="number" value={form.sort_order} onChange={e => set('sort_order', +e.target.value)} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, width: '100%', padding: '10px 12px', border: '1.5px solid var(--border2)', borderRadius: 'var(--r)', background: 'var(--surface2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <label style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
            Aktiv
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 16px', border: '1.5px solid var(--border2)', borderRadius: 'var(--r)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Annuller
          </button>
          <button disabled={saving || !form.key || !form.name || !form.url} onClick={() => onSave({ ...form, id: site?.id })} style={{ flex: 1, padding: '11px 16px', border: 'none', borderRadius: 'var(--r)', background: 'var(--accent)', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Gemmer...' : 'Gem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Code edit inline ────────────────────────────────────────────────────────
function CodeEditor({ user, adminCode, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(user.code || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function save() {
    if (!value.trim()) return
    setSaving(true)
    setError('')
    try {
      await api(adminCode, 'update_user_code', { user_type: user.user_type, user_id: user.user_id, code: value.trim() })
      onUpdate(value.trim().toUpperCase())
      setEditing(false)
    } catch (e) {
      setError(e.message === 'code_taken' ? 'Kode er optaget' : e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button onClick={() => { setValue(user.code || ''); setEditing(true); setError('') }} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, color: user.code ? 'var(--accent)' : 'var(--dim)', background: user.code ? 'var(--accent-dim)' : 'var(--surface2)', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.08em' }}>
        {user.code || '---'}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input ref={inputRef} value={value} onChange={e => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} onKeyDown={e => e.key === 'Enter' && save()} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, width: 72, padding: '4px 8px', border: '1.5px solid var(--accent)', borderRadius: 6, outline: 'none', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--surface)', color: 'var(--text)' }} />
      <button onClick={save} disabled={saving} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>OK</button>
      <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 13, padding: '4px' }}>x</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 11, fontFamily: "'Outfit', sans-serif" }}>{error}</span>}
    </div>
  )
}

// ── User type labels ────────────────────────────────────────────────────────
const TYPE_META = {
  employee: { label: 'Medarbejdere', color: 'var(--blue)' },
  ef_admin: { label: 'EventDay Admins', color: 'var(--accent)' },
  ef_client: { label: 'Kunder', color: 'var(--green)' },
  ef_contact: { label: 'Kontaktpersoner', color: 'var(--gold)' },
  venue: { label: 'Venues', color: 'var(--red)' },
}

// ═════════════════════════════════════════════════════════════════════════════
export default function AdminPanel() {
  const [adminCode, setAdminCode] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const [data, setData] = useState(null) // { adminName, sites, users, access }
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('sites')

  // Site modal
  const [editSite, setEditSite] = useState(null) // null | {} for new | site obj
  const [savingSite, setSavingSite] = useState(false)

  // Access toggle
  const [toggling, setToggling] = useState(null) // 'type|id|siteId'

  const codeRef = useRef(null)

  // ── Auth ─────────────────────────────────────────────────────────────────
  async function handleAuth(code) {
    setAuthLoading(true)
    setAuthError('')
    try {
      const result = await api(code, 'list')
      setData(result)
      setAdminCode(code)
      setAuthed(true)
    } catch {
      setAuthError('Ugyldig admin-kode')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleCodeInput(e) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    setAdminCode(val)
    setAuthError('')
    if (val.length === 4) handleAuth(val)
  }

  // ── Reload data ──────────────────────────────────────────────────────────
  async function reload() {
    setLoading(true)
    try {
      const result = await api(adminCode, 'list')
      setData(result)
    } catch (e) {
      console.error('Reload error:', e)
    } finally {
      setLoading(false)
    }
  }

  // ── Site save ────────────────────────────────────────────────────────────
  async function handleSaveSite(form) {
    setSavingSite(true)
    try {
      await api(adminCode, 'site_upsert', { site: form })
      setEditSite(null)
      await reload()
    } catch (e) {
      alert('Fejl: ' + e.message)
    } finally {
      setSavingSite(false)
    }
  }

  async function handleDeleteSite(siteId) {
    if (!confirm('Slet dette site?')) return
    try {
      await api(adminCode, 'site_delete', { site_id: siteId })
      await reload()
    } catch (e) {
      alert('Fejl: ' + e.message)
    }
  }

  // ── Access toggle ────────────────────────────────────────────────────────
  async function handleToggle(user, siteId, grant) {
    const key = `${user.user_type}|${user.user_id}|${siteId}`
    setToggling(key)
    try {
      await api(adminCode, 'toggle', { user_type: user.user_type, user_id: user.user_id, site_id: siteId, grant })
      // Update local state
      setData(prev => {
        const access = [...(prev.access || [])]
        if (grant) {
          access.push({ user_type: user.user_type, user_id: user.user_id, site_id: siteId })
        } else {
          const idx = access.findIndex(a => a.user_type === user.user_type && a.user_id === user.user_id && a.site_id === siteId)
          if (idx >= 0) access.splice(idx, 1)
        }
        return { ...prev, access }
      })
    } catch (e) {
      alert('Fejl: ' + e.message)
    } finally {
      setToggling(null)
    }
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--accent)', padding: '28px 36px 24px', textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>EventDay Admin</h1>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Indtast admin-kode</p>
          </div>
          <div style={{ padding: '32px 36px 28px' }}>
            <input
              ref={codeRef}
              autoFocus
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={4}
              value={adminCode}
              onChange={handleCodeInput}
              disabled={authLoading}
              placeholder="_ _ _ _"
              style={{ fontFamily: "'Outfit', sans-serif", fontSize: '2rem', fontWeight: 700, letterSpacing: '0.35em', textAlign: 'center', textTransform: 'uppercase', width: '100%', padding: '14px 12px', border: '2px solid var(--border2)', borderRadius: 'var(--r)', background: 'var(--surface2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
            />
            {authError && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--red-dim)', borderRadius: 8, color: 'var(--red)', fontSize: 13, fontFamily: "'Outfit', sans-serif", display: 'flex', gap: 6, alignItems: 'center' }}>
                <SVGIcon name="alert-circle" size={14} /> {authError}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const sites = data?.sites || []
  const users = data?.users || []
  const access = data?.access || []
  const topSites = sites.filter(s => !s.parent_id)
  const childSites = sites.filter(s => s.parent_id)

  const hasAccess = (userType, userId, siteId) => access.some(a => a.user_type === userType && a.user_id === userId && a.site_id === siteId)

  const grouped = {}
  for (const u of users) {
    if (!grouped[u.user_type]) grouped[u.user_type] = []
    grouped[u.user_type].push(u)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--accent)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>EventDay Admin</h1>
          <div style={{ display: 'flex', gap: 2 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.6)', background: tab === t.key ? 'rgba(255,255,255,0.18)' : 'transparent', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{data?.adminName}</span>
          <button onClick={() => { setAuthed(false); setAdminCode(''); setData(null) }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 12, padding: '5px 12px', borderRadius: 5, cursor: 'pointer' }}>Log ud</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 32px' }}>

        {/* ══ SITES TAB ═══════════════════════════════════════════════════════ */}
        {tab === 'sites' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Sites ({sites.length})
              </h2>
              <button onClick={() => setEditSite({})} style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', padding: '8px 16px', borderRadius: 'var(--r)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                + Ny site
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {sites.map(site => (
                <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', borderRadius: 10, borderLeft: `4px solid ${site.color || 'var(--border2)'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', opacity: site.active ? 1 : 0.5 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: (site.color || '#ccc') + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SVGIcon name="external-link" size={14} color={site.color || 'var(--dim)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.key}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setEditSite(site)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 5, padding: '5px 8px', cursor: 'pointer', color: 'var(--muted)', fontSize: 11, fontFamily: "'Outfit', sans-serif" }}>Ret</button>
                    <button onClick={() => handleDeleteSite(site.id)} style={{ background: 'var(--red-dim)', border: 'none', borderRadius: 5, padding: '5px 8px', cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontFamily: "'Outfit', sans-serif" }}>Slet</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ USERS TAB ═══════════════════════════════════════════════════════ */}
        {tab === 'users' && (
          <div>
            {['employee', 'ef_admin', 'ef_client', 'venue'].map(type => {
              const list = grouped[type] || []
              if (!list.length) return null
              const meta = TYPE_META[type]
              return (
                <div key={type} style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                    {meta.label} ({list.length})
                  </h2>
                  <div style={{ background: 'var(--surface)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Outfit', sans-serif", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Navn</th>
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Info</th>
                          <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rolle</th>
                          <th style={{ textAlign: 'center', padding: '10px 16px', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Kode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((user, i) => (
                          <tr key={user.user_id} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                            <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)' }}>{user.name}</td>
                            <td style={{ padding: '10px 16px', color: 'var(--dim)' }}>{user.email || user.phone || '---'}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, background: meta.color + '14', padding: '3px 8px', borderRadius: 4 }}>{user.subtitle}</span>
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                              <CodeEditor user={user} adminCode={adminCode} onUpdate={(newCode) => {
                                setData(prev => ({
                                  ...prev,
                                  users: prev.users.map(u => u.user_type === user.user_type && u.user_id === user.user_id ? { ...u, code: newCode } : u)
                                }))
                              }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Nested contacts for clients */}
                  {type === 'ef_client' && list.some(c => c.contacts?.length > 0) && (
                    <div style={{ marginTop: 16 }}>
                      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', paddingLeft: 16 }}>
                        Kontaktpersoner
                      </h3>
                      <div style={{ background: 'var(--surface)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Outfit', sans-serif", fontSize: 13 }}>
                          <tbody>
                            {list.flatMap(client => (client.contacts || []).map((contact, i) => (
                              <tr key={contact.user_id} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                                <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)' }}>{contact.name}</td>
                                <td style={{ padding: '10px 16px', color: 'var(--dim)' }}>{contact.email || contact.phone || '---'}</td>
                                <td style={{ padding: '10px 16px' }}>
                                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>{client.name}</span>
                                </td>
                                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                  <CodeEditor user={contact} adminCode={adminCode} onUpdate={(newCode) => {
                                    setData(prev => ({
                                      ...prev,
                                      users: prev.users.map(u => {
                                        if (u.user_type === 'ef_client' && u.user_id === client.user_id) {
                                          return { ...u, contacts: (u.contacts || []).map(c => c.user_id === contact.user_id ? { ...c, code: newCode } : c) }
                                        }
                                        return u
                                      })
                                    }))
                                  }} />
                                </td>
                              </tr>
                            )))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ ACCESS TAB ══════════════════════════════════════════════════════ */}
        {tab === 'access' && (
          <div style={{ overflowX: 'auto' }}>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
              Adgangsmatrix
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Outfit', sans-serif", fontSize: 12, background: 'var(--surface)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', position: 'sticky', left: 0, background: 'var(--surface2)', minWidth: 160 }}>Bruger</th>
                  {sites.filter(s => s.key !== 'admin').map(site => (
                    <th key={site.id} style={{ padding: '10px 6px', fontWeight: 600, color: site.color || 'var(--muted)', fontSize: 10, textTransform: 'uppercase', textAlign: 'center', minWidth: 50, whiteSpace: 'nowrap' }}>
                      <div style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: 60, display: 'flex', alignItems: 'center' }}>{site.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['employee', 'ef_admin', 'ef_client', 'venue'].map(type => {
                  const list = grouped[type] || []
                  if (!list.length) return null
                  const meta = TYPE_META[type]
                  return list.map((user, i) => (
                    <tr key={`${type}-${user.user_id}`} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 14px', position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: meta.color, marginRight: 8 }} />
                        {user.name}
                      </td>
                      {sites.filter(s => s.key !== 'admin').map(site => {
                        const has = hasAccess(user.user_type, user.user_id, site.id)
                        const key = `${user.user_type}|${user.user_id}|${site.id}`
                        const isToggling = toggling === key
                        return (
                          <td key={site.id} style={{ textAlign: 'center', padding: '8px 6px' }}>
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={isToggling}
                              onChange={() => handleToggle(user, site.id, !has)}
                              style={{ cursor: isToggling ? 'wait' : 'pointer', accentColor: 'var(--accent)', width: 15, height: 15 }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Site modal */}
      {editSite !== null && <SiteModal site={editSite} onSave={handleSaveSite} onClose={() => setEditSite(null)} saving={savingSite} />}
    </div>
  )
}
