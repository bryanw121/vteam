/**
 * The one time zone event times are written in whenever they reach someone
 * other than the viewer (share text, link previews, reminders, the leave note
 * to the host) or are matched against a venue's local schedule: the pilot
 * region's, so every reader sees the same time whatever their phone, the CI
 * runner or the server is set to. Per region (or per event) once we expand.
 *
 * Kept free of React Native imports: `api/` uses it through constants/share.
 */
export const EVENT_TIME_ZONE = 'America/Chicago'
