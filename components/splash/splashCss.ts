import { darkColors, lightColors } from '../../constants/theme'

/**
 * The web loading screen's look (AppSplashContent.web.tsx), as global CSS in
 * app/+html.tsx. It is plain markup and CSS so it animates while the app's
 * scripts are still downloading, and takes light or dark from
 * `<html data-theme>`, which the head script sets before anything paints: the
 * static HTML and the hydrated app render the same markup.
 */
const vars = (c: typeof lightColors, shadow: string) =>
  `--vt-bg:${c.background};--vt-ink:${c.text};--vt-sub:${c.subtext};--vt-ball:${c.card};--vt-seam:${c.primaryText};--vt-chip:${c.primarySoft};--vt-chip-ink:${c.primaryText};--vt-shadow:${shadow};`

export const SPLASH_CSS = `
:root{${vars(lightColors, 'rgba(30,16,51,0.22)')}}
html[data-theme=dark]{${vars(darkColors as typeof lightColors, 'rgba(0,0,0,0.55)')}}
.vt-splash{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--vt-bg);color:var(--vt-ink);font-family:Outfit_400Regular,system-ui,sans-serif;overflow:hidden}
.vt-stage{position:relative;width:160px;height:170px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
.vt-ball,.vt-squash,.vt-spin{width:76px;height:76px}
.vt-ball{animation:vt-drop 1.1s cubic-bezier(.5,0,.5,1) infinite}
.vt-squash{transform-origin:50% 100%;animation:vt-squash 1.1s infinite}
.vt-spin{animation:vt-spin 2.2s linear infinite}
.vt-shadow{width:80px;height:10px;margin-top:6px;border-radius:999px;background:var(--vt-shadow);animation:vt-shadow 1.1s cubic-bezier(.5,0,.5,1) infinite}
.vt-brand{display:flex;align-items:center;gap:12px;margin-top:28px}
.vt-mark{width:56px;height:56px;animation:vt-pop .5s cubic-bezier(.3,1.4,.5,1) both}
.vt-word{font-family:Outfit_800ExtraBold,system-ui,sans-serif;font-size:46px;letter-spacing:-1.5px;line-height:1}
.vt-l{display:inline-block;animation:vt-letter .55s cubic-bezier(.3,1.4,.5,1) both}
.vt-beta{align-self:flex-start;margin-top:4px;padding:2px 7px;border-radius:6px;background:var(--vt-chip);color:var(--vt-chip-ink);font-family:Outfit_700Bold,system-ui,sans-serif;font-size:11px;letter-spacing:1.2px;animation:vt-fade .4s .7s both}
.vt-caption{margin-top:14px;font-size:16px;color:var(--vt-sub);animation:vt-fade .4s .8s both}
.vt-tips{position:absolute;left:24px;right:24px;bottom:calc(48px + env(safe-area-inset-bottom));height:44px;text-align:center;font-size:14px;line-height:20px;color:var(--vt-sub)}
.vt-tip{position:absolute;left:0;right:0;opacity:0;animation:vt-tip 9s 1.2s infinite}
.vt-tip-2{animation-delay:4.2s}.vt-tip-3{animation-delay:7.2s}
@keyframes vt-drop{0%{transform:translateY(-110px)}45%{transform:translateY(0)}50%{transform:translateY(0)}100%{transform:translateY(-110px)}}
@keyframes vt-squash{0%,40%{transform:scale(1,1)}47%{transform:scale(1.2,.8)}54%{transform:scale(.93,1.07)}62%,100%{transform:scale(1,1)}}
@keyframes vt-spin{to{transform:rotate(360deg)}}
@keyframes vt-shadow{0%,100%{transform:scaleX(.45);opacity:.5}47%{transform:scaleX(1.1);opacity:1}}
@keyframes vt-pop{0%{opacity:0;transform:scale(.4) rotate(-10deg)}70%{opacity:1;transform:scale(1.08) rotate(0)}100%{opacity:1;transform:scale(1)}}
@keyframes vt-letter{0%{opacity:0;transform:translateY(-36px) rotate(-12deg)}70%{opacity:1;transform:translateY(3px) rotate(0)}100%{opacity:1;transform:translateY(0)}}
@keyframes vt-fade{from{opacity:0}to{opacity:1}}
@keyframes vt-tip{0%{opacity:0;transform:translateY(6px)}4%,30%{opacity:1;transform:translateY(0)}34%,100%{opacity:0;transform:translateY(-6px)}}
@media (prefers-reduced-motion: reduce){.vt-ball,.vt-squash,.vt-spin,.vt-shadow,.vt-mark,.vt-l,.vt-beta,.vt-caption{animation:none}.vt-tip{animation:none}.vt-tip-1{opacity:1}}
`
