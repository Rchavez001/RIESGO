export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production' || ['localhost', '127.0.0.1'].includes(window.location.hostname) || !('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/sw.js`).catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}

export function unregister() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((error) => {
      console.error('Service worker unregister failed:', error)
    })
}
