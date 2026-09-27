/**
 * PROPERTY — useStructureDataManagement: the dictionary, identifiers, client-side pagination and
 * belongsTo relations, checked across generated inputs rather than hand-picked examples.
 *
 * `createIdentifier`'s "different tuples never collide" property is the regression test for the
 * composite-id collision fix (`src/internal/identifierJoin.ts`): it fails on a plain `.join()`.
 */
import fc from 'fast-check';
import { useStructureDataManagement } from '../../src/composables/structureDataManagement';
import { recordListByIds, recordsByIds } from '../../src/internal/recordLookup';

interface IModelItem {
    id: number;
    tag: string;
}

/** One instruction of the addRecord/editRecord/deleteRecord model sequence. */
type TModelOp =
    | { kind: 'add'; item: IModelItem }
    | { kind: 'edit'; id: number; tag: string }
    | { kind: 'delete'; id: number };

/** A small, overlapping id pool, so a sequence actually exercises add-over-add, edit, delete. */
const idArbitrary = fc.integer({ min: 0, max: 4 });

const modelOpArbitrary: fc.Arbitrary<TModelOp> = fc.oneof(
    fc.record({
        kind: fc.constant('add' as const),
        item: fc.record({ id: idArbitrary, tag: fc.string() })
    }),
    fc.record({ kind: fc.constant('edit' as const), id: idArbitrary, tag: fc.string() }),
    fc.record({ kind: fc.constant('delete' as const), id: idArbitrary })
);

describe('PROPERTY · createIdentifier — single identifier', () => {
    it('returns the identifier field value unchanged when present', () => {
        fc.assert(
            fc.property(fc.string(), fc.string(), (id, name) => {
                const c = useStructureDataManagement<{ id: string; name: string }, string>('id');
                expect(c.createIdentifier({ id, name })).toBe(id);
            })
        );
    });
});

describe('PROPERTY · createIdentifier — composite identifiers', () => {
    it('the same record produces the same id on every call', () => {
        fc.assert(
            fc.property(fc.string(), fc.string(), (a, b) => {
                const c = useStructureDataManagement<{ a: string; b: string }>(['a', 'b']);
                const record = { a, b };
                expect(c.createIdentifier(record)).toBe(c.createIdentifier(record));
            })
        );
    });

    it('different tuples never collide, even when a value contains the delimiter', () => {
        // Independently-random strings essentially never coincidentally collide (the join needs
        // a1+'|'+b1 === a2+'|'+b2 character-for-character) — so instead of hoping to stumble on
        // one, this BUILDS the collision a naive join always has: for any p/m/s, ('${p}|${m}', s)
        // and (p, '${m}|${s}') both naively join to 'p|m|s'. The escaping fix
        // (src/internal/identifierJoin.ts) is exactly what tells these two tuples apart.
        fc.assert(
            fc.property(fc.string(), fc.string(), fc.string(), (p, m, s) => {
                const c = useStructureDataManagement<{ a: string; b: string }>(['a', 'b']);
                const idOne = c.createIdentifier({ a: `${p}|${m}`, b: s });
                const idTwo = c.createIdentifier({ a: p, b: `${m}|${s}` });
                expect(idOne).not.toBe(idTwo);
            })
        );
    });
});

// '__proto__' is excluded: recordsByIds writes into a plain object with `result[id] = value`,
// and that one string key sets the prototype instead of an own property — a pre-existing,
// unrelated quirk of bracket assignment that isn't what this property is pinning down.
const idOf = fc.string().filter((id) => id !== '__proto__');

describe('PROPERTY · recordListByIds / recordsByIds', () => {
    it('recordListByIds keeps the ids order and skips ids with no record', () => {
        fc.assert(
            fc.property(
                fc.array(fc.tuple(idOf, fc.jsonValue())),
                fc.array(idOf),
                (entries, ids) => {
                    const store = new Map(entries);
                    const getRecord = (id: string): unknown => store.get(id);
                    const expected = ids.filter((id) => store.has(id)).map((id) => store.get(id));
                    expect(recordListByIds(ids, getRecord)).toEqual(expected);
                }
            )
        );
    });

    it('recordsByIds returns only requested ids, values matching the store', () => {
        fc.assert(
            fc.property(
                fc.array(fc.tuple(idOf, fc.jsonValue())),
                fc.array(idOf),
                (entries, ids) => {
                    const store = new Map(entries);
                    const getRecord = (id: string): unknown => store.get(id);
                    const result = recordsByIds(ids, getRecord);
                    for (const key of Object.keys(result)) {
                        expect(ids).toContain(key);
                        expect(result[key]).toEqual(store.get(key));
                    }
                }
            )
        );
    });
});

describe('PROPERTY · client-side pagination', () => {
    it('walking every page reconstructs itemList exactly, each page holding at most pageSize items', () => {
        fc.assert(
            fc.property(
                fc.array(fc.record({ id: fc.integer(), name: fc.string() }), { maxLength: 40 }),
                // Includes values below 1, to exercise the pageSize clamp (§9 open decision #2).
                fc.integer({ min: -5, max: 20 }),
                (items, requestedPageSize) => {
                    const c = useStructureDataManagement<{ id: number; name: string }, number>(
                        'id'
                    );
                    // Duplicate ids collapse to their last occurrence, same as the dictionary would.
                    c.setRecords(Object.fromEntries(items.map((item) => [item.id, item])));
                    c.pageSize.value = requestedPageSize;

                    expect(c.pageSize.value).toBeGreaterThanOrEqual(1);
                    const collected: { id: number; name: string }[] = [];
                    for (let page = 1; page <= c.pageTotal.value; page++) {
                        c.pageCurrent.value = page;
                        expect(c.pageItemList.value.length).toBeLessThanOrEqual(c.pageSize.value);
                        collected.push(...c.pageItemList.value);
                    }
                    expect(collected).toEqual(c.itemList.value);
                    expect(c.pageTotal.value).toBe(
                        Math.ceil(c.itemList.value.length / c.pageSize.value)
                    );
                }
            )
        );
    });
});

describe('PROPERTY · addRecord / editRecord / deleteRecord sequences', () => {
    it('the dictionary matches a plain Map model after any sequence', () => {
        fc.assert(
            fc.property(fc.array(modelOpArbitrary, { maxLength: 30 }), (ops) => {
                const c = useStructureDataManagement<IModelItem, number>('id');
                const model = new Map<number, Partial<IModelItem>>();
                for (const op of ops) {
                    switch (op.kind) {
                        case 'add': {
                            c.addRecord(op.item);
                            model.set(op.item.id, { ...op.item });
                            break;
                        }
                        case 'edit': {
                            c.editRecord({ tag: op.tag }, op.id, true);
                            model.set(op.id, { ...model.get(op.id), tag: op.tag });
                            break;
                        }
                        case 'delete': {
                            c.deleteRecord(op.id);
                            model.delete(op.id);
                            break;
                        }
                    }
                }
                const expected = Object.fromEntries(model.entries());
                expect(c.itemDictionary.value).toEqual(expected);
            })
        );
    });
});

describe('PROPERTY · addToParent / removeFromParent / removeDuplicateChildren', () => {
    it('removing a just-added child restores the previous children exactly', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 10 }),
                fc.integer({ min: 0, max: 5 }),
                (existingChildren, addedChild) => {
                    // addToParent never dedupes on its own (removeDuplicateChildren exists for
                    // that, see the next test), so re-adding an already-present child and removing
                    // it would strip every occurrence, not just the one just added.
                    fc.pre(!existingChildren.includes(addedChild));
                    const c = useStructureDataManagement<Record<string, unknown>>('id');
                    for (const id of existingChildren) c.addToParent('p', id);
                    const before = [...(c.parentHasMany.value.p ?? [])];

                    c.addToParent('p', addedChild);
                    c.removeFromParent('p', addedChild);

                    expect(c.parentHasMany.value.p ?? []).toEqual(before);
                }
            )
        );
    });

    it('removeDuplicateChildren leaves no repeated child id', () => {
        fc.assert(
            fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 15 }), (childIds) => {
                const c = useStructureDataManagement<Record<string, unknown>>('id');
                for (const id of childIds) c.addToParent('p', id);

                c.removeDuplicateChildren('p');

                const children = c.parentHasMany.value.p ?? [];
                expect(new Set(children).size).toBe(children.length);
            })
        );
    });
});
