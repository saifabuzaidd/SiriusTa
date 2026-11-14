import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SiriusTa — Guiding Every Harvest",
  description:
    "Agro-satellite intelligence engine: dual-coordinate (target vs matched zone) examination combining FAO HWSD soil, NASA POWER climatology, SMAP/MODIS telemetry, Open-Meteo forecast and NOAA MJO teleconnection into irrigation, nutrition and crop-rotation advice.",
  keywords: [
    "SiriusTa",
    "precision agriculture",
    "NASA POWER",
    "SoilGrids",
    "MJO",
    "crop recommendation",
    "AEZ",
    "irrigation advisory",
  ],
  authors: [{ name: "SiriusTa" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "SiriusTa — Guiding Every Harvest",
    description: "Agro-satellite intelligence: soil, climate, telemetry & MJO-driven harvest guidance.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
