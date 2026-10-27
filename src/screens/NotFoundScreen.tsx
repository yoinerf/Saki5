import { useEffect } from 'react'
import logoSrc from '../assets/logo-nofond.png'
import { DEFAULT_DESCRIPTION, setPageMeta } from '../lib/seo'

// Página 404: la dirección no corresponde a ninguna pantalla ni tienda. Azure devuelve index.html
// para cualquier ruta (es una SPA), así que el "noindex" evita que los buscadores la guarden.

const link = { color: '#205134', fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif", fontSize: 14.5 }

export default function NotFoundScreen() {
  useEffect(() => {
    setPageMeta({ title: 'Página no encontrada · El Campo Nos Une', description: DEFAULT_DESCRIPTION, path: window.location.pathname, noindex: true })
  }, [])

  return (
    <main style={{ minHeight: '100vh', background: '#F5EEE6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#FFFFFF', borderRadius: 20, border: '1px solid #EDE4D8', boxShadow: '0 8px 30px rgba(32,81,52,0.08)', padding: '32px 24px', boxSizing: 'border-box', textAlign: 'center' }}>
        <a href="/" aria-label="Ir al inicio de El Campo Nos Une">
          <img src={logoSrc} alt="El Campo Nos Une" style={{ height: 64, display: 'block', margin: '0 auto 12px' }} />
        </a>
        <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 48, fontWeight: 800, color: '#C4622D', margin: '0 0 4px' }}>404</p>
        <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 22, fontWeight: 700, color: '#205134', margin: '0 0 8px' }}>No encontramos esta página</h1>
        <p style={{ fontFamily: "'Nunito Sans', sans-serif", fontSize: 14.5, color: '#5A5248', margin: '0 0 22px', lineHeight: 1.6 }}>
          Puede que la dirección esté mal escrita o que la página ya no exista.
        </p>
        <a href="/" style={{ display: 'block', padding: '12px', borderRadius: 12, background: '#205134', color: '#fff', fontWeight: 700, textDecoration: 'none', fontFamily: "'Nunito Sans', sans-serif" }}>
          Ir al inicio
        </a>
        <nav style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16 }}>
          <a href="/productos" style={link}>Productos</a>
          <a href="/experiencias" style={link}>Experiencias</a>
        </nav>
      </div>
    </main>
  )
}
