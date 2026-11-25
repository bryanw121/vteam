import { SPLASH_CAPTION, SPLASH_TIPS } from '../../constants/copy'
import { BALL_SEAMS, LOGO_TILE, LOGO_V_POINTS, LOGO_V_TRANSFORM, WORDMARK } from './logo'

/*
 * Web loading screen: plain markup animated by SPLASH_CSS (splashCss.ts, in
 * app/+html.tsx), so it moves while the scripts download and renders the same
 * on the server and the client (no theme values in the markup: the colours
 * come from <html data-theme>). A bouncing volleyball, then the mark pops in
 * and "vteam" drops in letter by letter; tips rotate if it takes a while.
 */
export function AppSplashContent() {
  return (
    <div className="vt-splash" role="status" aria-label="vteam is loading">
      <div className="vt-stage" aria-hidden="true">
        <div className="vt-ball">
          <div className="vt-squash">
            <div className="vt-spin">
              <svg width="76" height="76" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r="40" strokeWidth="3" style={{ fill: 'var(--vt-ball)', stroke: 'var(--vt-seam)' }} />
                <path d={BALL_SEAMS} fill="none" strokeWidth="3" strokeLinecap="round" style={{ stroke: 'var(--vt-seam)' }} />
              </svg>
            </div>
          </div>
        </div>
        <div className="vt-shadow" />
      </div>
      <div className="vt-brand">
        <svg className="vt-mark" viewBox="0 0 100 100" aria-hidden="true">
          <rect width="100" height="100" rx="23" fill={LOGO_TILE} />
          <polygon transform={LOGO_V_TRANSFORM} points={LOGO_V_POINTS} fill="#FFFFFF" />
        </svg>
        <div className="vt-word" aria-hidden="true">
          {WORDMARK.map((l, i) => (
            <span key={i} className="vt-l" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>{l}</span>
          ))}
        </div>
        <span className="vt-beta">BETA</span>
      </div>
      <div className="vt-caption">{SPLASH_CAPTION}</div>
      <div className="vt-tips">
        {SPLASH_TIPS.map((tip, i) => (
          <div key={i} className={`vt-tip vt-tip-${i + 1}`}>Tip: {tip}</div>
        ))}
      </div>
    </div>
  )
}
