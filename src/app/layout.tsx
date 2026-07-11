import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Millionaires Club — Admin',
  description: 'Club management system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
