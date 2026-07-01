import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { AppBackground } from "@/components/AppBackground";

export const metadata: Metadata = {
  title: "AirMeal — AI-Assisted Inflight Dining",
  description:
    "Personalised, allergen-safe onboard food & beverage distribution powered by AI. For passengers, cabin crew, and airline admins.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('airmeal-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
            {/* Canvas + glow at z-index: 0, fixed to viewport on every page */}
            <AppBackground />
            {/* All page content at z-index: 1 — sits above the canvas */}
            <div style={{ position: "relative", zIndex: 1 }}>
              {children}
            </div>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

