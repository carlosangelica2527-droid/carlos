/* QUIPU · arranque */
(function () {
  'use strict'
  const Q = window.Q
  if (!Q) return
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Q.start)
  } else {
    Q.start()
  }
})()
