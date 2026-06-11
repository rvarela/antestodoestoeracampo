import type { Metadata } from "next";
import { Suspense } from "react";
import { Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import NavigationTracker from "@/components/NavigationTracker";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Antes todo esto era campo",
  description:
    "Incendios, recalificaciones y poder en España. Una base de datos de casos documentados con fuentes públicas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavigationTracker />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
