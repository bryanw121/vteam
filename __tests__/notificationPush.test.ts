import {
  buildPushMessages,
  parseNotificationWebhook,
  pushEnabled,
  safeDeepLink,
  shouldPush,
  type NotificationRecord,
} from '../supabase/functions/_shared/notificationPush'
import { NOTIFICATION_TYPES } from '../types'

const ID = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const EVENT = '33333333-3333-4333-8333-333333333333'

const record: NotificationRecord = {
  id: ID,
  user_id: USER,
  notification_type: 'event_reminder',
  title: 'Sand Doubles at 4:00 PM',
  body: 'Starts in 2 hours · Butler Park',
  data: { event_id: EVENT, deep_link: `/event/${EVENT}` },
}

describe('parseNotificationWebhook', () => {
  it('reads the record of a notifications INSERT webhook', () => {
    expect(parseNotificationWebhook({ type: 'INSERT', table: 'notifications', schema: 'public', record, old_record: null })).toEqual(record)
  })

  it('rejects other events, other tables and malformed rows', () => {
    expect(parseNotificationWebhook({ type: 'UPDATE', table: 'notifications', record })).toBeNull()
    expect(parseNotificationWebhook({ type: 'INSERT', table: 'messages', record })).toBeNull()
    expect(parseNotificationWebhook({ type: 'INSERT', table: 'notifications', record: { ...record, id: 'nope' } })).toBeNull()
    expect(parseNotificationWebhook({ type: 'INSERT', table: 'notifications', record: { ...record, user_id: undefined } })).toBeNull()
    expect(parseNotificationWebhook(null)).toBeNull()
    expect(parseNotificationWebhook('x')).toBeNull()
  })

  it('defaults a missing data object', () => {
    expect(parseNotificationWebhook({ record: { ...record, data: null } })?.data).toEqual({})
  })
})

describe('push preferences', () => {
  it('is on unless the push pref for that type is explicitly false', () => {
    expect(pushEnabled(null, 'event_reminder')).toBe(true)
    expect(pushEnabled({ push: {} }, 'event_reminder')).toBe(true)
    expect(pushEnabled({ push: { event_reminder: true } }, 'event_reminder')).toBe(true)
    expect(pushEnabled({ push: { event_reminder: false } }, 'event_reminder')).toBe(false)
    expect(pushEnabled({ push: { cheers_received: false } }, 'event_reminder')).toBe(true)
  })

  it('pushes every notification type except chat mentions (send-chat-push covers those)', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect([type, shouldPush({ ...record, notification_type: type }, null)]).toEqual([type, type !== 'chat_mention'])
    }
  })

  it('skips a turned-off type and an empty row', () => {
    expect(shouldPush(record, { push: { event_reminder: false } })).toBe(false)
    expect(shouldPush({ ...record, title: ' ', body: '' }, null)).toBe(false)
  })
})

describe('buildPushMessages', () => {
  it('sends one message per distinct token with the deep link to open', () => {
    const msgs = buildPushMessages(record, ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[a]'])
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({
      to: 'ExponentPushToken[a]',
      title: record.title,
      body: record.body,
      data: { deep_link: `/event/${EVENT}`, event_id: EVENT, notification_id: ID, notification_type: 'event_reminder' },
      sound: 'default',
    })
  })

  it('never forwards a link that is not an in-app path', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', 42]) {
      expect(safeDeepLink(bad)).toBeUndefined()
      const [msg] = buildPushMessages({ ...record, data: { deep_link: bad } }, ['t'])
      expect(msg.data.deep_link).toBeUndefined()
    }
    expect(safeDeepLink('/event/x?tab=1')).toBe('/event/x?tab=1')
  })

  it('returns nothing without tokens', () => {
    expect(buildPushMessages(record, [])).toEqual([])
  })
})
