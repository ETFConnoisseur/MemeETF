import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MTF",
  description: "Create, list, and trade custom ETFs made up of Solana tokens",
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Minimal layout - Vite app handles its own UI
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
