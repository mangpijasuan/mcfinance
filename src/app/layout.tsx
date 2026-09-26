import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/brand'

export const metadata: Metadata = {
  title: `${APP_NAME} - Administration`,
  description: APP_DESCRIPTION,
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
