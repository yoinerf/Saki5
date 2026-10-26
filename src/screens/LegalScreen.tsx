import { useEffect, type CSSProperties, type ReactNode } from 'react'
import logoSrc from '../assets/logo-nofond.png'
import { LEGAL_PATHS, type LegalPage } from '../lib/legal'

// Política de privacidad y condiciones del servicio. Páginas públicas e independientes de la
// sesión: Google (pantalla de consentimiento OAuth) y cualquier visitante deben poder abrirlas.

// Datos del responsable: revisar antes de publicar
const BRAND = 'El Campo Nos Une'
const SITE = 'www.saki5.com'
const CONTACT_EMAIL = 'contacto@saki5.com'
const UPDATED = '19 de octubre de 2026'

const h2: CSSProperties = { fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#205134', margin: '28px 0 10px' }
const p: CSSProperties = { fontFamily: "'Nunito Sans', sans-serif", fontSize: 14.5, lineHeight: 1.65, color: '#374151', margin: '0 0 10px' }
const li: CSSProperties = { ...p, margin: '0 0 6px' }
const link: CSSProperties = { color: '#9B4728', fontWeight: 700 }

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h2 style={h2}>{title}</h2>
    {children}
  </section>
)

const List = ({ items }: { items: ReactNode[] }) => (
  <ul style={{ margin: '0 0 10px', paddingLeft: 22 }}>
    {items.map((item, i) => <li key={i} style={li}>{item}</li>)}
  </ul>
)

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>

function PrivacyContent() {
  return (
    <>
      <p style={p}>
        En {BRAND} ({SITE}) respetamos tu privacidad. Esta política explica qué datos personales recogemos, para qué los usamos y
        cómo puedes ejercer tus derechos, conforme a la Ley 1581 de 2012 de protección de datos personales de Colombia y sus
        decretos reglamentarios.
      </p>

      <Section title="1. Responsable del tratamiento">
        <p style={p}>
          El responsable del tratamiento de tus datos es {BRAND}. Para cualquier consulta sobre esta política o sobre tus datos
          puedes escribirnos a <Mail />.
        </p>
      </Section>

      <Section title="2. Datos que recogemos">
        <List
          items={[
            <><strong>Datos de cuenta:</strong> nombre, apellido, correo electrónico, contraseña (guardada cifrada), tipo de cuenta (comprador, productor o turismo).</>,
            <><strong>Datos de identificación y ubicación:</strong> tipo y número de documento (cédula o NIT), departamento y municipio.</>,
            <><strong>Datos de pedidos y reservas:</strong> nombre de quien recibe, teléfono, dirección de entrega, notas para la entrega, productos o experiencias solicitadas y método de pago elegido.</>,
            <><strong>Datos de productores y operadores de turismo:</strong> información de la tienda o emprendimiento, productos, fotografías y documentos como el RUT y el certificado de Cámara de Comercio.</>,
            <><strong>Datos técnicos:</strong> información necesaria para mantener tu sesión iniciada y guardar tu carrito en tu navegador.</>,
          ]}
        />
      </Section>

      <Section title="3. Inicio de sesión con Google">
        <p style={p}>
          Si eliges iniciar sesión o registrarte con Google, recibimos de tu cuenta de Google únicamente tu <strong>nombre</strong>,
          tu <strong>dirección de correo electrónico</strong> y tu <strong>foto de perfil</strong>. Los usamos solo para crear tu
          cuenta, identificarte al iniciar sesión y mostrar tu nombre en la plataforma.
        </p>
        <p style={p}>
          No accedemos a tus contactos, correos, archivos ni a ningún otro dato de Google. No vendemos ni compartimos los datos
          obtenidos de Google con terceros para publicidad, y su uso se ajusta a la Política de datos de usuario de los servicios
          de API de Google, incluidos los requisitos de uso limitado. Puedes retirar el acceso en cualquier momento desde la
          configuración de seguridad de tu cuenta de Google.
        </p>
      </Section>

      <Section title="4. Para qué usamos tus datos">
        <List
          items={[
            'Crear y administrar tu cuenta y permitirte iniciar sesión.',
            'Gestionar pedidos, reservas, entregas y pagos entre compradores y productores.',
            'Verificar la identidad y la documentación de productores y operadores antes de que publiquen.',
            'Enviarte notificaciones sobre tus pedidos, reservas y tu cuenta.',
            'Atender solicitudes de soporte, quejas y reclamos.',
            'Mejorar la plataforma y prevenir fraudes o usos indebidos.',
            'Cumplir obligaciones legales.',
          ]}
        />
      </Section>

      <Section title="5. Con quién compartimos tus datos">
        <List
          items={[
            'Con el productor, tienda aliada u operador de turismo al que le compras o reservas: recibe los datos necesarios para preparar y entregar tu pedido o atender tu reserva (nombre, teléfono, dirección y detalle del pedido).',
            'Con los proveedores tecnológicos que nos prestan servicios de alojamiento, base de datos y autenticación (por ejemplo Supabase, Microsoft Azure y Google), que tratan los datos por nuestra cuenta y bajo medidas de seguridad.',
            'Con autoridades, cuando una ley u orden judicial lo exija.',
          ]}
        />
        <p style={p}>No vendemos tus datos personales.</p>
      </Section>

      <Section title="6. Transferencia internacional">
        <p style={p}>
          Algunos de nuestros proveedores tecnológicos almacenan la información en servidores ubicados fuera de Colombia. Al usar
          la plataforma autorizas esta transferencia, que se realiza con proveedores que ofrecen niveles adecuados de protección.
        </p>
      </Section>

      <Section title="7. Cuánto tiempo conservamos tus datos">
        <p style={p}>
          Conservamos tus datos mientras tengas una cuenta activa y durante el tiempo adicional que exijan las normas contables,
          tributarias o de protección al consumidor. Cuando ya no sean necesarios, los eliminamos o anonimizamos.
        </p>
      </Section>

      <Section title="8. Tus derechos">
        <p style={p}>Como titular de los datos tienes derecho a:</p>
        <List
          items={[
            'Conocer, actualizar y rectificar tus datos personales.',
            'Solicitar prueba de la autorización que nos diste.',
            'Saber cómo hemos usado tus datos.',
            'Revocar la autorización y pedir que eliminemos tus datos cuando no exista un deber legal de conservarlos.',
            'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).',
            'Acceder de forma gratuita a tus datos.',
          ]}
        />
        <p style={p}>
          Puedes actualizar parte de tus datos y eliminar tu cuenta desde “Mi cuenta”. Para cualquier otra solicitud,
          escríbenos a <Mail />. Respondemos las consultas en un máximo de 10 días hábiles y los reclamos en un máximo de
          15 días hábiles.
        </p>
      </Section>

      <Section title="9. Seguridad">
        <p style={p}>
          Usamos conexiones cifradas (HTTPS), contraseñas cifradas y controles de acceso para que cada usuario solo vea la
          información que le corresponde. Aun así, ningún sistema es completamente seguro; si detectamos un incidente que afecte
          tus datos te lo informaremos.
        </p>
      </Section>

      <Section title="10. Menores de edad">
        <p style={p}>La plataforma está dirigida a mayores de 18 años. No recogemos a sabiendas datos de menores de edad.</p>
      </Section>

      <Section title="11. Cambios a esta política">
        <p style={p}>
          Podemos actualizar esta política. Publicaremos la nueva versión en esta página con su fecha de actualización y, si el
          cambio es importante, te avisaremos por la plataforma o por correo.
        </p>
      </Section>
    </>
  )
}

function TermsContent() {
  return (
    <>
      <p style={p}>
        Estas condiciones regulan el uso de {BRAND} ({SITE}), una plataforma que conecta a productores del campo, tiendas aliadas y
        operadores de turismo comunitario con compradores y visitantes. Al crear una cuenta o usar la plataforma aceptas estas
        condiciones y nuestra <a href={LEGAL_PATHS.privacy} style={link}>Política de privacidad</a>.
      </p>

      <Section title="1. Cuentas">
        <List
          items={[
            'Debes ser mayor de 18 años y dar información veraz y actualizada.',
            'Eres responsable de mantener la confidencialidad de tu contraseña y de la actividad de tu cuenta.',
            'Puedes registrarte con correo y contraseña o con tu cuenta de Google.',
            'Podemos suspender o cerrar cuentas que incumplan estas condiciones o que se usen de forma fraudulenta.',
          ]}
        />
      </Section>

      <Section title="2. El papel de la plataforma">
        <p style={p}>
          {BRAND} facilita el contacto, la exhibición de productos y experiencias y la gestión de pedidos y reservas. Cada
          productor, tienda aliada u operador de turismo es el vendedor o prestador del servicio, y responde por la calidad,
          cantidad, estado, legalidad y entrega de lo que ofrece, así como por la información que publica.
        </p>
      </Section>

      <Section title="3. Productores, tiendas y operadores de turismo">
        <List
          items={[
            'Para publicar debes cargar la documentación solicitada (como mínimo el RUT) y ser aprobado por el administrador correspondiente.',
            'Debes publicar información, precios, fotografías y disponibilidad reales y mantenerlos actualizados.',
            'Debes cumplir las normas sanitarias, tributarias y de protección al consumidor que apliquen a tus productos o servicios.',
            'Debes atender los pedidos y reservas aceptados en los plazos y condiciones informados.',
            'Nos autorizas a mostrar en la plataforma y en nuestros canales de promoción el contenido que publicas.',
          ]}
        />
      </Section>

      <Section title="4. Compras, precios y pagos">
        <List
          items={[
            'Los precios se muestran en pesos colombianos (COP). El valor del envío, cuando aplica, se informa antes de confirmar el pedido.',
            'Los métodos de pago disponibles (por ejemplo contraentrega, transferencia bancaria o efectivo) los define cada tienda y se muestran al finalizar la compra.',
            'Un pedido se considera confirmado cuando el vendedor lo acepta y, si corresponde, verifica el pago.',
            'El vendedor puede cancelar un pedido por falta de disponibilidad; en ese caso se te informará y, si ya pagaste, se te reembolsará.',
          ]}
        />
      </Section>

      <Section title="5. Envíos, retracto, cambios y garantías">
        <p style={p}>
          Los tiempos y condiciones de entrega dependen de cada vendedor y de tu ubicación. Tienes los derechos que te reconoce la
          Ley 1480 de 2011 (Estatuto del Consumidor), incluido el derecho de retracto dentro de los 5 días hábiles siguientes a la
          entrega cuando aplique. El retracto no aplica a productos perecederos ni a servicios cuya prestación ya comenzó con tu
          acuerdo. Las solicitudes de garantía, cambio o devolución se atienden con el vendedor; desde la plataforma te ayudamos a
          gestionarlas.
        </p>
      </Section>

      <Section title="6. Experiencias de turismo">
        <p style={p}>
          Las reservas de experiencias quedan sujetas a la disponibilidad y a las condiciones de cada operador (cupos, horarios,
          requisitos y políticas de cancelación), que se informan en la experiencia. El operador es responsable de la prestación
          del servicio y de la seguridad de la actividad.
        </p>
      </Section>

      <Section title="7. Uso permitido">
        <p style={p}>No está permitido:</p>
        <List
          items={[
            'Publicar productos o servicios ilegales, falsificados o engañosos.',
            'Suplantar a otra persona o usar datos de terceros sin autorización.',
            'Intentar acceder a cuentas o información de otros usuarios o afectar el funcionamiento de la plataforma.',
            'Usar la plataforma para enviar publicidad no solicitada o con fines distintos a los previstos.',
          ]}
        />
      </Section>

      <Section title="8. Propiedad intelectual">
        <p style={p}>
          La marca, el logo, el diseño y el software de {BRAND} nos pertenecen o los usamos con autorización. El contenido que
          publican los usuarios sigue siendo de ellos.
        </p>
      </Section>

      <Section title="9. Responsabilidad">
        <p style={p}>
          Trabajamos para que la plataforma funcione de forma continua y segura, pero puede haber interrupciones por mantenimiento
          o causas ajenas a nosotros. En la medida que lo permita la ley, {BRAND} no responde por los productos o servicios
          ofrecidos por los vendedores ni por los acuerdos entre usuarios, sin perjuicio de los derechos que la ley reconoce a los
          consumidores.
        </p>
      </Section>

      <Section title="10. Cambios a estas condiciones">
        <p style={p}>
          Podemos modificar estas condiciones. La nueva versión se publicará en esta página con su fecha de actualización; si
          sigues usando la plataforma después del cambio, se entiende que lo aceptas.
        </p>
      </Section>

      <Section title="11. Ley aplicable y contacto">
        <p style={p}>
          Estas condiciones se rigen por las leyes de la República de Colombia. Para dudas, quejas o reclamos escríbenos a <Mail />.
          También puedes acudir a la Superintendencia de Industria y Comercio (SIC).
        </p>
      </Section>
    </>
  )
}

const PAGES: Record<LegalPage, { title: string; Content: () => ReactNode }> = {
  privacy: { title: 'Política de privacidad', Content: PrivacyContent },
  terms: { title: 'Condiciones del servicio', Content: TermsContent },
}

export default function LegalScreen({ page }: { page: LegalPage }) {
  const { title, Content } = PAGES[page]
  const other: LegalPage = page === 'privacy' ? 'terms' : 'privacy'

  useEffect(() => {
    document.title = `${title} · ${BRAND}`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <div style={{ minHeight: '100vh', background: '#F5EEE6', padding: '32px 16px 48px', boxSizing: 'border-box' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', background: '#FFFFFF', borderRadius: 20, border: '1px solid #EDE4D8', boxShadow: '0 8px 30px rgba(32,81,52,0.08)', padding: '28px 24px 32px', boxSizing: 'border-box' }}>
        <a href="/" aria-label={`Ir al inicio de ${BRAND}`}>
          <img src={logoSrc} alt={BRAND} style={{ height: 64, display: 'block', margin: '0 auto 12px' }} />
        </a>
        <h1 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 26, fontWeight: 700, color: '#205134', textAlign: 'center', margin: '0 0 4px' }}>{title}</h1>
        <p style={{ ...p, textAlign: 'center', color: '#8A8070', fontSize: 13, margin: '0 0 24px' }}>Última actualización: {UPDATED}</p>

        <Content />

        <nav style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 20px', marginTop: 32, paddingTop: 20, borderTop: '1px solid #EDE4D8' }}>
          <a href="/" style={{ ...p, ...link, margin: 0 }}>← Volver a {BRAND}</a>
          <a href={LEGAL_PATHS[other]} style={{ ...p, ...link, margin: 0 }}>{PAGES[other].title}</a>
        </nav>
      </article>
    </div>
  )
}
