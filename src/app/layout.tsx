import type { Metadata } from 'next'
import { connection } from 'next/server'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Millionaires Club — Admin',
  description: 'Club management system',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render every page per request so each gets the CSP nonce set in
  // src/proxy.ts (static pages would carry no nonce and be blocked).
  await connection()
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{
          backgroundColor: '#f8fafc',
          color: '#0f172a',
          minHeight: '100vh',
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
