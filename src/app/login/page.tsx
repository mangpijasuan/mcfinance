'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('admin', { email, password, redirect: false })
    if (res?.ok) {
      router.push('/dashboard')
    } else {
      setError('Invalid email or password')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1B2A4A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400 text-[#1B2A4A] font-bold text-xl mb-4">MC</div>
          <h1 className="text-2xl font-bold text-white">Millionaires Club</h1>
          <p className="text-white/50 text-sm mt-1">Admin Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-2xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="admin@millionairesclub.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-[#1B2A4A] hover:bg-[#243660] text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60 mt-2"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-xs text-gray-400 pt-1">
            Member?{' '}
            <a href="/portal/login" className="text-indigo-600 hover:underline">Member portal →</a>
          </p>
        </form>
      </div>
    </div>
  )
}
