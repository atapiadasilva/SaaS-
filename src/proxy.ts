import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas llamadas por servicios externos (no por un navegador con sesión). Deben traer su
// propia autenticación (secreto compartido) para quedar fuera del guard de sesión.
// Vacío hoy: toda ruta exige sesión.
const PUBLIC_WEBHOOK_PATHS: string[] = []

export async function proxy(request: NextRequest) {
  if (PUBLIC_WEBHOOK_PATHS.some(p => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresca la sesión del usuario (IMPORTANTE: no remover)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/auth')
  const isResetPassword = pathname === '/auth/reset-password'

  // Redirigir a login si no hay sesión activa. Con HILO_ACCESO_DIRECTO_EMAIL puesta
  // (modo tablet de terreno) se salta la pantalla de login y se abre la sesión sola;
  // ver src/app/auth/acceso-directo/route.ts para la advertencia de seguridad.
  if (!user && !isAuthRoute) {
    const destino = request.nextUrl.clone()
    destino.pathname = process.env.HILO_ACCESO_DIRECTO_EMAIL
      ? '/auth/acceso-directo'
      : '/auth/login'
    return NextResponse.redirect(destino)
  }

  // Redirigir a organizaciones si ya está autenticado y va a login
  // (excepto reset-password que necesita sesión para actualizar la contraseña)
  if (user && isAuthRoute && !isResetPassword) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/organizaciones'
    return NextResponse.redirect(homeUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // El manifiesto lo pide iOS/Android sin cookies al instalar la app: si cae en el
    // guard de sesión responde un redirect al login y el sistema no la reconoce como
    // instalable.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
