'use client'
import { createContext, useContext } from 'react'

export type StaffView = {
  name: string
  email: string
  roleLabels: string[]
  permissions: string[]
}

const StaffContext = createContext<StaffView | null>(null)

// Filled by the admin layout from the Data Access Layer. For showing and
// hiding controls only — every action is re-checked by its API.
export function StaffProvider({ value, children }: { value: StaffView; children: React.ReactNode }) {
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
}

export function useStaff() {
  const staff = useContext(StaffContext)
  return {
    staff,
    can: (permission: string) => Boolean(staff?.permissions.includes(permission)),
  }
}
