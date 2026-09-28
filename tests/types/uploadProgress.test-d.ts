/**
 * TYPES — useUploadProgress: `TOptions` is inferred from `buildOptions`, and flows through `track`.
 */
import { expectTypeOf } from 'expect-type';
import { useUploadProgress } from '../../src/index.js';

interface IRequestOptions {
    onUploadProgress: (fraction: number) => void;
}

const upload = useUploadProgress<IRequestOptions>((onProgress) => ({
    onUploadProgress: onProgress
}));

expectTypeOf(upload.progress.value).toEqualTypeOf<number | undefined>();
expectTypeOf(upload.track).parameter(0).parameter(0).toEqualTypeOf<IRequestOptions | undefined>();

// @ts-expect-error -- `send` must accept the built IRequestOptions, not an arbitrary shape
void upload.track((_options: { wrongShape: true }) => Promise.resolve(undefined));
