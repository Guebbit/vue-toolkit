/**
 * Shared test helpers for the `internal/` suite: the REST suite's client factory and flush,
 * re-exported so specs here do not build their own `QueryClient` or timer helper.
 */
export { newTestClient, flush } from '../../structureRestApi/_helpers/harness';
