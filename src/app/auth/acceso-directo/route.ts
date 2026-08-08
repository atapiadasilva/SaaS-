import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Acceso directo sin pantalla de login (modo tablet de terreno).
 *
 * Abre sesión sola con la cuenta indicada en `HILO_ACCESO_DIRECTO_EMAIL` y deja
 * al usuario dentro de la app. Está pensado para un iPad de obra que se usa como
 * pantalla de consulta, donde escribir correo y contraseña con guantes no es
 * viable.
 *
 * ADVERTENCIA: mientras esta variable esté puesta, cualquiera que abra la URL
 * queda dentro con todos los permisos de esa cuenta. Solo debe usarse en equipos
 * de confianza y en redes cerradas. Si la variable no está, la ruta no existe
 * para efectos prácticos y la app pide login normalmente.
 *
 * No guarda ninguna contraseña: usa la llave de servicio para emitir un enlace de
 * un solo uso y lo canjea en el acto por una sesión.
 */
/**
 * Redirige con una ruta relativa en vez de una absoluta. `new URL(request.url).origin`
 * devuelve `localhost` cuando el servidor se alcanza por la IP de la red local, y eso
 * en una tablet apunta a la tablet misma: la sesión se abre y el equipo queda mirando
 * una página que no existe. El navegador resuelve la ruta relativa contra la dirección
 * real desde la que entró.
 */
function redirigirA(ruta: string) {
  return new NextResponse(null, { status: 303, headers: { Location: ruta } })
}

export async function GET() {
  const email = process.env.HILO_ACCESO_DIRECTO_EMAIL

  if (!email) {
    return redirigirA('/auth/login')
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[acceso-directo] Falta SUPABASE_SERVICE_ROLE_KEY')
    return redirigirA('/auth/login?error=acceso_directo')
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Emite un token de un solo uso para esa cuenta. No envía correo: solo devuelve
  // el token, que canjeamos aquí mismo.
  const { data, error: errorEnlace } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  const tokenHash = data?.properties?.hashed_token
  if (errorEnlace || !tokenHash) {
    console.error(
      `[acceso-directo] No se pudo emitir el token para ${email}: ${errorEnlace?.message ?? 'sin token'}`
    )
    return redirigirA('/auth/login?error=acceso_directo')
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // Canjear el token deja las cookies de sesión puestas en la respuesta.
  const { error: errorSesion } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })

  if (errorSesion) {
    console.error(`[acceso-directo] No se pudo abrir la sesión: ${errorSesion.message}`)
    return redirigirA('/auth/login?error=acceso_directo')
  }

  return redirigirA('/organizaciones')
}
