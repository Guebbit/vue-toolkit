/**
 * The composable's whole reason to exist is that it probes *only while down* and *slowly*. That
 * contract is invisible to types and invisible to a single-probe test: it breaks the moment two
 * retry chains exist at once, and the symptom is a background request storm nobody attributes to
 * a banner. So most of what is asserted here is the number of probes over time, not the flag.
 */
import { effectScope, type EffectScope } from 'vue';
import { useLivenessProbe } from '../src/composables/livenessProbe';

/**
 * Lets a probe's promise chain settle without advancing the fake clock.
 *
 * Several hops rather than one: the composable's own `.then`/`.catch` is a link of its own, and
 * a probe wrapped in another promise adds more, so a single tick reads the state from before
 * they ran.
 */
const settle = async () => {
    for (let hop = 0; hop < 5; hop++) await Promise.resolve();
};

/** Every scope a test built: `afterEach` stops them all, whether its assertions passed or not. */
const scopes: EffectScope[] = [];

/**
 * Runs the composable inside an effect scope, so the auto-teardown path is the one under test
 * rather than a manual `stop()` no consumer would remember to call. Registered before it runs, so
 * a composable that throws on creation is still torn down.
 */
const inScope = <T>(run: () => T) => {
    const scope = effectScope();
    scopes.push(scope);
    const result = scope.run(run) as T;
    return { result, dispose: () => scope.stop() };
};

/** A probe that throws before it ever returns a promise. */
const throwSynchronously = (): Promise<unknown> => {
    throw new Error('no network stack');
};

let probe: jest.Mock<Promise<unknown>, []>;
let target: EventTarget;

beforeEach(() => {
    jest.useFakeTimers();
    probe = jest.fn<Promise<unknown>, []>().mockRejectedValue(new Error('unreachable'));
    target = new EventTarget();
});

afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop();
    jest.useRealTimers();
    jest.clearAllMocks();
});

describe('useLivenessProbe', () => {
    describe('the flag', () => {
        it('starts up, since nothing has failed yet', () => {
            const { result } = inScope(() => useLivenessProbe(probe, { immediate: false, target }));
            expect(result.down.value).toBe(false);
        });

        it('reports down after a failed probe and up again once one succeeds', () => {
            const { result } = inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    expect(result.down.value).toBe(true);
                    probe.mockResolvedValue({});
                    target.dispatchEvent(new Event('online'));
                    return settle();
                })
                .then(() => {
                    expect(result.down.value).toBe(false);
                });
        });

        it('never rejects, so a caller awaiting a check cannot be caught out', () => {
            const { result } = inScope(() => useLivenessProbe(probe, { immediate: false, target }));
            return result.check().then(() => {
                expect(result.down.value).toBe(true);
            });
        });

        it('reads a probe that throws synchronously as unreachable, like a rejection', () => {
            probe.mockImplementation(throwSynchronously);
            let created: ReturnType<typeof useLivenessProbe> | undefined;

            expect(() => {
                created = inScope(() => useLivenessProbe(probe, { target })).result;
            }).not.toThrow();
            return settle().then(() => {
                expect(created?.down.value).toBe(true);
            });
        });
    });

    describe('the retry chain', () => {
        it('probes once on creation and not again while reachable', () => {
            probe.mockResolvedValue({});
            inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                    jest.advanceTimersByTime(300_000);
                    return settle();
                })
                .then(() => {
                    // A reachable target is never polled twice
                    expect(probe).toHaveBeenCalledTimes(1);
                });
        });

        it('with immediate: false, probes nothing until check() is called', () => {
            const { result } = inScope(() => useLivenessProbe(probe, { immediate: false, target }));

            return settle()
                .then(() => {
                    expect(probe).not.toHaveBeenCalled();
                    return result.check();
                })
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                });
        });

        it('retries on the configured delay while down', () => {
            inScope(() => useLivenessProbe(probe, { retryDelay: 5000, target }));

            return settle()
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                    jest.advanceTimersByTime(4999);
                    return settle();
                })
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                    jest.advanceTimersByTime(1);
                    return settle();
                })
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(2);
                });
        });

        it('keeps retrying after a retry whose probe throws synchronously', async () => {
            probe
                .mockRejectedValueOnce(new Error('unreachable'))
                .mockImplementationOnce(throwSynchronously);
            inScope(() => useLivenessProbe(probe, { retryDelay: 5000, target }));
            await settle();

            // First retry: the probe throws instead of rejecting
            expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
            await settle();
            jest.advanceTimersByTime(5000);
            await settle();

            expect(probe).toHaveBeenCalledTimes(3);
        });

        /**
         * Two `online` events while down must not leave two independent chains running, each
         * spawning its own successor forever with teardown able to cancel only the last one
         * scheduled. Asserted as a probe count because that is what a network tab shows.
         */
        it('keeps exactly one retry chain across repeated online events', () => {
            inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    // Creation probe
                    expect(probe).toHaveBeenCalledTimes(1);
                    target.dispatchEvent(new Event('online'));
                    return settle();
                })
                .then(() => {
                    target.dispatchEvent(new Event('online'));
                    return settle();
                })
                .then(() => {
                    // Three probes so far: creation, and one per event
                    expect(probe).toHaveBeenCalledTimes(3);
                    jest.advanceTimersByTime(30_000);
                    return settle();
                })
                .then(() => {
                    // One retry, not three
                    expect(probe).toHaveBeenCalledTimes(4);
                });
        });

        it('ignores a slow failure that lands after a newer probe found it up', () => {
            const { promise: slow, reject: failSlow } = Promise.withResolvers<never>();
            probe.mockReturnValueOnce(slow);
            probe.mockResolvedValue({});

            const { result } = inScope(() => useLivenessProbe(probe, { target }));

            // The second probe overtakes the first, which only then fails
            target.dispatchEvent(new Event('online'));

            return settle()
                .then(() => {
                    expect(result.down.value).toBe(false);
                    failSlow(new Error('stale failure'));
                    return settle();
                })
                .then(() => {
                    // The banner must not come back up over a working connection
                    expect(result.down.value).toBe(false);
                });
        });

        it('ignores a slow success that lands after a newer probe found it down', () => {
            let succeedSlow!: () => void;
            probe.mockReturnValueOnce(
                new Promise((resolve) => {
                    succeedSlow = () => resolve({});
                })
            );

            const { result } = inScope(() => useLivenessProbe(probe, { target }));

            // The second probe overtakes the first, and fails
            target.dispatchEvent(new Event('online'));

            return settle()
                .then(() => {
                    expect(result.down.value).toBe(true);
                    succeedSlow();
                    return settle();
                })
                .then(() => {
                    // The banner must not drop over a dead connection
                    expect(result.down.value).toBe(true);
                });
        });
    });

    describe('teardown', () => {
        it('stops retrying once the owning scope is gone', () => {
            const { dispose } = inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                    dispose();
                    jest.advanceTimersByTime(120_000);
                    return settle();
                })
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                });
        });

        it('unsubscribes, so a later online event probes nothing', () => {
            const { dispose } = inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    dispose();
                    target.dispatchEvent(new Event('online'));
                    return settle();
                })
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                });
        });

        it('is idempotent, so a manual stop before teardown is harmless', () => {
            const { result, dispose } = inScope(() => useLivenessProbe(probe, { target }));

            return settle().then(() => {
                result.stop();
                result.stop();
                dispose();
                jest.advanceTimersByTime(120_000);
                expect(probe).toHaveBeenCalledTimes(1);
            });
        });

        it('leaves the flag alone when a probe outlives teardown', () => {
            const { result, dispose } = inScope(() => useLivenessProbe(probe, { target }));

            dispose();
            return settle().then(() => {
                expect(result.down.value).toBe(false);
            });
        });

        it('starts no retry chain from a check() made after teardown', async () => {
            const { result, dispose } = inScope(() =>
                useLivenessProbe(probe, { retryDelay: 5000, target })
            );
            await settle();
            dispose();

            // A late "Retry" click on a banner already unmounted
            await result.check();
            for (let retry = 0; retry < 5; retry++) {
                jest.advanceTimersByTime(5000);
                await settle();
            }

            // Creation, and at most that one explicit check: nothing retried it
            expect(probe.mock.calls.length).toBeLessThanOrEqual(2);
            expect(jest.getTimerCount()).toBe(0);
        });
    });

    describe('without an event target', () => {
        it('still probes, and simply never re-probes on its own', () => {
            // No DOM in this runner, so `globalThis` offers no `online` to subscribe to
            inScope(() => useLivenessProbe(probe));

            return settle().then(() => {
                expect(probe).toHaveBeenCalledTimes(1);
            });
        });
    });
});

/** Placeholder for a rejecter that is assigned once the probe runs. */
const noop = (): void => {};

describe('useLivenessProbe · teardown boundaries', () => {
    it('stop() cancels a pending retry: no further probe ever runs', async () => {
        const { result } = inScope(() => useLivenessProbe(probe, { retryDelay: 1000, target }));
        await settle();
        expect(probe).toHaveBeenCalledTimes(1);
        result.stop();
        await jest.advanceTimersByTimeAsync(10_000);
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it('stop() removes the online listener, and check() after stop probes nothing', async () => {
        const { result } = inScope(() => useLivenessProbe(probe, { immediate: false, target }));
        result.stop();
        target.dispatchEvent(new Event('online'));
        await result.check();
        await settle();
        expect(probe).not.toHaveBeenCalled();
    });

    it('a probe still in flight at stop() cannot write down or schedule a retry', async () => {
        let fail: (error: Error) => void = noop;
        const slow = jest.fn(() => new Promise<unknown>((_, reject) => (fail = reject)));
        const { result } = inScope(() => useLivenessProbe(slow, { retryDelay: 1000, target }));
        result.stop();
        fail(new Error('late'));
        await settle();
        await jest.advanceTimersByTimeAsync(5000);
        expect(result.down.value).toBe(false);
        expect(slow).toHaveBeenCalledTimes(1);
    });
});

describe('useLivenessProbe · no event target', () => {
    it('still probes with no target and no global addEventListener, registering nothing', async () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
        // Node has no global addEventListener; make that explicit whatever the runner provides.
        Object.defineProperty(globalThis, 'addEventListener', {
            value: undefined,
            configurable: true,
            writable: true
        });
        const spy = jest.spyOn(EventTarget.prototype, 'addEventListener');
        try {
            const { result } = inScope(() => useLivenessProbe(probe, { retryDelay: 1000 }));
            await settle();
            expect(probe).toHaveBeenCalledTimes(1);
            expect(result.down.value).toBe(true);
            expect(spy).not.toHaveBeenCalled();
            expect(() => result.stop()).not.toThrow();
        } finally {
            spy.mockRestore();
            if (original) Object.defineProperty(globalThis, 'addEventListener', original);
            else Reflect.deleteProperty(globalThis, 'addEventListener');
        }
    });
});
