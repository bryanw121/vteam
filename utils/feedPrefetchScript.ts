import { feedSpanArgs } from './feedFirstSpan'
import { EXTERNAL_SESSION_MAX_AGE_MS } from '../constants/events'
import { BREAKPOINTS } from '../constants/layout'

/**
 * The inline <head> script that starts the Events feed request (#184). It
 * computes the same span as the app (feedSpanArgs, inlined from its source),
 * uses the stored access token only if it is valid for another minute (else
 * the anon key; it never refreshes a token or writes storage), and leaves the
 * promise on `window.__vteamPrefetch.feed` for lib/feedPrefetch.web.ts.
 */
export function buildFeedPrefetchScript(supabaseOrigin: string, anonKey: string): string {
  let ref = ''
  try { ref = new URL(supabaseOrigin).hostname.split('.')[0] } catch { /* no ref: anon only */ }
  const cfg = JSON.stringify({
    url: supabaseOrigin,
    key: anonKey,
    storageKey: `sb-${ref}-auth-token`,
    wide: BREAKPOINTS.sidebar,
    maxAge: EXTERNAL_SESSION_MAX_AGE_MS,
  })
  return `(function(){try{
if(location.pathname!=='/'||!window.fetch)return;
var c=${cfg},span=(${feedSpanArgs.toString()});
var a=span(Date.now(),innerWidth>=c.wide,c.maxAge),tok=c.key,viewer=null;
try{var s=JSON.parse(localStorage.getItem(c.storageKey)||'null');
if(s&&s.access_token&&s.user&&s.user.id&&s.expires_at*1000>Date.now()+60000){tok=s.access_token;viewer=s.user.id}}catch(e){}
var p=fetch(c.url+'/rest/v1/rpc/get_feed_span',{method:'POST',headers:{apikey:c.key,Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify(a)})
.then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
p.catch(function(){});
window.__vteamPrefetch={feed:{start:a.p_start,end:a.p_end,viewer:viewer,at:Date.now(),promise:p}};
}catch(e){}})();`
}
