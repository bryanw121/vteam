/* vteam service worker (#189): Web Push only. No caching, no fetch handler. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

function safeLink(link) {
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') ? link : '/'
}

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: 'vteam', body: event.data ? event.data.text() : '' } }
  const title = typeof data.title === 'string' && data.title ? data.title : 'vteam'
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { deep_link: safeLink(data.deep_link) },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = safeLink(event.notification.data && event.notification.data.deep_link)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(w => new URL(w.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      open.postMessage({ type: 'vteam-push-tap', deep_link: link })
      return
    }
    await self.clients.openWindow(link)
  })())
})
