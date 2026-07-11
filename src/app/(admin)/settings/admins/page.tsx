'use client'

import { useEffect, useState } from 'react'

type AdminRecord = {
  id: string
  name: string
  email: string
  role: 'admin' | 'super_admin'
  roleLabel: string
  createdAt: string
}

const blankForm = {
  name: '',
  email: '',
  password: '',
  role: 'admin',
} as const

export default function AdminSettingsPage() {
  const [admins, setAdmins] = useState<AdminRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ ...blankForm })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function loadAdmins() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admins', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Unable to load admin accounts.')
      setLoading(false)
      return
    }
    setAdmins(data.admins || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAdmins()
  }, [])

  function updateField(field: 'name' | 'email' | 'password' | 'role', value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Unable to create admin.')
      setSaving(false)
      return
    }

    setForm({ ...blankForm })
    setMessage('Admin account created.')
    setSaving(false)
    await loadAdmins()
  }

  async function saveRole(adminId: string, role: 'admin' | 'super_admin') {
    setError('')
    setMessage('')
    const res = await fetch(`/api/admins/${adminId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Unable to update admin role.')
      return
    }
    setMessage('Admin role updated.')
    setEditingId(null)
    await loadAdmins()
  }

  async function resetPassword(adminId: string) {
    const password = window.prompt('Enter a new password for this admin (minimum 8 characters).')
    if (!password) return

    setError('')
    setMessage('')
    const res = await fetch(`/api/admins/${adminId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Unable to reset password.')
      return
    }
    setMessage('Password updated.')
  }

  async function removeAdmin(adminId: string) {
    const confirmed = window.confirm('Delete this admin account? This cannot be undone.')
    if (!confirmed) return

    setError('')
    setMessage('')
    const res = await fetch(`/api/admins/${adminId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Unable to delete admin.')
      return
    }
    setMessage('Admin account deleted.')
    await loadAdmins()
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Access Control</h1>
        <p className="text-sm text-gray-600 mt-1">Super Admin can create, edit, promote, demote, and remove admin accounts.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900">Create Admin Account</h2>
        <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Access Level</span>
            <select value={form.role} onChange={(e) => updateField('role', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <button disabled={saving} type="submit" className="rounded-xl bg-[#1B2A4A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#243660] disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Admin'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Current Admin Accounts</h2>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-gray-500">Loading admin accounts…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-left font-medium">Email</th>
                  <th className="px-5 py-3 text-left font-medium">Role</th>
                  <th className="px-5 py-3 text-left font-medium">Created</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id} className="border-t border-gray-100">
                    <td className="px-5 py-4 font-medium text-gray-900">{admin.name}</td>
                    <td className="px-5 py-4 text-gray-600">{admin.email}</td>
                    <td className="px-5 py-4">
                      {editingId === admin.id ? (
                        <select
                          defaultValue={admin.role}
                          onChange={(e) => saveRole(admin.id, e.target.value as 'admin' | 'super_admin')}
                          className="rounded-lg border border-gray-200 px-3 py-2"
                        >
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      ) : (
                        <button onClick={() => setEditingId(admin.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                          {admin.roleLabel}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{new Date(admin.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => resetPassword(admin.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          Reset Password
                        </button>
                        <button onClick={() => removeAdmin(admin.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!admins.length && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">No admin accounts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
