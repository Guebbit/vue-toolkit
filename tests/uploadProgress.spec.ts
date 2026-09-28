import { useUploadProgress } from '../src/composables/uploadProgress';

/**
 * Stand-in for an HTTP client's per-call options: the composable only ever builds this and hands
 * it back to `send`, so a wrapper around the reporter is all a test needs.
 */
interface IFakeOptions {
    onProgress: (fraction: number) => void;
}

const buildOptions = (onProgress: (fraction: number) => void): IFakeOptions => ({ onProgress });

describe('useUploadProgress', () => {
    let composable: ReturnType<typeof useUploadProgress<IFakeOptions>>;

    beforeEach(() => {
        composable = useUploadProgress<IFakeOptions>(buildOptions);
    });

    // ─── idle state ───────────────────────────────────────────────────────────

    describe('idle state', () => {
        it('starts idle, which is not the same as zero', () => {
            expect(composable.progress.value).toBeUndefined();
            expect(composable.isUploading.value).toBe(false);
        });

        it('returns to idle after a successful upload', async () => {
            await composable.track(async () => 'done');
            expect(composable.progress.value).toBeUndefined();
            expect(composable.isUploading.value).toBe(false);
        });

        it('returns to idle after a failed upload', async () => {
            await expect(composable.track(() => Promise.reject(new Error('boom')))).rejects.toThrow(
                'boom'
            );
            expect(composable.progress.value).toBeUndefined();
        });
    });

    // ─── track ────────────────────────────────────────────────────────────────

    describe('track', () => {
        it('passes the resolved value through untouched', async () => {
            await expect(composable.track(async () => ({ id: 7 }))).resolves.toEqual({ id: 7 });
        });

        it('re-throws the original rejection reason', async () => {
            const reason = new Error('network error');
            await expect(composable.track(() => Promise.reject(reason))).rejects.toBe(reason);
        });

        it('shows the bar as soon as the request is in flight', async () => {
            let inFlight: number | undefined = -1;
            await composable.track(async () => {
                inFlight = composable.progress.value;
            });
            // 0, not undefined: the request has started and nothing has gone out yet.
            expect(inFlight).toBe(0);
        });

        it('hands the built options to send', async () => {
            const send = jest.fn().mockResolvedValue('done');
            await composable.track(send);
            expect(send).toHaveBeenCalledWith(
                expect.objectContaining({ onProgress: expect.any(Function) })
            );
        });

        it('reports progress as a percentage while the request runs', async () => {
            const seen: (number | undefined)[] = [];
            await composable.track(async (options) => {
                options?.onProgress(0.25);
                seen.push(composable.progress.value);
                options?.onProgress(1);
                seen.push(composable.progress.value);
            });
            expect(seen).toEqual([25, 100]);
        });

        it('clamps a fraction the client reported out of range', async () => {
            const seen: (number | undefined)[] = [];
            await composable.track(async (options) => {
                options?.onProgress(1.37);
                seen.push(composable.progress.value);
                options?.onProgress(-2);
                seen.push(composable.progress.value);
            });
            // A bar rendered from `width: 137%` breaks the layout rather than merely looking wrong.
            expect(seen).toEqual([100, 0]);
        });

        it('does not let an earlier overlapping call reset the bar a newer call owns', async () => {
            const { promise: first, resolve: resolveFirst } = Promise.withResolvers<void>();

            const firstCall = composable.track(() => first);
            // The second call starts while the first is still in flight.
            const secondCall = composable.track(() => new Promise<void>(() => {}));

            resolveFirst();
            await firstCall;

            // Still owned by the second, still-in-flight call — not reset by the first settling.
            expect(composable.progress.value).toBe(0);
            expect(composable.isUploading.value).toBe(true);

            void secondCall;
        });

        it('does not let a stale overlapping call report over the newer call', async () => {
            let firstOnProgress!: (fraction: number) => void;
            const { promise: first, resolve: resolveFirst } = Promise.withResolvers<void>();

            const firstCall = composable.track((options) => {
                firstOnProgress = options!.onProgress;
                return first;
            });
            void composable.track(() => new Promise<void>(() => {}));

            // The stale (first) call reports after being superseded by the second.
            firstOnProgress(0.9);
            expect(composable.progress.value).toBe(0);

            resolveFirst();
            await firstCall;
        });

        it('rejects instead of throwing when a tracked send throws synchronously', async () => {
            const send = jest.fn(() => {
                throw new Error('boom');
            });
            let tracked: Promise<unknown> | undefined;

            expect(() => {
                tracked = composable.track(send);
            }).not.toThrow();
            await expect(tracked).rejects.toThrow('boom');
        });

        it('returns to idle when a tracked send throws synchronously', async () => {
            const send = jest.fn(() => {
                throw new Error('boom');
            });

            // A submit handler runs inside a promise chain, which turns the throw into a rejection
            await expect(Promise.resolve().then(() => composable.track(send))).rejects.toThrow(
                'boom'
            );
            expect(composable.isUploading.value).toBe(false);
        });

        it('rejects, and returns to idle, when buildOptions throws', async () => {
            const throwing = useUploadProgress<IFakeOptions>(() => {
                throw new Error('bad options');
            });

            await expect(
                Promise.resolve().then(() => throwing.track(async () => 'done'))
            ).rejects.toThrow('bad options');
            expect(throwing.isUploading.value).toBe(false);
        });
    });

    // ─── enabled ──────────────────────────────────────────────────────────────

    describe('enabled', () => {
        it('skips tracking entirely, and passes no options, when disabled', async () => {
            const send = jest.fn().mockResolvedValue('done');
            const duringCall: (number | undefined)[] = [];
            send.mockImplementation(async () => {
                duringCall.push(composable.progress.value);
                return 'done';
            });

            await composable.track(send, { enabled: false });

            expect(send).toHaveBeenCalledWith();
            // Never left idle: no bar flashes to 100% for a payload measured in bytes.
            expect(duringCall).toEqual([undefined]);
        });

        it('still resolves with the value when disabled', async () => {
            await expect(composable.track(async () => 'done', { enabled: false })).resolves.toBe(
                'done'
            );
        });

        it('tracks by default', async () => {
            const send = jest.fn().mockResolvedValue('done');
            await composable.track(send, {});
            expect(send).toHaveBeenCalledWith(
                expect.objectContaining({ onProgress: expect.any(Function) })
            );
        });

        it('rejects instead of throwing when a disabled send throws synchronously', async () => {
            const send = jest.fn(() => {
                throw new Error('boom');
            });
            await expect(composable.track(send, { enabled: false })).rejects.toThrow('boom');
        });
    });

    // ─── manual control ───────────────────────────────────────────────────────

    describe('report / reset', () => {
        it('can be driven directly, for a client that reports progress its own way', () => {
            composable.report(0.5);
            expect(composable.progress.value).toBe(50);
            expect(composable.isUploading.value).toBe(true);

            composable.reset();
            expect(composable.progress.value).toBeUndefined();
        });
    });
});
