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

/**
 * Every other tuple a plain `.join(delimiter)` cannot tell apart from `[a, b]`: `a + delimiter +
 * b` cut at each other occurrence of `delimiter`.
 *
 * @param a - the first value
 * @param b - the second value
 * @param delimiter - the separator joining them
 * @returns the other `[a, b]` splits of the same joined string
 */
const otherSplits = (a: string, b: string, delimiter: string): [string, string][] => {
    const joined = `${a}${delimiter}${b}`;
    const splits: [string, string][] = [];
    for (let at = joined.indexOf(delimiter); at !== -1; at = joined.indexOf(delimiter, at + 1))
        if (at !== a.length)
            splits.push([joined.slice(0, at), joined.slice(at + delimiter.length)]);
    return splits;
};

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

    // Known bug: escapeSegment (src/internal/identifierJoin.ts) escapes whole occurrences of the
    // delimiter, which only disambiguates a single character other than the escape character.
    it.failing('different tuples never collide, whatever the delimiter', () => {
        // Two characters, one of them the escape character: the delimiter then often overlaps
        // itself or the values around it, which is where a join can turn ambiguous.
        const piece = (minLength: number) =>
            fc.string({ unit: fc.constantFrom(':', '\\'), minLength, maxLength: 3 });

        fc.assert(
            fc.property(piece(1), piece(0), piece(0), (delimiter, a, b) => {
                const c = useStructureDataManagement<{ a: string; b: string }>(
                    ['a', 'b'],
                    delimiter
                );
                const id = c.createIdentifier({ a, b });
                for (const [otherA, otherB] of otherSplits(a, b, delimiter))
                    expect(c.createIdentifier({ a: otherA, b: otherB })).not.toBe(id);
            }),
            // A floor, so a low FC_NUM_RUNS cannot skip every ambiguous case
            { numRuns: Math.max(100, fc.readConfigureGlobal().numRuns ?? 0) }
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

    it('recordsByIds holds exactly the requested ids that have a record, with the stored values', () => {
        fc.assert(
            fc.property(
                fc.array(fc.tuple(idOf, fc.jsonValue())),
                fc.array(idOf),
                (entries, otherIds) => {
                    const store = new Map(entries);
                    const getRecord = (id: string): unknown => store.get(id);
                    // Every stored id, plus others that are mostly not stored
                    const ids = [...store.keys(), ...otherIds];
                    const expected = Object.fromEntries(
                        ids.filter((id) => store.has(id)).map((id) => [id, store.get(id)])
                    );

                    expect(recordsByIds(ids, getRecord)).toEqual(expected);
                }
            )
        );
    });
});

/** A record of the pagination properties. */
interface IPageItem {
    id: number;
    name: string;
}

/** Up to 40 records, duplicate ids included. */
const pageItemsArbitrary = fc.array(fc.record({ id: fc.integer(), name: fc.string() }), {
    maxLength: 40
});

/**
 * A composable holding `items`, with `pageSize` written as given. Duplicate ids collapse to their
 * last occurrence, same as the dictionary would.
 *
 * @param items - the records
 * @param pageSize - the value written to `pageSize`
 * @returns the composable
 */
const paginated = (items: IPageItem[], pageSize: number) => {
    const c = useStructureDataManagement<IPageItem, number>('id');
    c.setRecords(Object.fromEntries(items.map((item) => [item.id, item])));
    c.pageSize.value = pageSize;
    return c;
};

/**
 * Walks every page: each holds at most `pageSize` records, and together, over `pageTotal` pages,
 * they are `itemList` exactly.
 *
 * @param c - the composable to walk
 */
const expectPagesToPartitionItemList = (c: ReturnType<typeof paginated>) => {
    const collected: IPageItem[] = [];
    for (let page = 1; page <= c.pageTotal.value; page++) {
        c.pageCurrent.value = page;
        expect(c.pageItemList.value.length).toBeLessThanOrEqual(c.pageSize.value);
        collected.push(...c.pageItemList.value);
    }
    expect(collected).toEqual(c.itemList.value);
    expect(c.pageTotal.value).toBe(Math.ceil(c.itemList.value.length / c.pageSize.value));
};

describe('PROPERTY · client-side pagination', () => {
    it('walking every page reconstructs itemList exactly, each page holding at most pageSize items', () => {
        fc.assert(
            fc.property(
                pageItemsArbitrary,
                // Includes values below 1, to exercise the pageSize clamp (§9 open decision #2).
                fc.integer({ min: -5, max: 20 }),
                (items, requestedPageSize) => {
                    const c = paginated(items, requestedPageSize);

                    expect(c.pageSize.value).toBeGreaterThanOrEqual(1);
                    expectPagesToPartitionItemList(c);
                }
            )
        );
    });

    // Known bug: the pageSize customRef (src/composables/structureDataManagement.ts) clamps with
    // Math.max(1, value), which lets NaN through (pageTotal NaN) and keeps a fraction as written.
    it.failing('pageSize stays a whole number of at least 1 when written NaN or a fraction', () => {
        fc.assert(
            fc.property(
                pageItemsArbitrary,
                // What a clamp to 1 cannot mend (integers are the property above)
                fc.oneof(
                    fc.constant(Number.NaN),
                    fc.double({ min: 1, max: 40, noNaN: true, noInteger: true })
                ),
                (items, requestedPageSize) => {
                    const c = paginated(items, requestedPageSize);

                    expect(c.pageSize.value % 1).toBe(0);
                    expect(c.pageSize.value).toBeGreaterThanOrEqual(1);
                    expectPagesToPartitionItemList(c);
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
                    // A child the parent already lists makes the add a no-op, and the removal
                    // then unlinks it for good: this is about a child new to the parent.
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

    // Known bug: the local relation store's addToParent (src/composables/structureDataManagement.ts)
    // pushes unconditionally, where IRelationStore promises a no-op for a child already linked.
    it.failing('addToParent links a child once, however often it is added', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 10 }),
                (childIds) => {
                    const c = useStructureDataManagement<Record<string, unknown>>('id');
                    // Every id twice over, so each one is re-added at least once
                    for (const id of [...childIds, ...childIds]) c.addToParent('p', id);

                    expect(c.parentHasMany.value.p).toEqual([...new Set(childIds)]);
                }
            )
        );
    });

    it('removeDuplicateChildren keeps every distinct child once, in first-seen order', () => {
        fc.assert(
            fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 15 }), (childIds) => {
                const c = useStructureDataManagement<Record<string, unknown>>('id');
                // Seeded directly: repeats come from outside addToParent (a server's list, say)
                c.parentHasMany.value = { p: childIds };

                c.removeDuplicateChildren('p');

                expect(c.parentHasMany.value.p).toEqual([...new Set(childIds)]);
            })
        );
    });
});
