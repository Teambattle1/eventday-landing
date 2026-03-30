import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// Tema-initialisering fra localStorage
const saved = localStorage.getItem('ed_theme')
if (saved === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
