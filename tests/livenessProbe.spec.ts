/**
 * The composable's whole reason to exist is that it probes *only while down* and *slowly*. That
 * contract is invisible to types and invisible to a single-probe test: it breaks the moment two
 * retry chains exist at once, and the symptom is a background request storm nobody attributes to
 * a banner. So most of what is asserted here is the number of probes over time, not the flag.
 */
import { effectScope } from 'vue';
import { useLivenessProbe } from '../src/composables/livenessProbe';

/**
 * Lets a probe's promise chain settle without advancing the fake clock.
 *
 * Two hops rather than one: the composable's own `.then`/`.catch` is a link of its own, so a
 * single tick reads the state from before it ran.
 */
const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

/**
 * Runs the composable inside an effect scope, so the auto-teardown path is the one under test
 * rather than a manual `stop()` no consumer would remember to call.
 */
const inScope = <T>(run: () => T) => {
    const scope = effectScope();
    const result = scope.run(run) as T;
    return { result, dispose: () => scope.stop() };
};

let probe: jest.Mock<Promise<unknown>, []>;
let target: EventTarget;

beforeEach(() => {
    jest.useFakeTimers();
    probe = jest.fn<Promise<unknown>, []>().mockRejectedValue(new Error('unreachable'));
    target = new EventTarget();
});

afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
});

describe('useLivenessProbe', () => {
    describe('the flag', () => {
        it('starts up, since nothing has failed yet', () => {
            const { result, dispose } = inScope(() =>
                useLivenessProbe(probe, { immediate: false, target })
            );
            expect(result.down.value).toBe(false);
            dispose();
        });

        it('reports down after a failed probe and up again once one succeeds', () => {
            const { result, dispose } = inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    expect(result.down.value).toBe(true);
                    probe.mockResolvedValue({});
                    target.dispatchEvent(new Event('online'));
                    return settle();
                })
                .then(() => {
                    expect(result.down.value).toBe(false);
                    dispose();
                });
        });

        it('never rejects, so a caller awaiting a check cannot be caught out', () => {
            const { result, dispose } = inScope(() =>
                useLivenessProbe(probe, { immediate: false, target })
            );
            return result.check().then(() => {
                expect(result.down.value).toBe(true);
                dispose();
            });
        });
    });

    describe('the retry chain', () => {
        it('probes once on creation and not again while reachable', () => {
            probe.mockResolvedValue({});
            const { dispose } = inScope(() => useLivenessProbe(probe, { target }));

            return settle()
                .then(() => {
                    expect(probe).toHaveBeenCalledTimes(1);
                    jest.advanceTimersByTime(300_000);
                    return settle();
                })
                .then(() => {
                    // A reachable target is never polled twice
                    expect(probe).toHaveBeenCalledTimes(1);
                    dispose();
                });
        });

        it('retries on the configured delay while down', () => {
            const { dispose } = inScope(() =>
                useLivenessProbe(probe, { retryDelay: 5000, target })
            );

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
                    dispose();
                });
        });

        /**
         * Two `online` events while down must not leave two independent chains running, each
         * spawning its own successor forever with teardown able to cancel only the last one
         * scheduled. Asserted as a probe count because that is what a network tab shows.
         */
        it('keeps exactly one retry chain across repeated online events', () => {
            const { dispose } = inScope(() => useLivenessProbe(probe, { target }));

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
                    dispose();
                });
        });

        it('ignores a slow failure that lands after a newer probe found it up', () => {
            let failSlow!: (reason: unknown) => void;
            probe.mockReturnValueOnce(
                new Promise((_resolve, reject) => {
                    failSlow = reject;
                })
            );
            probe.mockResolvedValue({});

            const { result, dispose } = inScope(() => useLivenessProbe(probe, { target }));

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
                    dispose();
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
    });

    describe('without an event target', () => {
        it('still probes, and simply never re-probes on its own', () => {
            // No DOM in this runner, so `globalThis` offers no `online` to subscribe to
            const { dispose } = inScope(() => useLivenessProbe(probe));

            return settle().then(() => {
                expect(probe).toHaveBeenCalledTimes(1);
                dispose();
            });
        });
    });
});
