import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas que no requieren sesión
const PUBLICAS = ["/", "/login", "/registro", "/terminos", "/auth", "/instalar"];

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresca la sesión (obligatorio para Server Components)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some(
    (p) => ruta === p || (p !== "/" && ruta.startsWith(p + "/")) || ruta.startsWith("/auth")
  );

  if (!user && !esPublica && !ruta.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("desde", ruta);
    return NextResponse.redirect(url);
  }

  return respuesta;
}

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes y el service worker
    "/((?!_next/static|_next/image|favicon.ico|sw.js|iconos|assets|manifest.webmanifest).*)",
  ],
};
