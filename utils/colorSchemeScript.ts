import { APPEARANCE_STORAGE_KEY, DOCUMENT_BACKGROUND } from '../constants/colorScheme'

/**
 * Inline script for the web document head (app/+html.tsx): sets
 * `<html data-theme>` and the browser toolbar colour from the saved appearance
 * (else the browser's own setting) before anything paints. Same rule as
 * lib/colorSchemeInit.web.ts; never throws.
 */
export function buildColorSchemeScript(): string {
  return `try{var p=localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)});` +
    `var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);` +
    `if(d){document.documentElement.dataset.theme='dark';` +
    `var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',${JSON.stringify(DOCUMENT_BACKGROUND.dark)})}}catch(e){}`
}
