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
