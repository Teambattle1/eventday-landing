import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import SVGIcon from './components/icons/SVGIcon'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 60
const CODE_LENGTH = 4

// ── Oversættelser ───────────────────────────────────────────────────────────
const TEXTS = {
  da: {
    title: 'EventDay',
    subtitle: 'Log ind med din kode',
    label: 'Din adgangskode',
    placeholder: '_ _ _ _',
    aria: '4-tegns adgangskode',
    continueBtn: 'Fortsæt',
    forgotBtn: 'Glemt kode?',
    backBtn: 'Tilbage',
    forgotDesc: 'Indtast dit telefonnummer, og vi sender din adgangskode via SMS.',
    phoneLabel: 'Telefonnummer',
    phonePlaceholder: '+45 XX XX XX XX',
    sendSms: 'Send kode via SMS',
    sending: 'Sender...',
    codeSent: 'Kode sendt',
    codeSentDesc: 'Tjek din telefon for en SMS med din adgangskode.',
    loginBtn: 'Log ind',
    redirecting: 'Sender dig videre...',
    errorUnknown: 'Ukendt kode – prøv igen',
    errorConnection: 'Noget gik galt. Tjek forbindelsen og prøv igen.',
    errorPhone: 'Telefonnummeret blev ikke fundet.',
    errorSmsFailed: 'Kunne ikke sende SMS. Prøv igen.',
    errorTooMany: (s) => `For mange forsøg. Prøv igen om ${s} sekunder.`,
    lockedMsg: (s) => `Låst i ${s}s – for mange forsøg`,
    footer: 'Drevet af',
    footerCompany: 'TeamBattle Danmark',
    contactLabel: 'Problemer med login?',
    contactLink: 'Kontakt os: 40 27 40 27',
    introTagline: 'Din event-platform',
    adminWelcome: (name) => `Velkommen, ${name}`,
    adminChoose: 'Vælg en app',
    adminOpen: 'Åbn',
  },
  en: {
    title: 'EventDay',
    subtitle: 'Sign in with your code',
    label: 'Your access code',
    placeholder: '_ _ _ _',
    aria: '4-character access code',
    continueBtn: 'Continue',
    forgotBtn: 'Forgot code?',
    backBtn: 'Back',
    forgotDesc: 'Enter your phone number and we will send your access code via SMS.',
    phoneLabel: 'Phone number',
    phonePlaceholder: '+45 XX XX XX XX',
    sendSms: 'Send code via SMS',
    sending: 'Sending...',
    codeSent: 'Code sent',
    codeSentDesc: 'Check your phone for an SMS with your access code.',
    loginBtn: 'Sign in',
    redirecting: 'Redirecting...',
    errorUnknown: 'Unknown code – try again',
    errorConnection: 'Something went wrong. Check your connection and try again.',
    errorPhone: 'Phone number not found.',
    errorSmsFailed: 'Could not send SMS. Try again.',
    errorTooMany: (s) => `Too many attempts. Try again in ${s} seconds.`,
    lockedMsg: (s) => `Locked for ${s}s – too many attempts`,
    footer: 'Powered by',
    footerCompany: 'TeamBattle Denmark',
    contactLabel: 'Having trouble signing in?',
    contactLink: 'Contact us: 40 27 40 27',
    introTagline: 'Your event platform',
    adminWelcome: (name) => `Welcome, ${name}`,
    adminChoose: 'Choose an app',
    adminOpen: 'Open',
  },
}

// ── Flag-ikoner (inline SVG) ────────────────────────────────────────────────
function FlagDK({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 20 14" style={{ borderRadius: 2, display: 'block' }}>
      <rect width="20" height="14" fill="#c8102e" />
      <rect x="6" y="0" width="2.5" height="14" fill="#fff" />
      <rect x="0" y="5.75" width="20" height="2.5" fill="#fff" />
    </svg>
  )
}

function FlagUK({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 20 14" style={{ borderRadius: 2, display: 'block' }}>
      <rect width="20" height="14" fill="#012169" />
      <path d="M0 0l20 14M20 0L0 14" stroke="#fff" strokeWidth="2.5" />
      <path d="M0 0l20 14M20 0L0 14" stroke="#c8102e" strokeWidth="1.2" />
      <rect x="8.5" y="0" width="3" height="14" fill="#fff" />
      <rect x="0" y="5.5" width="20" height="3" fill="#fff" />
      <rect x="9" y="0" width="2" height="14" fill="#c8102e" />
      <rect x="0" y="6" width="20" height="2" fill="#c8102e" />
    </svg>
  )
}

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

// Projekt-badge ved redirect
function ProjectBadge({ project, label }) {
  const colors = {
    crew: { bg: 'var(--blue-dim)', color: 'var(--blue)' },
    occ: { bg: 'var(--green-dim)', color: 'var(--green)' },
    flow: { bg: 'var(--accent-dim)', color: 'var(--accent)' },
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

// ── Fullscreen intro-animation ─────────────────────────────────────────────
function IntroOverlay({ onComplete, lang }) {
  const [phase, setPhase] = useState(0)
  const t = TEXTS[lang]

  useEffect(() => {
    // 4 sekunders intro: logo (0s) → tagline (1.2s) → hold (3s) → fade-out (3.4s) → done (4s)
    const t1 = setTimeout(() => setPhase(1), 1200)
    const t2 = setTimeout(() => setPhase(2), 3400)
    const t3 = setTimeout(() => onComplete(), 4000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onComplete])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--accent)',
        opacity: phase === 2 ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: phase === 2 ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          filter: 'blur(80px)',
          animation: 'ed-glow-pulse 3s ease-in-out infinite',
        }}
      />

      <div
        style={{
          position: 'relative',
          opacity: phase >= 0 ? 1 : 0,
          transform: phase >= 0 ? 'scale(1)' : 'scale(0.7)',
          transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ display: 'block' }}>
          <circle cx="40" cy="40" r="36" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          <circle
            cx="40" cy="40" r="36"
            stroke="#fff" strokeWidth="2.5"
            strokeDasharray="226" strokeDashoffset="226"
            strokeLinecap="round"
            className="ed-intro-ring-draw"
          />
          <text
            x="40" y="52" textAnchor="middle" fill="#fff"
            fontFamily="'Playfair Display', Georgia, serif"
            fontSize="38" fontWeight="700"
            className="ed-intro-letter"
          >
            E
          </text>
        </svg>
      </div>

      <h1
        style={{
          position: 'relative',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '42px',
          fontWeight: '700',
          color: '#fff',
          margin: '24px 0 0',
          letterSpacing: '0.04em',
          opacity: phase >= 0 ? 1 : 0,
          transform: phase >= 0 ? 'translateY(0)' : 'translateY(15px)',
          transition: 'opacity 0.6s ease 0.15s, transform 0.6s ease 0.15s',
        }}
      >
        EventDay
      </h1>

      <p
        style={{
          position: 'relative',
          fontFamily: "'Outfit', sans-serif",
          fontSize: '16px',
          fontWeight: '400',
          color: 'rgba(255,255,255,0.7)',
          margin: '10px 0 0',
          letterSpacing: '0.06em',
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        {t.introTagline}
      </p>

      <div
        style={{
          position: 'relative',
          width: phase >= 1 ? '60px' : '0px',
          height: '2px',
          background: 'rgba(255,255,255,0.4)',
          borderRadius: '1px',
          marginTop: '16px',
          transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  )
}

export default function Landing() {
  // Sprog – default engelsk
  const [lang, setLang] = useState(() => localStorage.getItem('ed_lang') || 'en')
  const t = TEXTS[lang]

  // Intro-animation state
  const [showIntro, setShowIntro] = useState(true)
  const [introComplete, setIntroComplete] = useState(false)

  // Kode-input
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect-indikator
  const [redirecting, setRedirecting] = useState(null)

  // Admin multi-app vælger
  const [adminApps, setAdminApps] = useState(null) // { label, apps: [...] }

  // Lockout
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [lockCountdown, setLockCountdown] = useState(0)

  // Sprog-popup efter login
  const [langPickerPending, setLangPickerPending] = useState(null) // gemmer redirect-info mens vi venter på sprogvalg

  // Glemt kode-flow
  const [showForgotFlow, setShowForgotFlow] = useState(false)
  const [forgotPhone, setForgotPhone] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const codeInputRef = useRef(null)

  function toggleLang() {
    const next = lang === 'da' ? 'en' : 'da'
    setLang(next)
    localStorage.setItem('ed_lang', next)
    setError('')
  }

  // Skip intro hvis ?code= er i URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
      setShowIntro(false)
      setIntroComplete(true)
    }
  }, [])

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false)
    setIntroComplete(true)
  }, [])

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
    } else if (introComplete) {
      codeInputRef.current?.focus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introComplete])

  // ── Registrér mislykket forsøg ────────────────────────────────────────────
  const registerFailedAttempt = useCallback((currentAttempts) => {
    const next = currentAttempts + 1
    setAttempts(next)
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000
      setLockedUntil(until)
      setLockCountdown(LOCKOUT_SECONDS)
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
      const { data, error: fnError } = await supabase.functions.invoke('ef-verify-code', {
        body: { code: codeToCheck },
      })

      if (fnError) throw fnError

      // Eventday admin – vis sprog-popup, derefter redirect
      if (data?.type === 'admin') {
        const adminName = data.adminName || 'Admin'
        localStorage.setItem('ef_admin', JSON.stringify({
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          name: adminName,
        }))
        setLangPickerPending({ redirectUrl: 'https://eventday.dk/admin' })
        setLoading(false)
        return
      }

      // Eventday klient – vis sprog-popup, derefter redirect
      if (data?.type === 'client') {
        if (!data.portalToken) {
          setError(t.errorUnknown)
          registerFailedAttempt(attempts)
          return
        }
        const key = `ef_portal_${data.portalToken}`
        localStorage.setItem(key, JSON.stringify({
          token: data.portalToken,
          firma: data.firma,
          brandColor: data.brandColor,
          logoUrl: data.logoUrl,
          clientId: data.clientId,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }))
        setLangPickerPending({ redirectUrl: `https://eventday.dk/portal/${data.portalToken}` })
        setLoading(false)
        return
      }

      // OCC/eksternt system – redirect
      if (data?.type === 'redirect' && data.redirectUrl) {
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

      setError(t.errorUnknown)
      registerFailedAttempt(attempts)
    } catch (err) {
      console.error('[EventDay] verify-code fejl:', err)
      setError(t.errorConnection)
    } finally {
      setLoading(false)
    }
  }

  // ── Glemt kode – send SMS ─────────────────────────────────────────────────
  async function handleForgotSubmit(e) {
    e.preventDefault()
    if (!forgotPhone.trim()) return

    setForgotLoading(true)
    setError('')
    try {
      // Rens telefonnummer og slå op i ef_clients
      const cleaned = forgotPhone.trim().replace(/\s/g, '')
      const { data: clients } = await supabase
        .from('ef_clients')
        .select('access_code, phone')
        .eq('active', true)

      // Match på telefonnummer (ignorer mellemrum og +45-prefix)
      const normalize = (p) => (p || '').replace(/\s/g, '').replace(/^\+45/, '').replace(/^0045/, '')
      const inputNorm = normalize(cleaned)
      const match = (clients || []).find(c => normalize(c.phone) === inputNorm)

      if (!match) {
        setError(t.errorPhone)
        setForgotLoading(false)
        return
      }

      // Telefon fundet – send SMS via ef-send-sms
      const { error: smsErr } = await supabase.functions.invoke('ef-send-sms', {
        body: {
          phone: cleaned,
          message: `Din Eventday adgangskode er: ${match.access_code}\nLog ind på: eventday.dk`,
        },
      })
      if (smsErr) throw smsErr

      setForgotSent(true)
    } catch (err) {
      console.error('[EventDay] forgot-code fejl:', err)
      setError(t.errorSmsFailed)
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

  // Sprog valgt i popup → gem + redirect
  function pickLang(chosenLang) {
    localStorage.setItem('ed_lang', chosenLang)
    localStorage.setItem('ef_lang', chosenLang)
    if (langPickerPending?.redirectUrl) {
      window.location.href = langPickerPending.redirectUrl
    }
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
        @keyframes ed-glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.15); }
        }
        @keyframes ed-ring-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ed-letter-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ed-intro-ring-draw {
          animation: ed-ring-draw 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.3s forwards;
        }
        .ed-intro-letter {
          opacity: 0;
          animation: ed-letter-in 0.6s ease 0.7s forwards;
        }
        .ed-landing-card {
          animation: ed-fade-in 0.5s ease both;
        }
        .ed-content-enter {
          animation: ed-fade-in 0.5s ease 0.1s both;
        }
        .ed-footer-enter {
          animation: ed-fade-in 0.5s ease 0.25s both;
        }
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
        .ed-lang-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 6px;
          padding: 5px 10px;
          cursor: pointer;
          font-family: 'Outfit', sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          letter-spacing: 0.03em;
          transition: border-color 0.15s, background 0.15s;
        }
        .ed-lang-btn:hover {
          border-color: var(--accent);
          background: var(--surface);
          color: var(--text);
        }
        .ed-contact-link {
          color: var(--muted);
          text-decoration: none;
          border-bottom: 1px solid var(--border2);
          padding-bottom: 1px;
          transition: color 0.15s;
        }
        .ed-contact-link:hover {
          color: var(--accent);
        }
      `}</style>

      {/* ── Fullscreen intro-animation ──────────────────────────────────── */}
      {showIntro && <IntroOverlay onComplete={handleIntroComplete} lang={lang} />}

      {/* ── Sprog-popup efter login ──────────────────────────────────────── */}
      {langPickerPending && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: '16px', padding: '36px 32px',
            maxWidth: '360px', width: '100%', textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            animation: 'ed-fade-in 0.25s ease',
          }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
              Choose language
            </p>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: '14px', color: 'var(--muted)', marginBottom: '28px' }}>
              Vælg sprog / Select language
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button onClick={() => pickLang('da')} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                padding: '20px 16px', borderRadius: '12px', cursor: 'pointer',
                border: '2px solid var(--border2)', background: 'var(--surface2)',
                transition: 'border-color 0.15s, background 0.15s', fontFamily: "'Outfit', sans-serif",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)' }}>
                <FlagDK size={36} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Dansk</span>
              </button>
              <button onClick={() => pickLang('en')} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                padding: '20px 16px', borderRadius: '12px', cursor: 'pointer',
                border: '2px solid var(--border2)', background: 'var(--surface2)',
                transition: 'border-color 0.15s, background 0.15s', fontFamily: "'Outfit', sans-serif",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)' }}>
                <FlagUK size={36} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>English</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
        {introComplete && (
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
                position: 'relative',
              }}
            >
              {/* Sprogskift-knap i øverste højre hjørne */}
              <button
                className="ed-lang-btn"
                onClick={toggleLang}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                }}
                aria-label={lang === 'da' ? 'Switch to English' : 'Skift til dansk'}
              >
                {lang === 'da' ? <FlagUK size={18} /> : <FlagDK size={18} />}
                {lang === 'da' ? 'EN' : 'DK'}
              </button>

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
                {t.title}
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
                {t.subtitle}
              </p>
            </div>

            {/* Kortindhold */}
            <div className="ed-content-enter" style={{ padding: '36px 40px 32px' }}>

              {/* ══ ADMIN APP-VÆLGER ═════════════════════════════════════════ */}
              {adminApps ? (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'var(--accent-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 14px',
                      }}
                    >
                      <SVGIcon name="lock" size={22} color="var(--accent)" />
                    </div>
                    <p
                      style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        fontSize: '18px',
                        fontWeight: '700',
                        color: 'var(--text)',
                        margin: '0 0 4px',
                      }}
                    >
                      {t.adminWelcome(adminApps.label)}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: '14px',
                        color: 'var(--muted)',
                        margin: 0,
                      }}
                    >
                      {t.adminChoose}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {adminApps.apps.map((app) => {
                      const projectColors = {
                        flow: { bg: 'var(--accent-dim)', color: 'var(--accent)', border: 'rgba(212,100,10,0.18)' },
                        occ: { bg: 'var(--green-dim)', color: 'var(--green)', border: 'rgba(26,158,117,0.18)' },
                        crew: { bg: 'var(--blue-dim)', color: 'var(--blue)', border: 'rgba(47,98,196,0.18)' },
                      }
                      const pc = projectColors[app.project] || projectColors.flow

                      return (
                        <button
                          key={app.url}
                          onClick={() => {
                            setRedirecting({ project: app.project, label: app.label, redirectUrl: app.url })
                            setAdminApps(null)
                            setTimeout(() => { window.location.href = app.url }, 400)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                            padding: '16px 18px',
                            background: pc.bg,
                            border: `1px solid ${pc.border}`,
                            borderRadius: 'var(--r)',
                            cursor: 'pointer',
                            transition: 'transform 0.1s, box-shadow 0.15s',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)'
                            e.currentTarget.style.boxShadow = 'var(--shadow)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: pc.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "'Playfair Display', Georgia, serif",
                                fontSize: '18px',
                                fontWeight: '700',
                                color: '#fff',
                              }}
                            >
                              {app.label.charAt(0)}
                            </span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p
                              style={{
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '15px',
                                fontWeight: '600',
                                color: 'var(--text)',
                                margin: 0,
                              }}
                            >
                              {app.label}
                            </p>
                            <p
                              style={{
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '12px',
                                color: 'var(--muted)',
                                margin: '2px 0 0',
                              }}
                            >
                              {app.project === 'flow' ? 'flow.eventday.dk' :
                               app.project === 'occ' ? 'occ.eventday.dk' :
                               'crew.eventday.dk'}
                            </p>
                          </div>
                          <SVGIcon name="arrow-right" size={16} color={pc.color} />
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                      className="ed-btn-ghost"
                      onClick={() => { setAdminApps(null); setCode(''); setTimeout(() => codeInputRef.current?.focus(), 80) }}
                    >
                      <SVGIcon name="arrow-left" size={14} />
                      {t.backBtn}
                    </button>
                  </div>
                </div>

              /* ══ REDIRECTING ═══════════════════════════════════════════════ */
              ) : redirecting ? (
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
                    {t.redirecting}
                  </p>
                </div>

              /* ══ GLEMT KODE-FLOW ════════════════════════════════════════════ */
              ) : showForgotFlow ? (
                <div>
                  <button className="ed-btn-ghost" onClick={resetForgotFlow} style={{ marginBottom: '20px' }}>
                    <SVGIcon name="arrow-left" size={16} />
                    {t.backBtn}
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
                        {t.codeSent}
                      </p>
                      <p
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: '14px',
                          color: 'var(--muted)',
                          margin: '0 0 24px',
                        }}
                      >
                        {t.codeSentDesc}
                      </p>
                      <button className="ed-btn-primary" onClick={resetForgotFlow}>
                        {t.loginBtn}
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
                        {t.forgotDesc}
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
                        {t.phoneLabel}
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
                          placeholder={t.phonePlaceholder}
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
                        {forgotLoading ? t.sending : t.sendSms}
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
                    {t.label}
                  </label>

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
                      placeholder={t.placeholder}
                      aria-label={t.aria}
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

                  {error && (
                    <div id="login-error" className="ed-error" style={{ marginBottom: '16px' }}>
                      <SVGIcon name="alert-circle" size={15} />
                      <span>{isLocked ? t.lockedMsg(lockCountdown) : error}</span>
                    </div>
                  )}

                  {!loading && (
                    <button
                      type="button"
                      className="ed-btn-primary"
                      disabled={!codeComplete || loading || isLocked}
                      onClick={() => submitCode(code)}
                      style={{ marginBottom: '20px' }}
                    >
                      <SVGIcon name="arrow-right" size={16} />
                      {t.continueBtn}
                    </button>
                  )}

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

                  <div style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="ed-btn-ghost"
                      onClick={() => { setShowForgotFlow(true); setError('') }}
                      disabled={loading}
                    >
                      <SVGIcon name="phone" size={14} />
                      {t.forgotBtn}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Kontakt + Footer */}
        {introComplete && (
          <div className="ed-footer-enter" style={{ textAlign: 'center', marginTop: '28px' }}>
            {/* Kontakt os */}
            <p
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '13px',
                color: 'var(--muted)',
                margin: '0 0 8px',
              }}
            >
              {t.contactLabel}{' '}
              <a href="tel:+4540274027" className="ed-contact-link">
                {t.contactLink}
              </a>
            </p>

            {/* Footer */}
            <p
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '13px',
                color: 'var(--dim)',
                margin: 0,
              }}
            >
              {t.footer}{' '}
              <a
                href="https://eventday.dk"
                className="ed-contact-link"
                style={{ color: 'var(--dim)' }}
              >
                {t.footerCompany}
              </a>
            </p>
          </div>
        )}
      </div>
    </>
  )
}
