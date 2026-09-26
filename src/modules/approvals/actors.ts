/** Who proposed an operation, and who (if anyone) approved it. */
export type StaffRef = { id: string; email: string }
export type Actors = { maker: StaffRef; checker: StaffRef | null }
