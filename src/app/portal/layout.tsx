import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/brand'
import '@fontsource-variable/inter'

// Members see the portal's own name in the browser tab (the rest of the
// app is titled "MC Finance — Administration").
export const metadata: Metadata = {
  title: `${APP_NAME} — Member Portal`,
}

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="font-portal antialiased">{children}</div>
}
