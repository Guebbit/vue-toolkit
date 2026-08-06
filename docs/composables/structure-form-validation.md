# useStructureFormValidation

Reactive form state with optional [Zod](https://zod.dev) schema validation and a submit-flow
wrapper (validate, then call your handler, tracking `isSubmitting` around it).

## Quickstart

```ts
import { z } from 'zod'
import { useStructureFormValidation } from '@guebbit/vue-toolkit'

interface ILoginForm {
    email: string
    password: string
}

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
})

const login = useStructureFormValidation<ILoginForm>({ email: '', password: '' }, loginSchema)

login.setForm({ email: 'jane@example.com', password: 'hunter22' })

await login.handleSubmit(async (data) => {
    // data is typed as ILoginForm, and already validated against loginSchema
    await api.post('/login', data)
})
```

`handleSubmit` validates first and skips calling your handler if validation fails — check the
return value (`true`/`false`) or read `login.formErrors.value` / `login.isValid.value` to drive
the UI.

## Translated messages, and errors already on screen

Two separate problems, and it is worth being clear about which is which.

**The next validation's language** is a schema concern. `schema` accepts a plain schema, a ref or
a getter, and `toValue` is applied inside `validate()` and nowhere else — so a plain schema whose
messages are *thunks* is resolved exactly as late as a getter would be:

```ts
const loginSchema = z.object({
    email: z.string().email({ error: () => t('login.email-invalid') })
})

const login = useStructureFormValidation<ILoginForm>({ email: '', password: '' }, loginSchema)
```

Prefer this over `() => createLoginSchema(t)`. A getter that is accidentally *called* at the call
site — `createLoginSchema(t)` instead of `() => createLoginSchema(t)` — type-checks, runs, and
silently freezes the language; a thunk inside the schema module has no call site to get wrong.

**Errors already on screen** are not a schema concern at all. `validate()` copies resolved
*strings* into `formErrors`; once it has returned, those strings are inert text and the schema is
out of the picture. Switching language re-renders the labels and leaves the error under them in
the old language until the next keystroke or submit. `revalidateOn` fixes that by re-running
`validate()` over the unchanged data:

```ts
const { locale } = useI18n()

const login = useStructureFormValidation<ILoginForm>({ email: '', password: '' }, loginSchema, {
    revalidateOn: locale
})
```

It only fires for a form that currently has errors showing, so a pristine form does not sprout red
text because someone changed the language. `revalidateOn` takes any `WatchSource` or array of
them — it is not i18n-specific, and the toolkit deliberately knows nothing about vue-i18n.

## API

`useStructureFormValidation<T>(initialData: T = {}, schema?: MaybeRefOrGetter<ZodType<T>>, options?)`
— `schema` is optional; without one, `validate()` always passes.

`options`:

| Option          | Type                            | Purpose                                                                                 |
| --------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| `revalidateOn`  | `WatchSource \| WatchSource[]`  | Re-runs `validate()` over unchanged data when a source changes, but only while errors are on display. See above. |

| Property / method                      | Purpose                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `form`                                   | Ref holding the reactive form data. Initialized as a shallow copy of `initialData`.             |
| `formErrors`                             | Ref — `Partial<Record<keyof T, string[]>>`, per-field error messages.                          |
| `isSubmitting`                           | Ref — `true` while `handleSubmit`'s handler is running.                                         |
| `isValid`                                | Computed — `true` when `formErrors` has no keys.                                                |
| `isDirty`                                | Computed — `true` when `form` differs from `initialData` (compared via `JSON.stringify`).       |
| `setForm(data)`                          | Shallow-merges partial data into `form`.                                                        |
| `resetForm()`                            | Restores `form` to `initialData` and clears `formErrors`.                                       |
| `clearErrors()`                          | Clears all `formErrors`.                                                                         |
| `setFieldError(field, errors)`           | Sets error message(s) for one field — accepts a string or a string array.                       |
| `clearFieldError(field)`                 | Removes errors for one field.                                                                    |
| `validate()`                             | Runs `schema.safeParse(form.value)`, populates `formErrors` on failure, returns a boolean.       |
| `handleSubmit(onSubmit, withValidation?)`| Validates (unless `withValidation` is `false`), then awaits `onSubmit(form.value)` with `isSubmitting` set around it. Returns `true` on success, `false` on validation failure. |

## Gotchas

- **`handleSubmit` doesn't catch errors from your handler.** Only `isSubmitting` is guaranteed to
  be reset (in a `finally`) — if `onSubmit` throws or rejects, the promise from `handleSubmit`
  rejects too. Wrap the call in your own `try`/`catch` if you need to handle submit failures.
- **Zod error grouping is top-level only.** Each issue is filed under `issue.path[0]` — a nested
  field like `address.city` collapses to the `address` key in `formErrors`, not
  `formErrors.address.city`. Fine for flat forms; for nested schemas you'll need to read
  `issue.path` yourself if you want per-nested-field messages.
- **`isDirty` is a `JSON.stringify` comparison** — it won't handle key-order-insensitive equality
  or non-serializable values (functions, `Date` instances, etc.) specially.
