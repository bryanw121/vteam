import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// #389: a yes/no is a ConfirmDialog, a list of choices is a BottomSheet and "it worked"
// is a toast, so every pop-up of a kind looks and closes the same way. A file that
// draws its own <Modal> is listed here with the reason it isn't one of those.
const ROOT = resolve(__dirname, '..')

/** file → why it draws its own Modal. */
const ALLOWED: Record<string, string> = {
  'components/ui/ConfirmDialog.tsx': 'the shared dialog',
  'components/ui/BottomSheet.tsx': 'the shared sheet',
  'app/(app)/(tabs)/(main)/chat.tsx': 'New message: a full-height page sheet with search, not a short sheet',
  'components/tournament/InviteModal.tsx': 'invite players: a full-height page sheet with search',
  'components/ReactionPicker.tsx': 'reactions: a popover anchored to the message',
  'components/AnchorOptionsMenu.tsx': 'a menu anchored to the button that opened it',
  'components/chat/ImageViewer.tsx': 'a full-screen picture',
  'components/profile/AvatarUploader.tsx': 'the photo cropper, full screen',
  'components/ClubPostCard.tsx': 'the club post composer: a full-height editor on phones',
  'components/NotificationPopup.tsx': 'the in-app notification banner, drawn over every screen',
  'app/(app)/(tabs)/settings/badges.tsx': 'the badge detail: artwork and tiers, its own layout',
  'components/LocationPickerField.tsx': 'venue search: a full-height sheet with a search field and results',
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx$/.test(name) ? [path] : []
  })
}

const withModal = ['app', 'components']
  .flatMap(dir => sources(join(ROOT, dir)))
  .filter(file => /<Modal\b/.test(readFileSync(file, 'utf8')))
  .map(file => file.slice(ROOT.length + 1))

describe('no hand-built pop-ups (#389)', () => {
  it('confirms, pickers and results use ConfirmDialog, BottomSheet or a toast', () => {
    // A yes/no → ConfirmDialog (children for extra fields); a list → BottomSheet;
    // "saved" → toast.show({ variant: 'success' }). Otherwise add the file to ALLOWED with why.
    expect(withModal.filter(file => !ALLOWED[file])).toEqual([])
  })

  it('lists only files that still draw a Modal', () => {
    expect(Object.keys(ALLOWED).filter(file => !withModal.includes(file))).toEqual([])
  })
})
