import { File, Paths } from 'expo-file-system'
import { parseAppearance } from '../constants/colorScheme'
import type { AppearancePref } from '../constants/colorScheme'

// Native: the choice lives in a small file, because it has to be read
// synchronously at startup (AsyncStorage can't be) before any colour is used.

const FILE_NAME = 'vteam-appearance.txt'

function file(): File | null {
  try { return new File(Paths.document, FILE_NAME) } catch { return null }
}

export function readAppearancePref(): AppearancePref {
  try {
    const f = file()
    return parseAppearance(f && f.exists ? f.textSync().trim() : null)
  } catch {
    return parseAppearance(null)
  }
}

export function writeAppearancePref(pref: AppearancePref): void {
  try {
    const f = file()
    if (!f) return
    if (!f.exists) f.create()
    f.writeSync(pref)
  } catch {}
}
