// Lets an admin-role account preview the normal student experience instead
// of always landing in AdminShell. Session-scoped on purpose: it should not
// silently carry over into a brand new browser session/tab.
const KEY = 'cyberdojo_view_as_user'

export function isViewingAsUser(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

export function setViewingAsUser(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(KEY, 'true')
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // Ignore storage errors (private browsing, quota, etc.) — worst case
    // the admin just always sees AdminShell instead of the preview.
  }
}
