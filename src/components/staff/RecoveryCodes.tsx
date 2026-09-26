'use client'
import { useState } from 'react'

// Shown exactly once, right after the codes are created.
export default function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')
  return (
    <div>
      <p className="text-sm text-gray-700">
        Save these recovery codes somewhere safe (a password manager, or printed and locked away). Each one
        signs you in once if you lose your phone. <strong>They will not be shown again.</strong>
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-4 font-mono text-sm text-gray-900">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? 'Copied' : 'Copy codes'}
        </button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Millionaires Club recovery codes\n\n${text}\n`)}`}
          download="mc-recovery-codes.txt"
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Download
        </a>
      </div>
    </div>
  )
}
