# useStructureDataManagement

The base primitive: a normalized `{ id -> record }` store with CRUD, selection state,
client-side pagination, and `hasMany`/`belongsTo` parent-relation bookkeeping. No networking —
[`useStructureRestApi`](/composables/structure-rest-api) builds fetching/caching on top of this.
Use it directly when you already have the data (e.g. from a WebSocket push, a props tree, a
non-REST source) and just need somewhere reactive and CRUD-shaped to put it.

## Quickstart

```ts
import { useStructureDataManagement } from '@guebbit/vue-toolkit'

interface IUser {
    id: number
    name: string
}

// <record type, id type>: K would otherwise default to the record's keys ('id' | 'name')
const users = useStructureDataManagement<IUser, number>('id')

users.addRecord({ id: 1, name: 'Alice' })
users.getRecord(1) // { id: 1, name: 'Alice' }

users.editRecord({ name: 'Alice Updated' }, 1) // merges into the existing record

users.itemList.value // IUser[] — computed view of the whole store
```

## API

### Setup

`useStructureDataManagement<T, K, P>(identifiers = 'id', delimiter = '|', recordStore?)`

- `T` is the record type, `K` its id type, `P` a parent's id type. Pass `K` explicitly: its
  default is `keyof T` (the record's field names), not the type of its id field.
- `identifiers` is a single field name, or an array of fields for composite keys (order matters);
  `delimiter` joins composite key parts into one dictionary key.
- `recordStore` (type `IRecordStore<T, K>`) is the write surface `addRecord`/`editRecord`/
  `deleteRecord`/`setRecords`/`resetRecords` go through. You will not normally pass one: the
  default is a local, in-memory dictionary.
  [`useStructureRestApi`](/composables/structure-rest-api) passes a TanStack-backed one, which
  turns the dictionary into a read-only view of the query cache.

| `IRecordStore` member        | Meaning                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `dictionary`                 | `Ref<Record<K, T>>`: the reactive read view.                                   |
| `write(id, item)`            | Stores one record. Whether it counts as freshly fetched is the store's own concern. |
| `remove(id)`                 | Removes one record.                                                            |
| `writeAll(items)`            | Replaces every record.                                                         |
| `clear()`                    | Removes every record.                                                          |

### CRUD

| Method / property                     | Purpose                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `itemDictionary`                       | The reactive `Record<K, T>` of every record (the record store's `dictionary`).                    |
| `itemList`                             | Computed array view of `itemDictionary`.                                                          |
| `getRecord(...idParts)`                | Look up one record. Accepts variadic parts for composite identifiers (joined internally).         |
| `getRecords(idsArray)`                 | Look up many records; each entry is a single id or an array of composite parts; misses are dropped. |
| `addRecord(itemData)`                  | Insert or overwrite one record. Returns `itemData`.                                               |
| `addRecords(itemsArray)`               | Bulk `addRecord`; falsy entries are skipped.                                                       |
| `editRecord(data, id?, create = true)` | Partial merge into an existing record, or creates it when `create` is `true`. `id` (`0` and `''` included) defaults to the id inside `data` when `create` is on; an array of composite parts is joined. Returns the new id if it created a record, `undefined` if it only updated one. |
| `editRecords(itemsArray)`              | Bulk `editRecord`; falsy entries are skipped.                                                      |
| `deleteRecord(id)`                     | Removes a record. Returns `true`, or `undefined` when there was none.                              |
| `setRecords(items)`                    | Replaces the whole dictionary. Returns `items`.                                                    |
| `resetRecords()`                       | Empties the dictionary.                                                                            |
| `createIdentifier(itemData, customIdentifiers?)` | Builds the dictionary key for an item; auto-generates and writes back a fallback id if one is missing. |
| `identifier`                           | The (possibly joined) identifier field name, as a plain string.                                    |

### Selection & last-inserted tracking

| Property                    | Purpose                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `selectedIdentifier`         | Ref — id of the "currently selected" record (list selection, detail page, ...).  |
| `selectedRecord`             | Computed record for `selectedIdentifier`.                                        |
| `lastInsertedIdentifier`     | Ref — id of the last record `addRecord` stored, or `editRecord` created (an `editRecord` that only updates leaves it alone). |
| `lastInsertedIdentifiers`    | Ref — ids from the most recent batch call: every record `addRecords` stored, or every record `editRecords` created. |
| `lastInsertedRecord`         | Computed record for `lastInsertedIdentifier`.                                    |

### Client-side pagination

Operates on `itemList` — for offline/already-fetched data. For server-side pagination, see
[`fetchPaginate`](/composables/structure-rest-api#one-shot-reads) on `useStructureRestApi`.

| Property        | Purpose                                          |
| ------------------ | --------------------------------------------------- |
| `pageCurrent`     | Ref — current page, 1-based.                       |
| `pageSize`        | Ref — items per page (default `10`).               |
| `pageTotal`       | Computed — total page count.                       |
| `pageOffset`      | Computed — index of the first item on the current page. |
| `pageItemList`    | Computed — `itemList` slice for the current page.  |

### `hasMany` / `belongsTo` relations

For child records that need to remember which parent they belong to:

| Method / property                     | Purpose                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `parentHasMany`                        | Ref — `Record<P, id[]>` mapping a parent id to its child ids.       |
| `addToParent(parentId, childId)`       | Appends a child id under a parent (lazily creates the list).        |
| `removeFromParent(parentId, childId)`  | Removes a child id from a parent's list.                            |
| `removeDuplicateChildren(parentId)`    | Dedupes a parent's child-id list.                                    |
| `getRecordsByParent(parentId?)`        | Resolves a parent's child ids into a `Record<K, T>` of full records. `0` and `''` are real parent ids; only an omitted (`undefined`) one returns `{}`. |
| `getListByParent(parentId?)`           | Same, as an array in the relation's order.                            |

### Fallback ids

Missing identifiers are filled in with `getUuid()` from
[`@guebbit/js-toolkit`](https://www.npmjs.com/package/@guebbit/js-toolkit) — a random v4 UUID
(`crypto.randomUUID()` when available; otherwise, as in a browser on a non-secure origin, the same
shape built from `crypto.getRandomValues`). The same helper backs `useNotificationsStore` toast
ids. Import it from
`@guebbit/js-toolkit` if you need it yourself.

## Gotchas

- **Identifier changes don't rekey the dictionary.** If a partial `editRecord` call changes a
  field that's part of the identifier, the record stays under its *old* dictionary key — you get
  an orphaned entry, not a moved one. Delete and re-add if you need to change an id.
- **Missing ids get a fallback, loudly.** If you `addRecord`/`editRecord` an item without its
  identifier field(s) set, a random id is generated and written back onto the item — and a
  `console.warn` fires so it's visible in dev tools rather than silently wrong.
- **Composite identifiers** can be passed as multiple arguments (`getRecord('part1', 'part2')`),
  which are joined with `delimiter`, or as the joined id `createIdentifier` builds.
- **Nothing here evicts by age.** The dictionary is only cleared by `resetRecords()` (or, on
  `useStructureRestApi`, by `resetAll()`, a `dependsOn` change or the `maxRecords` critical-mass
  wipe). Stale data is treated as useful data, not garbage.
