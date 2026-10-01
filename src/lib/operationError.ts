import { NextResponse } from 'next/server'

/** A business rule refused an operation; carries the HTTP status to answer with. */
export class OperationError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message)
    this.name = 'OperationError'
  }
}

export function operationErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof OperationError) {
    return NextResponse.json({ error: err.message, ...(err.details ?? {}) }, { status: err.status })
  }
  return null
}
