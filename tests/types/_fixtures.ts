/**
 * Shared record shape for the type-level tests. Not itself a `*.test-d.ts` file — no assertions
 * here, just the fixture the others import.
 */
export interface IUser {
    id: number;
    name: string;
    email: string;
}
