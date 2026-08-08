import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Barlow_Condensed({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hilo Digital · Gestión de la Información",
  description: "Plataforma AWP/BIM — trazabilidad de datos de construcción de punta a punta",
  applicationName: "Hilo Digital",
  // iOS ignora `display: standalone` del manifiesto; obedece estas meta.
  appleWebApp: {
    capable: true,
    title: "Hilo",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  // Evita que iOS convierta códigos de CWP y números en enlaces telefónicos.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ff0000",
  width: "device-width",
  initialScale: 1,
  // Necesario para que el contenido llegue bajo el notch y las áreas seguras
  // funcionen; sin esto la app instalada deja franjas blancas.
  viewportFit: "cover",
  // El zoom por pinza rompe el visor 3D y los formularios de reporte.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Next 16 solo emite `mobile-web-app-capable`, que Safari honra recién desde
            iOS 17.4. Sin esta variante, en iOS anteriores la app agregada a la
            pantalla de inicio abre dentro del navegador en vez de pantalla completa.
            React 19 la eleva sola al <head>. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {children}
      </body>
    </html>
  );
}
