import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import SVGIcon from './components/icons/SVGIcon'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 60
const CODE_LENGTH = 4

// Lille spinner-komponent
function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ animation: 'ed-spin 0.75s linear infinite', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  )
}

// Projekt-ikon baseret på type
function ProjectBadge({ project, label }) {
  const colors = {
    crew: { bg: 'var(--blue-dim)', color: 'var(--blue)', icon: 'lock' },
    occ: { bg: 'var(--green-dim)', color: 'var(--green)', icon: 'lock' },
    flow: { bg: 'var(--accent-dim)', color: 'var(--accent)', icon: 'lock' },
  }
  const c = colors[project] || colors.flow

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        background: c.bg,
        borderRadius: 'var(--r)',
        marginBottom: '16px',
      }}
    >
      <SVGIcon name="external-link" size={16} color={c.color} />
      <span
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: '14px',
          fontWeight: '600',
          color: c.color,
        }}
      >
        {label}
      </span>
    </div>
  )
}

export default function Landing() {
  // Kode-input
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect-indikator
  const [redirecting, setRedirecting] = useState(null) // { project, label, redirectUrl }

  // Lockout
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [lockCountdown, setLockCountdown] = useState(0)

  // Glemt kode-flow
  const [showForgotFlow, setShowForgotFlow] = useState(false)
  const [forgotPhone, setForgotPhone] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const codeInputRef = useRef(null)

  // ── Nedtællings-timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setLockCountdown(0)
        setAttempts(0)
        setError('')
        clearInterval(interval)
      } else {
        setLockCountdown(remaining)
      }
    }, 250)
    return () => clearInterval(interval)
  }, [lockedUntil])

  // ── URL-param ?code=XX → prefill + auto-login ─────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlCode = params.get('code')
    if (urlCode) {
      const normalized = urlCode.toUpperCase().slice(0, CODE_LENGTH)
      setCode(normalized)
      if (normalized.length === CODE_LENGTH) {
        setTimeout(() => submitCode(normalized), 80)
      }
    } else {
      codeInputRef.current?.focus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Registrér mislykket forsøg ────────────────────────────────────────────
  const registerFailedAttempt = useCallback((currentAttempts) => {
    const next = currentAttempts + 1
    setAttempts(next)
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000
      setLockedUntil(until)
      setLockCountdown(LOCKOUT_SECONDS)
      setError(`For mange forsøg. Prøv igen om ${LOCKOUT_SECONDS} sekunder.`)
    }
    return next
  }, [])

  // ── Kode-input-handler ────────────────────────────────────────────────────
  function handleCodeChange(e) {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
    setCode(val)
    setError('')
    if (val.length === CODE_LENGTH) {
      submitCode(val)
    }
  }

  // ── Submit kode ───────────────────────────────────────────────────────────
  async function submitCode(codeToCheck) {
    if (lockedUntil && Date.now() < lockedUntil) return
    if (loading) return

    setLoading(true)
    setError('')

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ed-verify-code', {
        body: { code: codeToCheck },
      })

      if (fnError) throw fnError

      if (data?.type === 'redirect' && data.redirectUrl) {
        // Vis kort redirect-besked, så navigér
        setRedirecting({
          project: data.project,
          label: data.label,
          redirectUrl: data.redirectUrl,
        })
        setTimeout(() => {
          window.location.href = data.redirectUrl
        }, 600)
        return
      }

      // Ukendt kode
      setError('Ukendt kode – prøv igen')
      registerFailedAttempt(attempts)
    } catch (err) {
      console.error('[EventDay] verify-code fejl:', err)
      setError('Noget gik galt. Tjek forbindelsen og prøv igen.')
    } finally {
      setLoading(false)
    }
  }

  // ── Glemt kode – send SMS ─────────────────────────────────────────────────
  async function handleForgotSubmit(e) {
    e.preventDefault()
    if (!forgotPhone.trim()) return

    setForgotLoading(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ed-forgot-code', {
        body: { phone: forgotPhone.trim() },
      })

      if (fnError) throw fnError

      if (data?.error === 'not_found') {
        setError('Telefonnummeret blev ikke fundet.')
        setForgotLoading(false)
        return
      }

      setForgotSent(true)
    } catch (err) {
      console.error('[EventDay] forgot-code fejl:', err)
      setError('Kunne ikke sende SMS. Prøv igen.')
    } finally {
      setForgotLoading(false)
    }
  }

  function resetForgotFlow() {
    setShowForgotFlow(false)
    setForgotPhone('')
    setForgotSent(false)
    setError('')
    setTimeout(() => codeInputRef.current?.focus(), 80)
  }

  // ── Afledt tilstand ───────────────────────────────────────────────────────
  const isLocked = Boolean(lockedUntil && Date.now() < lockedUntil)
  const codeComplete = code.length === CODE_LENGTH

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes ed-spin { to { transform: rotate(360deg); } }
        @keyframes ed-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ed-landing-card { animation: ed-fade-in 0.35s ease both; }
        .ed-code-input {
          font-family: 'Outfit', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: 0.35em;
          text-align: center;
          text-transform: uppercase;
          width: 100%;
          padding: 16px 12px;
          border: 2px solid var(--border2);
          border-radius: var(--r);
          background: var(--surface2);
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          caret-color: var(--accent);
        }
        .ed-code-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-dim);
          background: var(--surface);
        }
        .ed-code-input:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .ed-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px 20px;
          background: var(--accent);
          color: #ffffff;
          border: none;
          border-radius: var(--r);
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s, transform 0.1s;
        }
        .ed-btn-primary:hover:not(:disabled) {
          background: var(--accent-l);
        }
        .ed-btn-primary:active:not(:disabled) {
          transform: scale(0.98);
        }
        .ed-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ed-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--muted);
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          cursor: pointer;
          padding: 6px 0;
          transition: color 0.15s;
        }
        .ed-btn-ghost:hover { color: var(--text); }
        .ed-text-input {
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          width: 100%;
          padding: 12px 14px;
          border: 2px solid var(--border2);
          border-radius: var(--r);
          background: var(--surface2);
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ed-text-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-dim);
          background: var(--surface);
        }
        .ed-text-input::placeholder { color: var(--dim); }
        .ed-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          background: var(--red-dim);
          border: 1px solid rgba(192,48,48,0.18);
          border-radius: 8px;
          color: var(--red);
          font-size: 14px;
          line-height: 1.45;
        }
        .ed-dots span {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: ed-dot-pulse 1.2s ease-in-out infinite;
        }
        .ed-dots span:nth-child(2) { animation-delay: 0.2s; }
        .ed-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes ed-dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        {/* Kortet */}
        <div
          className="ed-landing-card"
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'var(--surface)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Brand-header */}
          <div
            style={{
              background: 'var(--accent)',
              padding: '32px 40px 28px',
              textAlign: 'center',
            }}
          >
            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '28px',
                fontWeight: '700',
                color: '#ffffff',
                margin: '0 0 4px',
                letterSpacing: '0.02em',
              }}
            >
              EventDay
            </h1>
            <p
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '14px',
                color: 'rgba(255,255,255,0.78)',
                margin: 0,
                letterSpacing: '0.01em',
              }}
            >
              Log ind med din kode
            </p>
          </div>

          {/* Kortindhold */}
          <div style={{ padding: '36px 40px 32px' }}>

            {/* ══ REDIRECTING ═══════════════════════════════════════════════ */}
            {redirecting ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <ProjectBadge project={redirecting.project} label={redirecting.label} />
                <div
                  className="ed-dots"
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px 0 8px',
                  }}
                >
                  <span />
                  <span />
                  <span />
                </div>
                <p
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '14px',
                    color: 'var(--muted)',
                    margin: '8px 0 0',
                  }}
                >
                  Sender dig videre...
                </p>
              </div>

            /* ══ GLEMT KODE-FLOW ════════════════════════════════════════════ */
            ) : showForgotFlow ? (
              <div>
                <button className="ed-btn-ghost" onClick={resetForgotFlow} style={{ marginBottom: '20px' }}>
                  <SVGIcon name="arrow-left" size={16} />
                  Tilbage
                </button>

                {forgotSent ? (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: 'var(--green-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                      }}
                    >
                      <SVGIcon name="check-circle" size={26} color="var(--green)" />
                    </div>
                    <p
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '15px',
                        color: 'var(--text)',
                        margin: '0 0 8px',
                        fontWeight: '600',
                      }}
                    >
                      Kode sendt
                    </p>
                    <p
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '14px',
                        color: 'var(--muted)',
                        margin: '0 0 24px',
                      }}
                    >
                      Tjek din telefon for en SMS med din adgangskode.
                    </p>
                    <button className="ed-btn-primary" onClick={resetForgotFlow}>
                      Log ind
                      <SVGIcon name="arrow-right" size={16} />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit}>
                    <p
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '15px',
                        color: 'var(--text)',
                        margin: '0 0 20px',
                        lineHeight: '1.5',
                      }}
                    >
                      Indtast dit telefonnummer, og vi sender din adgangskode via SMS.
                    </p>

                    <label
                      htmlFor="forgot-phone"
                      style={{
                        display: 'block',
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--muted)',
                        marginBottom: '8px',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Telefonnummer
                    </label>
                    <div style={{ position: 'relative', marginBottom: '20px' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--dim)',
                          pointerEvents: 'none',
                        }}
                      >
                        <SVGIcon name="phone" size={16} />
                      </span>
                      <input
                        id="forgot-phone"
                        type="tel"
                        className="ed-text-input"
                        placeholder="+45 XX XX XX XX"
                        value={forgotPhone}
                        onChange={(e) => setForgotPhone(e.target.value)}
                        style={{ paddingLeft: '40px' }}
                        autoComplete="tel"
                      />
                    </div>

                    {error && (
                      <div className="ed-error" style={{ marginBottom: '16px' }}>
                        <SVGIcon name="alert-circle" size={15} />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="ed-btn-primary"
                      disabled={forgotLoading || !forgotPhone.trim()}
                    >
                      {forgotLoading ? <Spinner /> : <SVGIcon name="send" size={16} />}
                      {forgotLoading ? 'Sender...' : 'Send kode via SMS'}
                    </button>
                  </form>
                )}
              </div>

            /* ══ HOVED-LOGIN (kode-input) ════════════════════════════════════ */
            ) : (
              <div>
                <label
                  htmlFor="access-code"
                  style={{
                    display: 'block',
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--muted)',
                    marginBottom: '10px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Din adgangskode
                </label>

                {/* Kode-input */}
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <input
                    id="access-code"
                    ref={codeInputRef}
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={CODE_LENGTH}
                    className="ed-code-input"
                    value={code}
                    onChange={handleCodeChange}
                    disabled={loading || isLocked}
                    placeholder="_ _ _ _"
                    aria-label="4-tegns adgangskode"
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                  {loading && (
                    <div
                      style={{
                        position: 'absolute',
                        right: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Spinner />
                    </div>
                  )}
                </div>

                {/* Fejlbesked */}
                {error && (
                  <div id="login-error" className="ed-error" style={{ marginBottom: '16px' }}>
                    <SVGIcon name="alert-circle" size={15} />
                    <span>{isLocked ? `Låst i ${lockCountdown}s – for mange forsøg` : error}</span>
                  </div>
                )}

                {/* Submit-knap */}
                {!loading && (
                  <button
                    type="button"
                    className="ed-btn-primary"
                    disabled={!codeComplete || loading || isLocked}
                    onClick={() => submitCode(code)}
                    style={{ marginBottom: '20px' }}
                  >
                    <SVGIcon name="arrow-right" size={16} />
                    Fortsæt
                  </button>
                )}

                {/* Loading dots */}
                {loading && (
                  <div
                    className="ed-dots"
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '12px 0 20px',
                    }}
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                )}

                {/* Glemt kode */}
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="ed-btn-ghost"
                    onClick={() => { setShowForgotFlow(true); setError('') }}
                    disabled={loading}
                  >
                    <SVGIcon name="phone" size={14} />
                    Glemt kode?
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '13px',
            color: 'var(--dim)',
            marginTop: '28px',
            textAlign: 'center',
          }}
        >
          Drevet af{' '}
          <a
            href="https://eventday.dk"
            style={{
              color: 'var(--muted)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--border2)',
              paddingBottom: '1px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.target.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.target.style.color = 'var(--muted)')}
          >
            TeamBattle Danmark
          </a>
        </p>
      </div>
    </>
  )
}
