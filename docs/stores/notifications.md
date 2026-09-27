# useNotificationsStore

A Pinia store (id `'notifications'`) for toast-style messages.

## Quickstart

```ts
import { useNotificationsStore, EToastType } from '@guebbit/vue-toolkit'

const notifications = useNotificationsStore()

// Show a toast that auto-hides after 4s
notifications.addMessage('Saved successfully', EToastType.SUCCESS, 4000)

// Render only the visible ones
notifications.messages // IToastMessage[]
```

## API

### Types

```ts
enum EToastType {
    PRIMARY = 'primary',
    SECONDARY = 'secondary',
    DANGER = 'error',
    WARNING = 'warning',
    SUCCESS = 'success'
}

interface IToastMessage {
    id: string
    message: string
    type: EToastType
    visible: boolean
}
```

### Messages (toasts)

| Property / method                          | Purpose                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `history`                                   | Ref — every toast ever added, including hidden ones.                                     |
| `messages`                                  | Computed — only `visible: true` entries from `history`.                                  |
| `addMessage(message, type?, timeout?)`      | Adds a toast and returns its id. `type` defaults to `PRIMARY`. When `timeout > 0` (ms), it auto-hides via `hideMessage` after that delay; the default `-1` means it persists until hidden/removed manually. |
| `findMessage(id)`                           | Finds a toast in `history` by id.                                                        |
| `hideMessage(id)`                           | Sets `visible = false` — the toast stays in `history`.                                   |
| `showMessage(id)`                           | Sets `visible = true`.                                                                    |
| `removeMessage(id)`                         | Permanently removes a toast from `history`.                                              |

## Gotchas

- **`history` grows unbounded unless you call `removeMessage`.** `hideMessage` only toggles
  visibility — it doesn't free anything. If you want toasts to actually disappear from memory
  after they're dismissed, call `removeMessage(id)` (you can do this in the same `setTimeout` you'd
  otherwise use for auto-hide, or right after `hideMessage`).
- **`addMessage`'s `timeout` default is `-1`** (persist forever) — pass a positive number
  explicitly for auto-dismissing toasts.
